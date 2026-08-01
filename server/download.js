const stream = require('./media-finder');
const { transcodeBuffer } = require('./transcode');
const crypto = require('crypto');

const downloads = new Map();

function createDownload(infoHash, fileIndex) {
  const id = crypto.randomBytes(8).toString('hex');
  const entry = { id, infoHash, fileIndex, progress: 0, speed: 0, peers: 0, done: false, error: null, buffer: null, startTime: Date.now() };
  downloads.set(id, entry);

  const link = stream.makeLink(infoHash, 'download');
  let tor;
  try {
    tor = stream.getOrStart(link);
  } catch (e) {
    entry.error = e.message;
    return entry;
  }

  stream.waitForData(tor, 40000).then(() => {
    const file = tor.files?.[fileIndex] || stream.getVideo(tor);
    if (!file) {
      entry.error = 'No video file found';
      return;
    }

    const interval = setInterval(() => {
      entry.progress = tor.progress;
      entry.speed = tor.downloadSpeed;
      entry.peers = tor.numPeers || 0;
      if (tor.progress >= 1 || tor.done) {
        clearInterval(interval);
        finalizeDownload(entry, file, tor);
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(interval);
      if (!entry.done && !entry.error) {
        entry.error = 'Download timeout (10 min)';
        try { tor.destroy(); } catch {}
      }
    }, 600000);
  }).catch(e => {
    entry.error = e.message;
  });

  return entry;
}

async function finalizeDownload(entry, file, tor) {
  try {
    const chunks = [];
    const ws = file.createReadStream();
    for await (const chunk of ws) chunks.push(chunk);
    const rawBuf = Buffer.concat(chunks);
    try { tor.destroy(); } catch {}

    if (transcodeBuffer) {
      entry.buffer = await transcodeBuffer(rawBuf);
    } else {
      entry.buffer = rawBuf;
    }
    entry.done = true;
    entry.progress = 1;
  } catch (e) {
    entry.error = e.message;
  }
}

function getStatus(id) {
  const entry = downloads.get(id);
  if (!entry) return null;
  return {
    id: entry.id, progress: entry.progress, speed: entry.speed,
    peers: entry.peers, done: entry.done, error: entry.error,
    elapsed: Date.now() - entry.startTime,
  };
}

function getFile(id) {
  const entry = downloads.get(id);
  if (!entry || !entry.done) return null;
  return entry.buffer;
}

function cleanup(id) {
  const entry = downloads.get(id);
  if (entry) { entry.buffer = null; downloads.delete(id); }
}

module.exports = { createDownload, getStatus, getFile, cleanup };
