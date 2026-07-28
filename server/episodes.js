const axios = require('axios');
const cache = require('./cache');

const api = axios.create({ timeout: 10000 });

async function lookupByIMDB(imdbId, titleHint) {
  const key = `tvmaze:lookup:${imdbId}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { data } = await api.get(`https://api.tvmaze.com/lookup/shows?imdb=${imdbId}`);
    cache.set(key, data, 'tmdb');
    return data;
  } catch {}

  // Fallback: search by title
  if (titleHint) {
    try {
      const { data: results } = await api.get(`https://api.tvmaze.com/search/shows?q=${encodeURIComponent(titleHint)}`);
      const match = results?.find(r => r.show?.externals?.imdb === imdbId) || results?.[0];
      if (match?.show) {
        cache.set(key, match.show, 'tmdb');
        return match.show;
      }
    } catch {}
  }

  return null;
}

async function getSeasons(imdbId, titleHint) {
  const show = await lookupByIMDB(imdbId, titleHint);
  if (!show) return [];

  const key = `tvmaze:seasons:${show.id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { data } = await api.get(`https://api.tvmaze.com/shows/${show.id}/seasons`);
    const seasons = data.map(s => ({
      id: s.id, number: s.number, episodeCount: s.episodeOrder || 0,
      premiereDate: s.premiereDate || '', endDate: s.endDate || '',
    }));
    cache.set(key, seasons, 'tmdb');
    return seasons;
  } catch { return []; }
}

async function getEpisodes(imdbId, seasonNumber, titleHint) {
  const show = await lookupByIMDB(imdbId, titleHint);
  if (!show) return [];

  const key = `tvmaze:episodes:${show.id}:${seasonNumber}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { data } = await api.get(`https://api.tvmaze.com/shows/${show.id}/episodes`);
    const now = new Date();
    const episodes = data
      .filter(e => e.season === seasonNumber && (!e.airdate || new Date(e.airdate) <= now))
      .sort((a, b) => a.number - b.number)
      .map(e => ({
        id: e.id, number: e.number, name: e.name || `Episode ${e.number}`,
        summary: (e.summary || '').replace(/<[^>]+>/g, '').trim(),
        airdate: e.airdate || '',
        runtime: e.runtime || null,
        image: e.image?.medium || '',
      }));
    cache.set(key, episodes, 'tmdb');
    return episodes;
  } catch { return []; }
}

async function getAllEpisodes(imdbId, titleHint) {
  const show = await lookupByIMDB(imdbId, titleHint);
  if (!show) return [];

  const key = `tvmaze:episodes:all:${show.id}`;
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const { data } = await api.get(`https://api.tvmaze.com/shows/${show.id}/episodes`);
    const now = new Date();
    const grouped = {};
    for (const e of data) {
      const s = e.season || 1;
      if (!grouped[s]) grouped[s] = [];
      grouped[s].push({
        id: e.id, number: e.number, name: e.name || `Episode ${e.number}`,
        summary: (e.summary || '').replace(/<[^>]+>/g, '').trim(),
        airdate: e.airdate || '', runtime: e.runtime || null,
        image: e.image?.medium || '',
      });
    }

    // Sort episodes within each season and filter out future seasons
    const result = Object.entries(grouped)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .filter(([_, eps]) => eps.length > 0)
      .map(([season, eps]) => ({
        season: parseInt(season),
        episodes: eps.sort((a, b) => a.number - b.number),
      }))
      // Remove seasons where every episode airdate is > 30 days from now (unreleased)
      .filter(s => s.episodes.some(e => !e.airdate || (new Date(e.airdate) - now) < 2592000000));

    if (!result.length) {
      // Fallback: if all seasons filtered out, just show last 2 seasons
      const sorted = Object.entries(grouped)
        .sort(([a], [b]) => parseInt(b) - parseInt(a))
        .slice(0, 2);
      const fallback = sorted.map(([season, eps]) => ({
        season: parseInt(season),
        episodes: eps.sort((a, b) => a.number - b.number),
      }));
      cache.set(key, fallback, 'tmdb');
      return fallback;
    }

    cache.set(key, result, 'tmdb');
    return result;
  } catch { return []; }
}

module.exports = { lookupByIMDB, getSeasons, getEpisodes, getAllEpisodes };
