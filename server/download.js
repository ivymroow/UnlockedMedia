const { transcodeBuffer } = require('./transcode');
const media = require('./media-finder');
const crypto = require('crypto');

const downloads = new Map();

function createDownload(infoHash, fileIndex) {
  const id = crypto.randomBytes(8).toString('hex');
  const entry = { id, infoHash, fileIndex, progress: 0, speed: 0, done: false, transcoding: false, error: null, buffer: null, subData: null, startTime: Date.now() };
  downloads.set(id, entry);

  const link = media.makeLink(infoHash, 'download');
  let tor;
  try { tor = media.getOrStart(link); } catch (e) { entry.error = e.message; return entry; }

  media.waitForData(tor, 15000).then(() => {
    const file = tor.files?.[fileIndex] || media.getVideo(tor);
    if (!file) { entry.error = 'No video file found'; return; }

    const interval = setInterval(() => {
      entry.progress = tor.progress;
      entry.speed = tor.downloadSpeed;
      if (tor.progress >= 1 || tor.done) {
        clearInterval(interval);
        finalizeDownload(entry, file, tor);
      }
    }, 800);

    setTimeout(() => {
      clearInterval(interval);
      if (!entry.done && !entry.error) { entry.error = 'Download timeout'; try { tor.destroy(); } catch {} }
    }, 480000);
  }).catch(e => { entry.error = e.message; });

  return entry;
}

async function finalizeDownload(entry, file, tor) {
  try {
    const chunks = [];
    const ws = file.createReadStream();
    for await (const chunk of ws) chunks.push(chunk);
    const rawBuf = Buffer.concat(chunks);
    try { tor.destroy(); } catch {}

    // Extract subtitles if present
    const subFiles = (tor.files || []).filter(f => ['.srt', '.vtt', '.sub', '.ass', '.ssa'].some(e => (f.name || '').toLowerCase().endsWith(e)));
    if (subFiles.length) {
      try {
        const schunks = []; const sws = subFiles[0].createReadStream();
        for await (const c of sws) schunks.push(c);
        entry.subData = Buffer.concat(schunks).toString('utf8');
      } catch {}
    }

    entry.transcoding = true;
    entry.buffer = transcodeBuffer ? await transcodeBuffer(rawBuf) : rawBuf;
    entry.transcoding = false;
    entry.done = true;
    entry.progress = 1;
  } catch (e) { entry.error = e.message; entry.transcoding = false; }
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
