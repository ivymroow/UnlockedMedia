const store = new Map();

const TTL = {
  tmdb: 10 * 60 * 1000,
  torrent: 5 * 60 * 1000,
  default: 5 * 60 * 1000,
};

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) { store.delete(key); return null; }
  return entry.value;
}

function set(key, value, ttl = 'default') {
  const ms = TTL[ttl] || TTL.default;
  store.set(key, { value, expires: Date.now() + ms });
}

module.exports = { get, set };
