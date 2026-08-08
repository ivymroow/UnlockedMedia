const sessions = require('../sessions');
const supabase = require('../supabase');

async function requireUser(req, res) {
  const sid = sessions.readFromCookie(req);
  if (!sid) { res.status(401).json({ error: 'Not signed in' }); return null; }
  const session = sessions.get(sid);
  if (!session) { res.status(401).json({ error: 'Session expired' }); return null; }
  return session.user;
}

async function requireUserMiddleware(req, res, next) {
  const user = await requireUser(req, res);
  if (!user) return;
  req.user = user;
  next();
}

module.exports = { requireUser, requireUserMiddleware };
