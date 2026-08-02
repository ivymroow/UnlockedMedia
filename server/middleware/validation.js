function requireQuery(name) {
  return (req, res, next) => {
    const value = req.query[name]?.trim?.() || req.query[name];
    if (!value) return res.status(400).json({ error: `${name} required` });
    next();
  };
}

function requireBody(name) {
  return (req, res, next) => {
    if (!req.body || !req.body[name]) return res.status(400).json({ error: `${name} required` });
    next();
  };
}

module.exports = { requireQuery, requireBody };
