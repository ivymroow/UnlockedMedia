const express = require('express');
const metadata = require('../services/metadata');
const embeds = require('../embeds');
const { asyncHandler } = require('../middleware/errors');
const { requireQuery } = require('../middleware/validation');

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ mode: 'backend' });
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
  const embedList = await embeds.getEmbeds(req.params.id);
  res.json(embedList);
}));

router.get('/show/:id/episodes', asyncHandler(async (req, res) => {
  res.json(await metadata.getAllEpisodes(req.params.id, req.query.title));
}));

router.get('/show/:id/sources', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { season, episode } = req.query;
  if (!season || !episode) return res.json([]);
  const embedList = await embeds.getEmbeds(id, null, Number(season), Number(episode));
  res.json(embedList);
}));

router.get('/movie/:id/embeds', asyncHandler(async (req, res) => {
  res.json(await embeds.getEmbeds(req.params.id, req.query.tmdb));
}));

module.exports = router;
