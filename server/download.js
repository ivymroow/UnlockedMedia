const { transcodeStreamToFile } = require('./transcode');
const media = require('./media-finder');
const r2 = require('./r2');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const downloads = new Map();
const TMP = process.env.TMPDIR || os.tmpdir();

try {
  const files = fs.readdirSync(TMP);
  for (const f of files) if (f.startsWith('ws-')) try { fs.unlinkSync(path.join(TMP, f)); } catch {}
} catch {}

function createDownload(infoHash, fileIndex) {
  const id = crypto.randomBytes(8).toString('hex');
  const outPath = path.join(TMP, `ws-${id}.mp4`);
  const entry = { id, infoHash, fileIndex, progress: 0, speed: 0, done: false, error: null, filePath: outPath, r2Url: null, subData: null, startTime: Date.now() };
  downloads.set(id, entry);

  const link = media.makeLink(infoHash, 'download');
  let tor;
  try { tor = media.getOrStart(link); } catch (e) { entry.error = e.message; return entry; }

  media.waitForData(tor, 15000).then(async () => {
    const file = tor.files?.[fileIndex] || media.getVideo(tor);
    if (!file) { entry.error = 'No video file found'; return; }

    const track = setInterval(() => {
      entry.progress = tor.progress;
      entry.speed = tor.downloadSpeed;
    }, 800);

    setTimeout(() => {
      clearInterval(track);
      if (!entry.done && !entry.error) { entry.error = 'Download timeout'; try { tor.destroy(); } catch {}; try { fs.unlinkSync(outPath); } catch {} }
    }, 480000);

    try {
      await transcodeStreamToFile(file.createReadStream(), outPath);
      try { tor.destroy(); } catch {}

      // Extract subtitles
      const subFiles = (tor.files || []).filter(f => ['.srt', '.vtt', '.sub', '.ass', '.ssa'].some(e => (f.name || '').toLowerCase().endsWith(e)));
      if (subFiles.length) {
        try {
          const chunks = [], stream = subFiles[0].createReadStream();
          for await (const c of stream) chunks.push(c);
          entry.subData = Buffer.concat(chunks).toString('utf8');
        } catch {}
      }

      // Upload to R2 if configured
      if (r2.configured()) {
        try {
          entry.r2Url = await r2.uploadFile(outPath, infoHash);
          try { fs.unlinkSync(outPath); } catch {}
          entry.filePath = null;
        } catch (e) { console.log('R2 upload failed:', e.message); }
      }

      entry.done = true;
      entry.progress = 1;
    } catch (e) {
      entry.error = e.message;
      try { fs.unlinkSync(outPath); } catch {}
    }
  }).catch(e => { entry.error = e.message; });

  return entry;
}

function getStatus(id) {
  const entry = downloads.get(id);
  if (!entry) return null;
  return {
    id: entry.id, progress: entry.progress, speed: entry.speed,
    done: entry.done, error: entry.error,
    elapsed: Date.now() - entry.startTime,
    hasSubs: !!entry.subData, hasR2: !!entry.r2Url,
  };
}

function getFile(id) {
  const entry = downloads.get(id);
  if (!entry || !entry.done) return null;
  // Return R2 URL if available, otherwise local path
  if (entry.r2Url) return { url: entry.r2Url, r2: true };
  if (entry.filePath) return { url: entry.filePath, r2: false };
  return null;
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
  if (entry) {
    if (entry.filePath) try { fs.unlinkSync(entry.filePath); } catch {}
    entry.filePath = null; entry.subData = null; downloads.delete(id);
  }
}

module.exports = { createDownload, getStatus, getFile, getSubtitles, cleanup };
