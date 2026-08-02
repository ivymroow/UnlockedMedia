const express = require('express');
const downloads = require('../services/downloads');
const torrent = require('../services/torrent');
const streaming = require('../services/streaming');
const { asyncHandler } = require('../middleware/errors');
const { requireBody } = require('../middleware/validation');

const router = express.Router();

router.post('/download', requireBody('hash'), (req, res) => {
  const download = downloads.createDownload(req.body.hash, Number(req.body.fileIndex) || 0);
  res.json({ id: download.id, error: download.error });
});

router.get('/download/:id/status', (req, res) => {
  const status = downloads.getStatus(req.params.id);
  if (!status) return res.status(404).json({ error: 'Download not found' });
  res.json(status);
});

router.get('/download/:id/file', (req, res) => {
  res.status(410).json({ error: 'Use /api/stream/:hash instead' });
});

router.post('/race', requireBody('sources'), asyncHandler(async (req, res) => {
  const candidates = req.body.sources.slice(0, 5);

  try {
    const winner = await Promise.any(candidates.map((source, index) => new Promise(async (resolve, reject) => {
      try {
        const stream = torrent.getOrStart(torrent.makeLink(source.hash, 'race'));
        await torrent.waitForData(stream, 10_000);
        if (stream.numPeers > 0 || stream.downloadSpeed > 0 || stream.progress > 0) {
          resolve({ index, hash: source.hash, fileIndex: source.fileIndex || 0 });
          return;
        }
        await Promise.race([
          new Promise(done => {
            stream.once('wire', done);
            stream.once('download', done);
          }),
          new Promise((_, fail) => setTimeout(fail, 5000)),
        ]);
        if (stream.numPeers > 0 || stream.downloadSpeed > 0) resolve({ index, hash: source.hash, fileIndex: source.fileIndex || 0 });
        else reject(new Error('No peers'));
      } catch (error) {
        reject(error);
      }
    })));

    const download = downloads.createDownload(winner.hash, winner.fileIndex);
    res.json({ found: true, id: download.id, hash: winner.hash, error: download.error });
  } catch {
    res.status(404).json({ error: 'No viable source found' });
  }
}));

router.get('/stream/check/:infoHash', asyncHandler(async (req, res) => {
  const stream = torrent.getOrStart(torrent.makeLink(req.params.infoHash, 'stream'));
  if (!stream.files?.length) {
    torrent.waitForData(stream, 8000).catch(() => {});
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  res.json({
    added: true,
    ready: !!stream.files?.length,
    name: stream.name || 'Unknown',
    progress: stream.progress || 0,
    peers: stream.numPeers || 0,
    speed: stream.downloadSpeed || 0,
    files: stream.files?.map(file => ({ name: file.name, length: file.length })),
  });
}));

router.get('/stream/magnet', asyncHandler(async (req, res) => {
  const { magnet } = req.query;
  const fileIndex = Number(req.query.fileIndex) || 0;
  if (!magnet) return res.status(400).json({ error: 'Magnet required' });

  const stream = torrent.getOrStart(magnet);
  await torrent.waitForData(stream, 25_000);
  const file = stream.files?.[fileIndex] || torrent.getVideo(stream);
  if (!file) return res.status(404).json({ error: `No video file found. Files: ${stream.files?.map(item => item.name).join(', ') || 'none'}` });
  torrent.sendFile(file, req, res);
}));

router.get('/stream/:infoHash', asyncHandler(async (req, res) => {
  await streaming.streamInfoHash(req.params.infoHash, Number(req.query.fileIndex) || 0, req, res);
}));

router.get('/subtitles/:infoHash/list', asyncHandler(async (req, res) => {
  try {
    const tracks = await streaming.listSubtitles(req.params.infoHash);
    res.json({ tracks: tracks.map(file => ({ name: file.name, length: file.length })) });
  } catch {
    res.json({ tracks: [] });
  }
}));

router.get('/subtitles/:infoHash/:index', asyncHandler(async (req, res) => {
  const text = await streaming.getSubtitle(req.params.infoHash, req.params.index);
  if (!text) return res.status(404).json({ error: 'Not found' });
  res.set('Content-Type', 'text/vtt; charset=utf-8');
  res.send(text);
}));

module.exports = router;
