const axios = require('axios');

const API = axios.create({ timeout: 10000 });

const _d = (s) => Buffer.from(s, 'base64').toString('utf8');
const TRKS = [
  _d('dWRwOi8vdHJhY2tlci5vcGVudHJhY2tyLm9yZzoxMzM3L2Fubm91bmNl'),
  _d('dWRwOi8vdHJhY2tlci5jb3BwZXJzdXJmZXIudGs6Njk2OS9hbm5vdW5jZQ=='),
  _d('dWRwOi8vdHJhY2tlci5sZWVjaGVycy1wYXJhZGlzZS5vcmc6Njk2OS9hbm5vdW5jZQ=='),
  _d('dWRwOi8vcDRwLmFyZW5hYmcuY29tOjEzMzcvYW5ub3VuY2U='),
  _d('dWRwOi8vdHJhY2tlci5pbnRlcm5ldHdhcnJpb3JzLm5ldDoxMzM3L2Fubm91bmNl'),
  _d('d3NzOi8vdHJhY2tlci53ZWJ0b3JyZW50LmRldg=='),
  _d('d3NzOi8vdHJhY2tlci5vcGVud2VidG9ycmVudC5jb20='),
];

function mkMagnet(hash) {
  const t = TRKS.map(x => `tr=${encodeURIComponent(x)}`).join('&');
  return `magnet:?xt=urn:btih:${hash}&${t}`;
}

function parse(s) {
  const title = s.title || s.name || '';
  const name = s.name || '';
  const filename = s.behaviorHints?.filename || '';
  const seedM = title.match(/👤\s*(\d+)/);
  const sizeM = title.match(/💾\s*([\d.]+)\s*(GB|MB)/);
  return {
    provider: 'TSX',
    quality: title.includes('4K') || title.includes('2160') ? '4K' : title.includes('1080') ? '1080p' : title.includes('720') ? '720p' : title.includes('480') ? '480p' : 'Unknown',
    size: sizeM ? `${sizeM[1]} ${sizeM[2]}` : '',
    seeds: seedM ? parseInt(seedM[1]) : 0,
    peers: 0,
    hash: s.infoHash,
    fileIndex: s.fileIdx || 0,
    magnet: mkMagnet(s.infoHash),
  };
}

async function findMovie(imdbId) {
  try {
    const { data } = await API.get(`https://` + _d('dG9ycmVudGlvLnN0cmVtLmZ1bg==') + `/stream/movie/${imdbId}.json`);
    return (data.streams || []).map(parse);
  } catch { return []; }
}

async function findEpisode(imdbId, season, episode) {
  try {
    const { data } = await API.get(`https://` + _d('dG9ycmVudGlvLnN0cmVtLmZ1bg==') + `/stream/series/${imdbId}:${season}:${episode}.json`);
    return (data.streams || []).map(parse);
  } catch { return []; }
}

module.exports = { findMovie, findEpisode };
