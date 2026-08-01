const { transcodeBuffer } = require('./transcode');
const media = require('./media-finder');
const debrid = require('./debrid');
const crypto = require('crypto');
const axios = require('axios');

const downloads = new Map();

function createDownload(infoHash, fileIndex) {
  const id = crypto.randomBytes(8).toString('hex');
  const entry = { id, infoHash, fileIndex, progress: 0, speed: 0, done: false, transcoding: false, error: null, buffer: null, subData: null, startTime: Date.now() };
  downloads.set(id, entry);

  if (!debrid.getKey()) {
    entry.error = 'No RD key configured. Add it in Settings.';
    return entry;
  }

  (async () => {
    try {
      const magnet = media.makeLink(infoHash, 'download');
      const torrentId = await debrid.addMagnet(magnet);

      let info = await debrid.getInfo(torrentId);
      if (info.status !== 'downloaded') {
        await debrid.selectFiles(torrentId, 'all');
        info = await debrid.waitForDownload(torrentId);
      }

      const files = info.links || [];
      const exts = ['mp4', 'mkv', 'webm', 'avi', 'mov'];
      let vidFile = null, subFiles = [];
      for (let i = 0; i < files.length; i++) {
        const name = (files[i].filename || files[i] || '').toLowerCase();
        if (!vidFile && exts.some(e => name.endsWith('.' + e))) vidFile = i;
        if (['.srt', '.vtt', '.sub', '.ass', '.ssa'].some(e => name.endsWith(e))) subFiles.push(i);
      }
      if (vidFile === null) vidFile = Math.min(fileIndex, files.length - 1);

      // Download subtitles if any
      if (subFiles.length) {
        const subIdx = subFiles[0];
        const subLink = files[subIdx]?.download || files[subIdx];
        const direct = await debrid.unrestrict(subLink);
        const { data: subText } = await axios.get(direct, { responseType: 'text', timeout: 30000 });
        entry.subData = subText;
      }

      // Download video
      const vidLink = files[vidFile]?.download || files[vidFile];
      const directUrl = await debrid.unrestrict(vidLink);

      const chunks = [];
      const { data: stream, headers } = await axios.get(directUrl, { responseType: 'stream', timeout: 600000 });
      const total = parseInt(headers['content-length']) || 0;
      let received = 0;
      const startTime = Date.now();

      stream.on('data', chunk => {
        chunks.push(chunk);
        received += chunk.length;
        const elapsed = (Date.now() - startTime) / 1000;
        entry.progress = total ? received / total : 0;
        entry.speed = elapsed > 0 ? received / elapsed : 0;
      });

      await new Promise((resolve, reject) => {
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      const rawBuf = Buffer.concat(chunks);
      entry.transcoding = true;
      entry.buffer = transcodeBuffer ? await transcodeBuffer(rawBuf) : rawBuf;
      entry.transcoding = false;
      entry.done = true;
      entry.progress = 1;
    } catch (e) {
      entry.error = e.message || 'Download failed';
    }
  })();

  return entry;
}

function getStatus(id) {
  const entry = downloads.get(id);
  if (!entry) return null;
  return {
    id: entry.id, progress: entry.progress, speed: entry.speed,
    done: entry.done, transcoding: entry.transcoding,
    error: entry.error, elapsed: Date.now() - entry.startTime,
    hasSubs: !!entry.subData,
  };
}

function getFile(id) {
  const entry = downloads.get(id);
  if (!entry || !entry.done) return null;
  return entry.buffer;
}

function getSubtitles(id) {
  const entry = downloads.get(id);
  if (!entry?.subData) return null;
  const text = entry.subData;
  if (text.startsWith('WEBVTT')) return text;
  return 'WEBVTT\n\n' + text.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
}

function cleanup(id) {
  const entry = downloads.get(id);
  if (entry) { entry.buffer = null; entry.subData = null; downloads.delete(id); }
}

module.exports = { createDownload, getStatus, getFile, getSubtitles, cleanup };
