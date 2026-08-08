const crypto = require('crypto');
const sessions = new Map();

const COOKIE_NAME = 'ws_sid';
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

function create(user, token, refresh) {
  const id = crypto.randomBytes(32).toString('hex');
  sessions.set(id, { user, token, refresh, created: Date.now() });
  setTimeout(() => sessions.delete(id), SESSION_TTL).unref();
  return id;
}

function get(id) {
  const s = sessions.get(id);
  if (!s) return null;
  if (Date.now() - s.created > SESSION_TTL) { sessions.delete(id); return null; }
  return s;
}

function refresh(id, token, refreshToken) {
  const s = sessions.get(id);
  if (!s) return null;
  s.token = token;
  s.refresh = refreshToken;
  s.created = Date.now();
  return s;
}

function destroy(id) {
  sessions.delete(id);
}

function readFromCookie(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

function setCookie(res, sid) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sid}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL / 1000}`);
}

function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

module.exports = { COOKIE_NAME, create, get, refresh, destroy, readFromCookie, setCookie, clearCookie };
