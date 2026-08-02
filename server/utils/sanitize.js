function cleanString(value, maxLength = 500) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function cleanUsername(value) {
  return cleanString(value, 64).replace(/[^\w.@-]/g, '');
}

function cleanMediaItem(item = {}) {
  return {
    id: cleanString(item.id, 128),
    title: cleanString(item.title, 300),
    poster: cleanString(item.poster, 1000),
    type: cleanString(item.type, 20) || 'movie',
    season: Number(item.season) || 0,
    episode: Number(item.episode) || 0,
    duration: Math.max(0, Number(item.duration) || 0),
    watched: Math.max(0, Number(item.watched) || 0),
    status: cleanString(item.status, 40) || 'watching',
  };
}

module.exports = { cleanString, cleanUsername, cleanMediaItem };
