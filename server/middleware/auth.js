const sessions = require('../sessions');

async function requireUser(req, res) {
  const session = sessions.get(req);
  if (!session) { res.status(401).json({ error: 'Not signed in' }); return null; }
  return session.user;
}

async function requireUserMiddleware(req, res, next) {
  const user = await requireUser(req, res);
  if (!user) return;
  req.user = user;
  next();
}

module.exports = { requireUser, requireUserMiddleware };
