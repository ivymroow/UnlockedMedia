const express = require('express');
const metadata = require('../services/metadata');
const torrent = require('../services/torrent');
const sourceFinder = require('../source-finder');
const embeds = require('../embeds');
const { asyncHandler } = require('../middleware/errors');
const { requireQuery } = require('../middleware/validation');

const router = express.Router();

function uniqueSources(items) {
  const seen = new Set();
  return items.filter(item => item && (seen.has(item.hash || item.embedUrl) ? false : seen.add(item.hash || item.embedUrl)));
}

router.get('/status', (req, res) => {
  res.json({ mode: 'backend', ...torrent.getStats() });
});

router.get('/search', requireQuery('q'), asyncHandler(async (req, res) => {
  res.json(await metadata.search(req.query.q.trim()));
}));

router.get('/trending', asyncHandler(async (req, res) => {
  res.json(await metadata.trending());
}));

router.get('/popular', asyncHandler(async (req, res) => {
  const results = req.query.type === 'tv' ? await metadata.popularShows() : await metadata.popularMovies();
  res.json(results);
}));

router.get('/movie/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, year } = req.query;

  try {
    res.json(await metadata.details(id, title, year));
  } catch {
    res.json({ id, title: title || id, year: year || null, poster: '', overview: '', genres: [], runtime: null, cast: [], rating: null, type: id.startsWith('tt') ? 'movie' : 'tv' });
  }
}));

router.get('/movie/:id/sources', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, year } = req.query;
  const [addon, searched, embedList] = await Promise.allSettled([
    sourceFinder.findMovie(id),
    torrent.searchSources(id, title || id, Number(year) || 0, 'movie', id),
    embeds.getEmbeds(id),
  ]);

  res.json(uniqueSources([
    ...(embedList.status === 'fulfilled' ? embedList.value : []),
    ...(addon.status === 'fulfilled' ? addon.value : []),
    ...(searched.status === 'fulfilled' ? searched.value : []),
  ]));
}));

router.get('/show/:id/episodes', asyncHandler(async (req, res) => {
  res.json(await metadata.getAllEpisodes(req.params.id, req.query.title));
}));

router.get('/show/:id/sources', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { title, year, season, episode } = req.query;
  if (!season || !episode) return res.json([]);

  const episodeQuery = `${title || ''} S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
  const [addon, searched, embedList] = await Promise.allSettled([
    sourceFinder.findEpisode(id, Number(season), Number(episode)),
    torrent.searchSources(id, episodeQuery, Number(year) || 0, 'tv', id),
    embeds.getEmbeds(id, null, Number(season), Number(episode)),
  ]);

  res.json(uniqueSources([
    ...(embedList.status === 'fulfilled' ? embedList.value : []),
    ...(addon.status === 'fulfilled' ? addon.value : []),
    ...(searched.status === 'fulfilled' ? searched.value : []),
  ]));
}));

router.get('/movie/:id/embeds', asyncHandler(async (req, res) => {
  res.json(await embeds.getEmbeds(req.params.id, req.query.tmdb));
}));

module.exports = router;
