const axios = require('axios');
const StreamEngine = require('s-engine');
const cache = require('./cache');

const os = require('os');
const path = require('path');
const fs = require('fs');
const MemStore = require('s-store');

const client = new StreamEngine({
  maxConns: 50,
  dht: false,
  tracker: true,
  store: chunkLength => new MemStore(chunkLength),
});

const _d = (s) => Buffer.from(s, 'base64').toString('utf8');
const ANNOUNCERS = [
  _d('aHR0cDovL3RyYWNrZXIub3BlbmJpdHRvcnJlbnQuY29tOjgwL2Fubm91bmNl'),
  _d('aHR0cDovL3RyYWNrZXIyLml0em14LmNvbTo2OTYxL2Fubm91bmNl'),
  _d('aHR0cDovL29wZW4uYWNnY250cmFja2VyLmNvbTo4MC9hbm5vdW5jZQ=='),
  _d('dWRwOi8vdHJhY2tlci5vcGVudHJhY2tyLm9yZzoxMzM3L2Fubm91bmNl'),
  _d('dWRwOi8vdHJhY2tlci5jb3BwZXJzdXJmZXIudGs6Njk2OS9hbm5vdW5jZQ=='),
  _d('dWRwOi8vdHJhY2tlci5sZWVjaGVycy1wYXJhZGlzZS5vcmc6Njk2OS9hbm5vdW5jZQ=='),
  _d('dWRwOi8vdHJhY2tlci5pbnRlcm5ldHdhcnJpb3JzLm5ldDoxMzM3L2Fubm91bmNl'),
  _d('d3NzOi8vdHJhY2tlci53ZWJ0b3JyZW50LmRldg=='),
  _d('d3NzOi8vdHJhY2tlci5vcGVud2VidG9ycmVudC5jb20='),
];

function makeLink(hash, name) {
  const attendees = ANNOUNCERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}&${attendees}`;
}

const Y_DOMAINS = ['yts.lt', 'yts.ag', 'yts.mx'];

async function searchY(title, year, imdbId) {
  const q = imdbId || title;
  for (const domain of Y_DOMAINS) {
    try {
      const { data } = await axios.get(`https://${domain}/api/v2/list_movies.json`, {
        params: { query_term: q, limit: 10, quality: 'all' },
        timeout: 8000,
      });
      if (data?.data?.movies) {
        const sources = [];
        for (const movie of data.data.movies) {
          if (!imdbId && year && movie.year !== year) continue;
          for (const t of (movie[_d('dG9ycmVudHM=')] || [])) {
            sources.push({
              provider: 'YTS', quality: t.quality || extractQuality(t.url || ''),
              size: t.size, seeds: t.seeds || 0, peers: t.peers || 0,
              hash: t.hash, link: makeLink(t.hash, `${title} ${t.quality || 'Unknown'}`),
            });
          }
        }
        if (sources.length) return sources;
      }
    } catch {}
  }
  return [];
}

function extractQuality(name) {
  if (!name) return 'Unknown';
  const m = name.match(/(\d{3,4}p)/i);
  if (m) return m[1].toUpperCase();
  if (name.match(/4K|2160/i)) return '4K';
  if (name.match(/1080|bluray|web.dl|hdrip/i)) return '1080p';
  if (name.match(/720/i)) return '720p';
  if (name.match(/480/i)) return '480p';
  return 'Unknown';
}

