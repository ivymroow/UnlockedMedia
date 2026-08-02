const media = require('./media-finder');
const crypto = require('crypto');
const env = require('./config/env');

const downloads = new Map();

function finish(entry, error) {
  if (error) entry.error = error;
  entry.done = true;
  entry.speed = 0;
  if (entry.trackTimer) clearInterval(entry.trackTimer);
  if (entry.timeoutTimer) clearTimeout(entry.timeoutTimer);
  entry.cleanupTimer = setTimeout(() => downloads.delete(entry.id), env.downloadRetentionMs);
  entry.cleanupTimer.unref?.();
}

function createDownload(infoHash, fileIndex) {
  const id = crypto.randomBytes(8).toString('hex');
  const entry = { id, infoHash, progress: 0, speed: 0, peers: 0, done: false, error: null, startTime: Date.now() };
  downloads.set(id, entry);

  const link = media.makeLink(infoHash, 'download');
  let tor;
  try { tor = media.getOrStart(link); } catch (e) { finish(entry, e.message); return entry; }

  media.waitForData(tor, 15000).then(() => {
    const file = tor.files?.[fileIndex] || media.getVideo(tor);
    if (!file) { finish(entry, 'No video file found'); return; }

    entry.trackTimer = setInterval(() => {
      entry.progress = tor.progress;
      entry.speed = tor.downloadSpeed;
      entry.peers = tor.numPeers || 0;
      if (tor.progress >= 1 || tor.done) {
        entry.progress = 1;
        finish(entry);
      }
    }, 800);
    entry.trackTimer.unref?.();

    entry.timeoutTimer = setTimeout(() => {
      if (!entry.done) {
        finish(entry, 'Download timeout');
        try { tor.destroy(); } catch {}
      }
    }, env.downloadTimeoutMs);
    entry.timeoutTimer.unref?.();
  }).catch(e => finish(entry, e.message));

  return entry;
}

function getStatus(id) {
  const entry = downloads.get(id);
  if (!entry) return null;
  return { id: entry.id, progress: entry.progress, speed: entry.speed, peers: entry.peers, done: entry.done, error: entry.error, elapsed: Date.now() - entry.startTime };
}

function cleanup(id) {
  const entry = downloads.get(id);
  if (entry?.trackTimer) clearInterval(entry.trackTimer);
  if (entry?.timeoutTimer) clearTimeout(entry.timeoutTimer);
  if (entry?.cleanupTimer) clearTimeout(entry.cleanupTimer);
  downloads.delete(id);
}

function cleanupAll() {
  for (const id of downloads.keys()) cleanup(id);
}

module.exports = { createDownload, getStatus, cleanup, cleanupAll };
