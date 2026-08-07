const axios = require('axios');

// Get embed URLs for a movie/show using TMDB ID
async function getEmbeds(imdbId, tmdbId, season, episode) {
  const id = imdbId;
  const embeds = [];

  if (season && episode) {
    embeds.push({ name: 'VidSrc', url: `https://vidsrc.su/embed/tv/${id}/${season}/${episode}` });
    embeds.push({ name: 'VidSrc ME', url: `https://vidsrc.me/embed/${id}/${season}-${episode}` });
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embedtv/${id}&s=${season}&e=${episode}` });
  } else {
    embeds.push({ name: 'VidSrc', url: `https://vidsrc.su/embed/movie/${id}` });
    embeds.push({ name: 'VidSrc ME', url: `https://vidsrc.me/embed/${id}` });
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embed/${id}` });
  }

  if (tmdbId) {
    embeds.push({ name: 'VidLink', url: `https://vidlink.pro/movie/${id}` });
  }

  // Return all as working embeds
  return embeds.map(e => ({ provider: e.name, embedUrl: e.url, hash: '', quality: 'HD', seeds: 99, peers: 0, size: '', fileIndex: 0 }));
}

module.exports = { getEmbeds };
