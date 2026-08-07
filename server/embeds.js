async function getEmbeds(imdbId, tmdbId, season, episode) {
  const id = imdbId;
  const embeds = [];

  if (season && episode) {
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embedtv/${id}&s=${season}&e=${episode}` });
    embeds.push({ name: 'VidLink', url: `https://vidlink.pro/tv/${id}/${season}/${episode}` });
  } else {
    embeds.push({ name: '2Embed', url: `https://www.2embed.cc/embed/${id}` });
    embeds.push({ name: 'VidLink', url: `https://vidlink.pro/movie/${id}` });
  }

  return embeds.map((e, i) => ({ provider: e.name, embedUrl: e.url, hash: 'embed-' + i, quality: 'HD', seeds: 999, peers: 0, size: '', fileIndex: 0 }));
}

module.exports = { getEmbeds };