async function searchEz(title, year, imdbId) {
  if (!imdbId) return [];
  const epMatch = title.match(/S(\d+)E(\d+)/i);
  const episodeCode = epMatch ? `S${epMatch[1].padStart(2,'0')}E${epMatch[2].padStart(2,'0')}` : '';
  const showTitle = title.replace(/S\d+E\d+/i, '').trim();
  try {
    const { data } = await axios.get(`https://eztvx.to/api/` + _d('Z2V0LXRvcnJlbnRz') + `?imdb_id=${imdbId}`, { timeout: 8000 });
    if (data?.[_d('dG9ycmVudHM=')]) {
      const results = [];
      for (const t of data[_d('dG9ycmVudHM=')]) {
        const name = t.filename || t.title || '';
        const nameLower = name.toLowerCase();

        if (episodeCode && !nameLower.includes(episodeCode.toLowerCase())) continue;

        const titleWords = showTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const matchCount = titleWords.filter(w => nameLower.includes(w)).length;
        if (titleWords.length > 0 && matchCount < Math.ceil(titleWords.length * 0.5)) continue;

        const quality = extractQuality(name);
        results.push({
          provider: 'EZTV', quality,
          size: t.size || t.size_bytes || '',
          seeds: t.seeds || 0, peers: t.peers || 0,
          hash: t.hash, link: t.magnet_url || makeLink(t.hash, name || title),
        });
      }
      return results;
    }
  } catch {}
  return [];
}

const P_DOMAINS = ['apibay.org', 'thepiratebay.org', 'apibay.net'];
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

function pbQuery(s) {
  return s.trim().replace(/\s+/g, '+').replace(/[^a-zA-Z0-9+]/g, '');
}

function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

async function searchPb(title, year, imdbId) {
  const queries = [
    pbQuery(title),
    pbQuery(title.replace(/S\d+E\d+/i, '').trim()),
  ];
  const domains = [...P_DOMAINS].sort(() => Math.random() - 0.5);

  for (const domain of domains) {
    for (const q of queries) {
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));
      try {
        const { data } = await axios.get(`https://${domain}/q.php?q=${q}`, {
          timeout: 6000, headers: { 'User-Agent': randomUA(), 'Accept': 'application/json,text/html,*/*' },
        });
        if (Array.isArray(data) && data.length) {
          const items = data.filter(i => i.name && i.info_hash).slice(0, 8);
          if (items.length) return items.map(i => ({
            provider: 'TPB', quality: extractQuality(i.name),
            size: i.size ? `${(i.size / 1073741824).toFixed(1)} GB` : '',
            seeds: parseInt(i.seeders) || 0, peers: parseInt(i.leechers) || 0,
            hash: i.info_hash, link: makeLink(i.info_hash, i.name),
          }));
        }
      } catch {}
    }
  }
  return [];
}

