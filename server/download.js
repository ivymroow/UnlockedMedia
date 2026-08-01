const media = require('./media-finder');
const crypto = require('crypto');

const downloads = new Map();

function createDownload(infoHash, fileIndex) {
  const id = crypto.randomBytes(8).toString('hex');
  const entry = { id, infoHash, progress: 0, speed: 0, peers: 0, done: false, error: null, startTime: Date.now() };
  downloads.set(id, entry);

  const link = media.makeLink(infoHash, 'download');
  let tor;
  try { tor = media.getOrStart(link); } catch (e) { entry.error = e.message; return entry; }

  media.waitForData(tor, 15000).then(() => {
    const file = tor.files?.[fileIndex] || media.getVideo(tor);
    if (!file) { entry.error = 'No video file found'; return; }

    const track = setInterval(() => {
      entry.progress = tor.progress;
      entry.speed = tor.downloadSpeed;
      entry.peers = tor.numPeers || 0;
      if (tor.progress >= 1 || tor.done) { clearInterval(track); entry.progress = 1; entry.done = true; entry.speed = 0; }
    }, 800);

    setTimeout(() => {
      clearInterval(track);
      if (!entry.done && !entry.error) entry.error = 'Download timeout';
      if (!entry.done) { entry.done = true; try { tor.destroy(); } catch {} }
    }, 480000);
  }).catch(e => { entry.error = e.message; entry.done = true; });

  return entry;
}

function getStatus(id) {
  const entry = downloads.get(id);
  if (!entry) return null;
  return { id: entry.id, progress: entry.progress, speed: entry.speed, peers: entry.peers, done: entry.done, error: entry.error, elapsed: Date.now() - entry.startTime };
}

function cleanup(id) { downloads.delete(id); }

module.exports = { createDownload, getStatus, cleanup };
