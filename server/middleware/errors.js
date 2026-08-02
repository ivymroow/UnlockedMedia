const logger = require('../utils/logger');

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function notFound(req, res) {
  res.status(404).json({ error: 'Not found' });
}

function errorHandler(err, req, res, next) {
  logger.error('Unhandled request error', {
    path: req.path,
    method: req.method,
    error: err?.message || String(err),
  });

  if (res.headersSent) return next(err);
  res.status(err.status || 500).json({ error: err.expose ? err.message : err.message || 'Internal error' });
}

module.exports = { asyncHandler, notFound, errorHandler };
