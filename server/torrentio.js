const axios = require('axios');

const API = axios.create({ timeout: 10000 });

const TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://tracker.coppersurfer.tk:6969/announce',
  'udp://tracker.leechers-paradise.org:6969/announce',
  'udp://p4p.arenabg.com:1337/announce',
  'udp://tracker.internetwarriors.net:1337/announce',
  'wss://tracker.webtorrent.dev',
  'wss://tracker.openwebtorrent.com',
];

function makeMagnet(hash) {
  const trackers = TRACKERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  return `magnet:?xt=urn:btih:${hash}&${trackers}`;
}

function parseTorrentio(s) {
  const title = s.title || s.name || '';
  const name = s.name || '';
  const filename = s.behaviorHints?.filename || '';

  const seedMatch = title.match(/ðŸ‘¤\s*(\d+)/);
  const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;

  const sizeMatch = title.match(/ðŸ’¾\s*([\d.]+)\s*(GB|MB)/);
  const size = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : '';

  const quality = extractTorrentioQuality(title + ' ' + name + ' ' + filename);
  const audioOk = audioTorrentio(filename + ' ' + title);

  return {
    provider: 'Torrentio',
    quality,
    size,
    seeds,
    peers: 0,
    hash: s.infoHash,
    fileIndex: s.fileIdx || 0,
    magnet: makeMagnet(s.infoHash),
    audioOk,
  };
}

async function searchMovie(imdbId) {
  try {
    const { data } = await API.get(`https://torrentio.strem.fun/stream/movie/${imdbId}.json`);
    return (data.streams || []).map(parseTorrentio);
  } catch { return []; }
}

async function searchEpisode(imdbId, season, episode) {
  try {
    const { data } = await API.get(`https://torrentio.strem.fun/stream/series/${imdbId}:${season}:${episode}.json`);
    return (data.streams || []).map(parseTorrentio);
  } catch { return []; }
}

function extractTorrentioQuality(text) {
  if (!text) return 'Unknown';
  if (text.includes('4K') || text.includes('2160')) return '4K';
  if (text.includes('1080')) return '1080p';
  if (text.includes('720')) return '720p';
  if (text.includes('480')) return '480p';
  return 'Unknown';
}

module.exports = { searchMovie, searchEpisode };
