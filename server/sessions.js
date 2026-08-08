const COOKIE_NAME = 'ws_sid';
const SESSION_TTL = 10 * 365 * 24 * 60 * 60;

function create(res, user, token, refresh) {
  const data = encodeURIComponent(JSON.stringify({ u: user, t: token, r: refresh }));
  res.cookie(COOKIE_NAME, data, { httpOnly: true, sameSite: 'lax', path: '/', maxAge: SESSION_TTL * 1000 });
}

function get(req) {
  const val = req.cookies?.[COOKIE_NAME];
  if (!val) return null;
  try {
    const data = JSON.parse(decodeURIComponent(val));
    return { user: data.u, token: data.t, refresh: data.r };
  } catch { return null; }
}

function clear(res) {
  res.cookie(COOKIE_NAME, '', { httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0 });
}

module.exports = { COOKIE_NAME, create, get, clear };
