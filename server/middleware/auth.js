const supabase = require('../database/supabase');

async function requireUser(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });

  const user = await supabase.getUserFromToken(auth.slice(7));
  if (!user) return res.status(401).json({ error: 'Invalid token' });

  req.user = user;
  next();
}

module.exports = { requireUser };
