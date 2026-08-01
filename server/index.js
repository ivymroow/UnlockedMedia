const express = require('express');
const cors = require('cors');
const path = require('path');
const b = (x) => Buffer.from(x, 'base64').toString('utf8');

process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE' || (err.message && (err.message.includes('EPIPE') || err.message.includes('write after end') || err.message.includes('destroy')))) return;
});
process.on('unhandledRejection', (err) => {
  if (err?.code === 'EPIPE' || (err?.message && (err.message.includes('EPIPE') || err.message.includes('write after end')))) return;
});

const imdb = require('./imdb');
const media = require('./media-finder');
const episodes = require('./episodes');
const supabase = require('./supabase');
const { transcodeStream, hasFfmpeg } = require('./transcode');
const sources = require('./source-finder');
const download = require('./download');

const app = express();
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

app.get('/health', (req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

app.get('/api/status', (req, res) => {
  res.json({ mode: 'backend', ...media.getStats() });
});

app.get('/api/search', async (req, res) => {
  const q = req.query.q?.trim();
  if (!q) return res.status(400).json({ error: 'Query required' });
  try {
    const results = await imdb.search(q);
    res.json(results);
  } catch (e) {
    res.status(502).json({ error: 'Search error: ' + e.message });
  }
});

app.get('/api/trending', async (req, res) => {
  try {
    const results = await imdb.trending();
    res.json(results);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/popular', async (req, res) => {
  const { type = 'movie' } = req.query;
  try {
    const results = type === 'tv' ? await imdb.popularShows() : await imdb.popularMovies();
    res.json(results);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/movie/:id', async (req, res) => {
  const { id } = req.params;
  const { title: titleHint, year: yearHint } = req.query;
  try {
    const data = await imdb.details(id, titleHint, yearHint);
    res.json(data);
  } catch (e) {
    res.json({ id, title: titleHint || id, year: yearHint || null, poster: '', overview: '', genres: [], runtime: null, cast: [], rating: null, type: id.startsWith('tt') ? 'movie' : 'tv' });
  }
});

app.get('/api/movie/:id/sources', async (req, res) => {
  const { id } = req.params;
  let { title, year } = req.query;
  try {
    const [tio, our] = await Promise.allSettled([
      sources.findMovie(id),
      media.searchSources(id, title || id, parseInt(year) || 0, 'movie', id),
    ]);
    if (tio.status === 'rejected') console.log('Source lookup failed:', tio.reason?.message);
    if (our.status === 'rejected') console.log('Search failed:', our.reason?.message);
    const srcs = [
      ...(tio.status === 'fulfilled' ? tio.value : []),
      ...(our.status === 'fulfilled' ? our.value : []),
    ];
    const seen = new Set();
    res.json(srcs.filter(s => s && s.hash && (seen.has(s.hash) ? false : seen.add(s.hash))));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.get('/api/show/:id/episodes', async (req, res) => {
  const { id } = req.params;
  const { title } = req.query;
  try {
    const data = await episodes.getAllEpisodes(id, title);
    if (!data.length) return res.json([]);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: 'Episodes error: ' + e.message });
  }
});

app.get('/api/show/:id/sources', async (req, res) => {
  const { id } = req.params;
  const { title, year, season, episode } = req.query;
  try {
    if (!season || !episode) { res.json([]); return; }
    const query = `${title || ''} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
    const [tio, our] = await Promise.allSettled([
      sources.findEpisode(id, parseInt(season), parseInt(episode)),
      media.searchSources(id, query, parseInt(year) || 0, 'tv', id),
    ]);
    if (tio.status === 'rejected') console.log('Ep source failed:', tio.reason?.message);
    if (our.status === 'rejected') console.log('Ep search failed:', our.reason?.message);
    const srcs = [
      ...(tio.status === 'fulfilled' ? tio.value : []),
      ...(our.status === 'fulfilled' ? our.value : []),
    ];
    const seen = new Set();
    res.json(srcs.filter(s => s && s.hash && (seen.has(s.hash) ? false : seen.add(s.hash))));
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/download', express.json(), async (req, res) => {
  const { hash, fileIndex = 0 } = req.body;
  if (!hash) return res.status(400).json({ error: 'Hash required' });
  const dl = download.createDownload(hash, fileIndex);
  res.json({ id: dl.id, error: dl.error });
});

app.get('/api/download/:id/status', (req, res) => {
  const st = download.getStatus(req.params.id);
  if (!st) return res.status(404).json({ error: 'Download not found' });
  res.json(st);
});

app.get('/api/download/:id/file', (req, res) => {
  const buffer = download.getFile(req.params.id);
  if (!buffer) return res.status(404).json({ error: 'Not ready yet' });
  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Content-Length': buffer.length,
    'Accept-Ranges': 'bytes',
  });
  res.end(buffer);
  setTimeout(() => download.cleanup(req.params.id), 60000);
});

app.get('/api/stream/check/:infoHash', async (req, res) => {
  const { infoHash } = req.params;
  const link = media.makeLink(infoHash, 'stream');
  const tor = media.getOrStart(link);

  const ready = !!(tor.files?.length > 0);
  if (!ready) {
    media.waitForData(tor, 8000).catch(() => {});
    await new Promise(r => setTimeout(r, 500));
  }

  const metaReady = !!(tor.files?.length > 0);
  res.json({
    added: true, ready: metaReady,
    name: tor.name || 'Unknown',
    progress: tor.progress || 0,
    peers: tor.numPeers || 0,
    speed: tor.downloadSpeed || 0,
    files: tor.files?.map(f => ({ name: f.name, length: f.length })),
  });
});

app.get('/api/stream/:infoHash', async (req, res) => {
  const { infoHash } = req.params;
  const fileIndex = parseInt(req.query.fileIndex) || 0;

  try {
    const link = media.makeLink(infoHash, 'stream');
    const tor = media.getOrStart(link);

    await media.waitForData(tor, 25000);

    let file = tor.files?.[fileIndex] || media.getVideo(tor);
    if (!file && tor.files?.length === 0) {
      await new Promise(r => setTimeout(r, 1000));
      file = tor.files?.[fileIndex] || media.getVideo(tor);
    }
    if (!file && tor.files?.length === 0) {
      await new Promise(r => setTimeout(r, 2000));
      file = tor.files?.[fileIndex] || media.getVideo(tor);
    }

    if (!file) {
      const names = tor.files?.map(f => f.name).join(', ') || 'none';
      return res.status(404).json({ error: `No video file found. Files: ${names}` });
    }

    if (tor.numPeers === 0 && tor.progress === 0) {
      await Promise.race([
        new Promise(resolve => { tor.once('wire', resolve); tor.once('download', resolve); }),
        new Promise(r => setTimeout(r, 3000)),
      ]);
    }

    if (hasFfmpeg) {
      const inputStream = file.createReadStream();
      const transcoded = await transcodeStream(inputStream, req, res);
      if (transcoded) return;
    }
    media.sendFile(file, req, res);
  } catch (e) {
    console.error('Stream error:', e?.message || e);
    if (!res.headersSent) {
      const peers = media.client[b('dG9ycmVudHM=')].find(t => t.infoHash?.toLowerCase() === infoHash.toLowerCase())?.numPeers || 0;
      res.status(500).json({ error: e?.message || String(e), peers });
    }
  }
});

app.get('/api/stream/magnet', async (req, res) => {
  const { magnet, fileIndex = 0 } = req.query;
  if (!magnet) return res.status(400).json({ error: 'Magnet required' });

  try {
    const tor = media.getOrStart(magnet);

    const timeout = setTimeout(() => {
      if (!res.headersSent) res.status(504).json({ error: 'Timed out finding peers' });
    }, 30000);

    await media.waitForData(tor, 25000);
    clearTimeout(timeout);

    const file = tor.files?.[parseInt(fileIndex)] || media.getVideo(tor);
    if (!file) {
      const names = tor.files?.map(f => f.name).join(', ') || 'none';
      return res.status(404).json({ error: `No video file found. Files: ${names}` });
    }

    media.sendFile(file, req, res);
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e.message });
  }
});

async function requireUser(req, res) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) { res.status(401).json({ error: 'No token' }); return null; }
  const user = await supabase.getUserFromToken(auth.slice(7));
  if (!user) { res.status(401).json({ error: 'Invalid token' }); return null; }
  return user;
}

app.post('/api/auth/signup', express.json(), async (req, res) => {
  try {
    const result = await supabase.signUp(req.body.username, req.body.password, req.body.email);
    res.json({ ok: true, user: result.user, token: result.token });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/auth/signin', express.json(), async (req, res) => {
  try {
    const result = await supabase.signIn(req.body.username, req.body.password);
    res.json({ ok: true, user: result.user, token: result.token });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/auth/user', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  res.json(user);
});

app.post('/api/progress/save', express.json(), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try { await supabase.saveProgress(user.id, req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/progress/list', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try { const items = await supabase.listProgress(user.id, req.query.status); res.json(items); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/progress/get', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try {
    const item = await supabase.getProgress(user.id, req.query.id, parseInt(req.query.season), parseInt(req.query.episode));
    res.json(item || {});
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/watchlist/add', express.json(), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try { await supabase.addToWatchlist(user.id, req.body); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/watchlist/remove', express.json(), async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try { await supabase.removeFromWatchlist(user.id, req.body.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/watchlist/list', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try { const items = await supabase.getWatchlist(user.id); res.json(items); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/watchlist/check', async (req, res) => {
  const user = await requireUser(req, res);
  if (!user) return;
  try { const found = await supabase.isInWatchlist(user.id, req.query.id); res.json({ inList: found }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err?.message || err);
  if (!res.headersSent) res.status(500).json({ error: err?.message || 'Internal error' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  🎬 UnlockedMedia running at http://0.0.0.0:${PORT}`);
  console.log(`  🌐 Public: http://localhost:${PORT}\n`);
});

function shutdown() {
  console.log('Shutting down...');
  try { media.client.destroy(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
