const createApp = require('./app');
const env = require('./config/env');
const torrent = require('./services/torrent');
const logger = require('./utils/logger');

process.on('uncaughtException', err => {
  if (err.code === 'EPIPE' || err.message?.includes('EPIPE') || err.message?.includes('write after end') || err.message?.includes('destroy')) return;
  logger.error('Uncaught exception', { error: err.message });
  process.exitCode = 1;
});

process.on('unhandledRejection', err => {
  if (err?.code === 'EPIPE' || err?.message?.includes('EPIPE') || err?.message?.includes('write after end')) return;
  logger.error('Unhandled rejection', { error: err?.message || String(err) });
});

const app = createApp();
const server = app.listen(env.port, '0.0.0.0', () => {
  logger.info(`WebStreaming listening on ${env.port}`, { env: env.nodeEnv });
});

function shutdown(signal) {
  logger.info(`Received ${signal}, shutting down`);
  try { torrent.cleanupStreams(true); } catch {}
  try { torrent.client.destroy(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
