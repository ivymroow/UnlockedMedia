const env = require('../config/env');

const buckets = new Map();

function rateLimit(req, res, next) {
  const key = req.ip || req.headers['x-forwarded-for'] || 'unknown';
  const now = Date.now();
  const bucket = buckets.get(key) || { count: 0, resetAt: now + env.rateLimitWindowMs };

  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + env.rateLimitWindowMs;
  }

  bucket.count += 1;
  buckets.set(key, bucket);

  if (bucket.count > env.rateLimitMax) {
    res.set('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    return res.status(429).json({ error: 'Too many requests' });
  }

  next();
}

setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, env.rateLimitWindowMs).unref();

module.exports = rateLimit;
