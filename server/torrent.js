const axios = require('axios');
const WebTorrent = require('webtorrent');
const cache = require('./cache');

const os = require('os');
const path = require('path');
const fs = require('fs');
const MemoryChunkStore = require('memory-chunk-store');

const client = new WebTorrent({
  maxConns: 15,
  dht: { listenPort: 0 },
  tracker: true,
  store: chunkLength => new MemoryChunkStore(chunkLength),
});

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://tracker.leechers-paradise.org:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.internetwarriors.net:1337/announce',
  'udp://tracker.cyberia.is:6969/announce',
  'udp://open.demonii.com:1337/announce',
  'https://opentracker.i2p.rocks:443/announce',
];

function makeMagnet(hash, name) {
  const trackers = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  return `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(name)}&${trackers}`;
}

const YTS_DOMAINS = ['yts.lt', 'yts.ag', 'yts.mx'];

async function searchYTS(title, year, imdbId) {
  const q = imdbId || title;
  for (const domain of YTS_DOMAINS) {
    try {
      const { data } = await axios.get(`https://${domain}/api/v2/list_movies.json`, {
        params: { query_term: q, limit: 10, quality: 'all' },
        timeout: 8000,
      });
      if (data?.data?.movies) {
        const sources = [];
        for (const movie of data.data.movies) {
          if (!imdbId && year && movie.year !== year) continue;
          for (const t of (movie.torrents || [])) {
            sources.push({
              provider: 'YTS', quality: t.quality || extractQuality(t.url || ''),
              size: t.size, seeds: t.seeds || 0, peers: t.peers || 0,
              hash: t.hash, magnet: makeMagnet(t.hash, `${title} ${t.quality || 'Unknown'}`),
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

async function searchEztv(title, year, imdbId) {
  if (!imdbId) return [];
  // Extract episode code like S01E01 from the title query
  const epMatch = title.match(/S(\d+)E(\d+)/i);
  const episodeCode = epMatch ? `S${epMatch[1].padStart(2,'0')}E${epMatch[2].padStart(2,'0')}` : '';
  const showTitle = title.replace(/S\d+E\d+/i, '').trim();
  try {
    const { data } = await axios.get(`https://eztvx.to/api/get-torrents?imdb_id=${imdbId}`, { timeout: 8000 });
    if (data?.torrents) {
      const results = [];
      for (const t of data.torrents) {
        const name = t.filename || t.title || '';
        const nameLower = name.toLowerCase();

        // If we have an episode code, the filename MUST contain it
        if (episodeCode && !nameLower.includes(episodeCode.toLowerCase())) continue;

        // Filter by show title words
        const titleWords = showTitle.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        const matchCount = titleWords.filter(w => nameLower.includes(w)).length;
        if (titleWords.length > 0 && matchCount < Math.ceil(titleWords.length * 0.5)) continue;

        const quality = extractQuality(name);
        results.push({
          provider: 'EZTV', quality,
          size: t.size || t.size_bytes || '',
          seeds: t.seeds || 0, peers: t.peers || 0,
          hash: t.hash, magnet: t.magnet_url || makeMagnet(t.hash, name || title),
        });
      }
      return results;
    }
  } catch {}
  return [];
}

const TPB_DOMAINS = ['apibay.org', 'thepiratebay.org', 'apibay.net'];
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
];

function tpbQuery(s) {
  return s.trim().replace(/\s+/g, '+').replace(/[^a-zA-Z0-9+]/g, '');
}

function randomUA() { return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)]; }

async function searchPirateBay(title, year, imdbId) {
  const queries = [
    tpbQuery(title),
    tpbQuery(title.replace(/S\d+E\d+/i, '').trim()),
  ];
  // Shuffle domains
  const domains = [...TPB_DOMAINS].sort(() => Math.random() - 0.5);

  for (const domain of domains) {
    for (const q of queries) {
      // Small random delay between requests
      await new Promise(r => setTimeout(r, 500 + Math.random() * 1500));
      try {
        const { data } = await axios.get(`https://${domain}/q.php?q=${q}`, {
          timeout: 6000, headers: { 'User-Agent': randomUA(), 'Accept': 'application/json,text/html,*/*' },
        });
        if (Array.isArray(data) && data.length) {
          // Return whatever we get â€” don't filter by seeds (TPB reports 0 when rate-limited)
          const items = data.filter(i => i.name && i.info_hash).slice(0, 8);
          if (items.length) return items.map(i => ({
            provider: 'TPB', quality: extractQuality(i.name),
            size: i.size ? `${(i.size / 1073741824).toFixed(1)} GB` : '',
            seeds: parseInt(i.seeders) || 0, peers: parseInt(i.leechers) || 0,
            hash: i.info_hash, magnet: makeMagnet(i.info_hash, i.name),
          }));
        }
      } catch {}
    }
  }
  return [];
}

async function findSources(tmdbId, title, year, mediaType = 'movie', imdbId = '') {
  const key = `sources:${tmdbId || imdbId}:${title}`;
  const cached = cache.get(key);
  if (cached) return cached;

  let sources = [];

  if (mediaType === 'movie') {
    const [ytsIMDb, ytsTitle, tpb] = await Promise.all([
      searchYTS(title, year, imdbId),
      imdbId ? searchYTS(title, year, '') : Promise.resolve([]),
      searchPirateBay(title, year, imdbId),
    ]);
    sources = [...ytsIMDb, ...ytsTitle, ...tpb];
  } else {
    // For TV shows: search both EZTV and TPB with episode-specific query
    const epCode = title.match(/S\d+E\d+/i)?.[0] || '';
    const [eztvResults, tpbResults] = await Promise.all([
      searchEztv(title, year, imdbId),
      searchPirateBay(title, year, imdbId),
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

  // Only cache if we got results (don't cache empty â€” retry next time)
  if (sources.length) cache.set(key, sources, 'torrent');
  return sources.slice(0, 8);
}

const torrentCache = new Map();

function getOrAddTorrent(magnet) {
  const hashMatch = magnet.match(/urn:btih:([a-fA-F0-9]+)/);
  const infoHash = hashMatch ? hashMatch[1].toLowerCase() : '';

  // Check exposed torrent list
  let existing = client.torrents.find(t => t.infoHash?.toLowerCase() === infoHash);
  if (existing) {
    existing._lastUsed = Date.now();
    torrentCache.set(magnet.toLowerCase(), existing);
    return existing;
  }

  // Also check cache by magnet string (handles case where torrent was removed from client array)
  const cached = torrentCache.get(magnet.toLowerCase());
  if (cached) {
    cached._lastUsed = Date.now();
    return cached;
  }

  let tor;
  try {
    tor = client.add(magnet, { strategy: 'sequential' });
  } catch (e) {
    // If duplicate error, try to find the existing torrent via the magnet cache
    const cachedTor = torrentCache.get(magnet.toLowerCase());
    if (cachedTor) return cachedTor;
    // Try finding by infoHash in client's internal torrents
    const internalTor = client.torrents.find(t => t.infoHash?.toLowerCase() === infoHash);
    if (internalTor) return internalTor;
    throw new Error(`Cannot add torrent: ${e.message}`);
  }
  tor._lastUsed = Date.now();
  const cacheKey = magnet.toLowerCase();
  torrentCache.set(cacheKey, tor);

  // Cleanup: destroy when done + no active streams, OR after 10 min idle
  const scheduleCleanup = () => {
    const check = () => {
      if (tor.destroyed) return;
      if (tor.downloadSpeed > 0 || tor.uploadSpeed > 0) { setTimeout(check, 30000); return; }
      if (Date.now() - (tor._lastUsed || 0) > 600000) {
        try { tor.destroy(); } catch {}
        torrentCache.delete(cacheKey);
      } else {
        setTimeout(check, 30000);
      }
    };
    setTimeout(check, 30000);
  };

  tor.once('done', scheduleCleanup);
  tor.once('error', () => { if (!tor.destroyed) { try { tor.destroy(); } catch {} } torrentCache.delete(cacheKey); });
  tor.on('metadata', () => { tor._ready = true; });
  return tor;
}

function waitForMetadata(torrent, timeout = 60000) {
  return new Promise((resolve, reject) => {
    if (torrent.infoHash && torrent.files?.length) return resolve();
    const timer = setTimeout(() => {
      const peerCount = torrent.numPeers || 0;
      reject(new Error(`Metadata timeout after ${timeout/1000}s (${peerCount} peers)`));
    }, timeout);
    torrent.once('metadata', () => { clearTimeout(timer); resolve(); });
    torrent.once('error', (e) => { clearTimeout(timer); reject(e); });
  });
}

function streamFile(file, req, res) {
  // Force video/mp4 â€” browsers handle MP4 audio (AAC, AC3, E-AC3) universally.
  // MKV audio (DTS, TrueHD) is NOT supported by most browsers.
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
    const stream = file.createReadStream({ start, end });
    stream.pipe(res);
    stream.on('error', () => { try { res.end(); } catch {} });
  } else {
    res.writeHead(200, {
      'Content-Type': mime, 'Accept-Ranges': 'bytes',
      'Transfer-Encoding': 'chunked',
    });
    // Close connection if no data flows within 12s
    const drainTimeout = setTimeout(() => { try { res.end(); } catch {} }, 12000);
    const stream = file.createReadStream();
    stream.once('data', () => clearTimeout(drainTimeout));
    stream.pipe(res);
    stream.on('error', () => { clearTimeout(drainTimeout); try { res.end(); } catch {} });
    stream.on('end', () => clearTimeout(drainTimeout));
  }
}

function getFirstVideoFile(torrent) {
  if (!torrent.files) return null;
  const exts = ['mp4', 'mkv', 'webm', 'avi', 'mov'];
  for (const ext of exts) {
    const f = torrent.files.find(f => f.name?.toLowerCase().endsWith('.' + ext));
    if (f) return f;
  }
  return torrent.files[0] || null;
}

function getClientStats() {
  return {
    torrents: client.torrents.map(t => ({
      infoHash: t.infoHash, name: t.name, progress: t.progress,
      downloadSpeed: t.downloadSpeed, uploadSpeed: t.uploadSpeed, numPeers: t.numPeers,
      files: t.files?.map(f => ({ name: f.name, length: f.length })),
    })),
    downloadSpeed: client.downloadSpeed,
    uploadSpeed: client.uploadSpeed,
  };
}

module.exports = { findSources, getOrAddTorrent, waitForMetadata, streamFile, getClientStats, client, makeMagnet, getFirstVideoFile };
