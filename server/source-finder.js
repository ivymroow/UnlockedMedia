const axios = require('axios');
const b = (x) => Buffer.from(x, 'base64').toString('utf8');

const API = axios.create({ timeout: 10000 });

const _d = (s) => Buffer.from(s, 'base64').toString('utf8');
const ANNOUNCERS = [
  _d('dWRwOi8vdHJhY2tlci5vcGVudHJhY2tyLm9yZzoxMzM3L2Fubm91bmNl'),
  _d('dWRwOi8vdHJhY2tlci5jb3BwZXJzdXJmZXIudGs6Njk2OS9hbm5vdW5jZQ=='),
  _d('dWRwOi8vdHJhY2tlci5sZWVjaGVycy1wYXJhZGlzZS5vcmc6Njk2OS9hbm5vdW5jZQ=='),
  _d('dWRwOi8vcDRwLmFyZW5hYmcuY29tOjEzMzcvYW5ub3VuY2U='),
  _d('dWRwOi8vdHJhY2tlci5pbnRlcm5ldHdhcnJpb3JzLm5ldDoxMzM3L2Fubm91bmNl'),
  _d('d3NzOi8vdHJhY2tlci53ZWJ0b3JyZW50LmRldg=='),
  _d('d3NzOi8vdHJhY2tlci5vcGVud2VidG9ycmVudC5jb20='),
];

function makeLink(hash) {
  const attendees = ANNOUNCERS.map(t => `tr=${encodeURIComponent(t)}`).join('&');
  return `magnet:?xt=urn:btih:${hash}&${attendees}`;
}

function parseSource(s) {
  const title = s.title || s.name || '';
  const name = s.name || '';
  const filename = s.behaviorHints?.filename || '';

  const seedMatch = title.match(/👤\s*(\d+)/);
  const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;

  const sizeMatch = title.match(/💾\s*([\d.]+)\s*(GB|MB)/);
  const size = sizeMatch ? `${sizeMatch[1]} ${sizeMatch[2]}` : '';

  const quality = readQuality(title + ' ' + name + ' ' + filename);

  return {
    provider: 'TSX',
    quality,
    size,
    seeds,
    peers: 0,
    hash: s.infoHash,
    fileIndex: s.fileIdx || 0,
    link: makeLink(s.infoHash),
  };
}

async function findMovie(imdbId) {
  try {
    const { data } = await API.get(`https://` + b('dG9ycmVudGlvLnN0cmVtLmZ1bg==') + `/stream/movie/${imdbId}.json`);
    return (data.streams || []).map(parseSource);
  } catch { return []; }
}

async function findEpisode(imdbId, season, episode) {
  try {
    const { data } = await API.get(`https://` + b('dG9ycmVudGlvLnN0cmVtLmZ1bg==') + `/stream/series/${imdbId}:${season}:${episode}.json`);
    return (data.streams || []).map(parseSource);
  } catch { return []; }
}

function readQuality(text) {
  if (!text) return 'Unknown';
  if (text.includes('4K') || text.includes('2160')) return '4K';
  if (text.includes('1080')) return '1080p';
  if (text.includes('720')) return '720p';
  if (text.includes('480')) return '480p';
  return 'Unknown';
}

module.exports = { findMovie, findEpisode };
