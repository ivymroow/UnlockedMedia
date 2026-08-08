const COOKIE_NAME = 'ws_sid';
const SESSION_TTL = 10 * 365 * 24 * 60 * 60;

function create(res, user, token, refresh) {
  const data = Buffer.from(JSON.stringify({ u: user, t: token, r: refresh })).toString('base64');
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=${data}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}`);
}

function get(req) {
  const raw = req.headers.cookie || '';
  const match = raw.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  try {
    const data = JSON.parse(Buffer.from(match[1], 'base64').toString('utf8'));
    return { user: data.u, token: data.t, refresh: data.r };
  } catch { return null; }
}

function clear(res) {
  res.setHeader('Set-Cookie', `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

module.exports = { COOKIE_NAME, create, get, clear };