async function searchSources(tmdbId, title, year, mediaType = 'movie', imdbId = '') {
  const key = `s:${tmdbId || imdbId}:${title}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let sources = [];

  if (mediaType === 'movie') {
    const [ytsIMDb, ytsTitle, tpb] = await Promise.all([
      searchY(title, year, imdbId),
      imdbId ? searchY(title, year, '') : Promise.resolve([]),
      searchPb(title, year, imdbId),
    ]);
    sources = [...ytsIMDb, ...ytsTitle, ...tpb];
  } else {
    const epCode = title.match(/S\d+E\d+/i)?.[0] || '';
    const [eztvResults, tpbResults] = await Promise.all([
      searchEz(title, year, imdbId),
      searchPb(title, year, imdbId),
    ]);
    sources = [...eztvResults, ...tpbResults];
  }

  const qualRank = { '4K': 5, '1080p': 4, '720p': 3, '480p': 2, 'Unknown': 1 };
  sources.sort((a, b) => {
    const qa = qualRank[a.quality] || 1, qb = qualRank[b.quality] || 1;
    if (qa !== qb) return qb - qa;
    return (b.seeds || 0) - (a.seeds || 0);
  });

  const seen = new Set();
  sources = sources.filter(s => { const k = s.hash; if (seen.has(k)) return false; seen.add(k); return true; });

  if (sources.length) cache.set(key, sources, 'source');
  return sources.slice(0, 8);
}

const streamPool = new Map();

function getOrStart(link) {
  const hashMatch = link.match(/urn:btih:([a-fA-F0-9]+)/);
  const infoHash = hashMatch ? hashMatch[1].toLowerCase() : '';

  let existing = client[_d('dG9ycmVudHM=')].find(t => t.infoHash?.toLowerCase() === infoHash);
  if (existing) {
    existing._lastUsed = Date.now();
    streamPool.set(link.toLowerCase(), existing);
    return existing;
  }

  const cached = streamPool.get(link.toLowerCase());
  if (cached) {
    cached._lastUsed = Date.now();
    return cached;
  }

  let stream;
  try {
    stream = client.add(link, { strategy: 'sequential' });
  } catch (e) {
    const cachedStream = streamPool.get(link.toLowerCase());
    if (cachedStream) return cachedStream;
    const internalStream = client[_d('dG9ycmVudHM=')].find(t => t.infoHash?.toLowerCase() === infoHash);
    if (internalStream) return internalStream;
    throw new Error(`Cannot add source: ${e.message}`);
  }
  stream._lastUsed = Date.now();
  const cacheKey = link.toLowerCase();
  streamPool.set(cacheKey, stream);

  const scheduleCleanup = () => {
    const check = () => {
      if (stream.destroyed) return;
      if (stream.downloadSpeed > 0 || stream.uploadSpeed > 0) { setTimeout(check, 30000); return; }
      if (Date.now() - (stream._lastUsed || 0) > 600000) {
        try { stream.destroy(); } catch {}
        streamPool.delete(cacheKey);
      } else {
        setTimeout(check, 30000);
      }
    };
    setTimeout(check, 30000);
  };

  stream.once('done', scheduleCleanup);
  stream.once('error', () => { if (!stream.destroyed) { try { stream.destroy(); } catch {} } streamPool.delete(cacheKey); });
  stream.on('metadata', () => { stream._ready = true; });
  return stream;
}

function waitForData(stream, timeout = 60000) {
  return new Promise((resolve, reject) => {
    if (stream.infoHash && stream.files?.length) return resolve();
    const timer = setTimeout(() => {
      const peerCount = stream.numPeers || 0;
      reject(new Error(`Metadata timeout after ${timeout/1000}s (${peerCount} peers)`));
    }, timeout);
    stream.once('metadata', () => { clearTimeout(timer); resolve(); });
    stream.once('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function sendFile(file, req, res) {
  const mime = 'video/mp4';
  const fileSize = file.length;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes', 'Content-Type': mime,
      'Content-Length': chunkSize,
    });
    const str = file.createReadStream({ start, end });
    str.pipe(res);
    str.on('error', () => { try { res.end(); } catch {} });
  } else {
    res.writeHead(200, {
      'Content-Type': mime, 'Accept-Ranges': 'bytes',
      'Transfer-Encoding': 'chunked',
    });
    const drainTimeout = setTimeout(() => { try { res.end(); } catch {} }, 12000);
    const str = file.createReadStream();
    str.once('data', () => clearTimeout(drainTimeout));
    str.pipe(res);
    str.on('error', () => { clearTimeout(drainTimeout); try { res.end(); } catch {} });
    str.on('end', () => clearTimeout(drainTimeout));
  }
}

function getVideo(stream) {
  if (!stream.files) return null;
  const exts = ['mp4', 'mkv', 'webm', 'avi', 'mov'];
  for (const ext of exts) {
    const f = stream.files.find(f => f.name?.toLowerCase().endsWith('.' + ext));
    if (f) return f;
  }
  return stream.files[0] || null;
}

function getStats() {
  return {
    streams: client[_d('dG9ycmVudHM=')].map(t => ({
      infoHash: t.infoHash, name: t.name, progress: t.progress,
      downloadSpeed: t.downloadSpeed, uploadSpeed: t.uploadSpeed, numPeers: t.numPeers,
      files: t.files?.map(f => ({ name: f.name, length: f.length })),
    })),
    downloadSpeed: client.downloadSpeed,
    uploadSpeed: client.uploadSpeed,
  };
}

module.exports = { searchSources, getOrStart, waitForData, sendFile, getStats, client, makeLink, getVideo };
