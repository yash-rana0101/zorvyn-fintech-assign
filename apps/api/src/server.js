'use strict';

const path = require('path');
const dotenv = require('dotenv');

// Always load repo-root .env so workspace scripts work from any cwd.
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env'), override: true });
const app = require('./app');
const { validateEnv } = require('./config/env');
const { startReconciliationScheduler } = require('./jobs/reconciliation.job');
const { eventBus } = require('../../../packages/event-bus/eventBus');
const logger = require('../../../packages/logger/logger');

// Validate required environment variables before starting
validateEnv();

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const reconciliationScheduler = startReconciliationScheduler();

const server = app.listen(PORT, () => {
  logger.info(`🚀 Finance API running`, {
    port: PORT,
    env: NODE_ENV,
    pid: process.pid,
  });
  console.log("Server is running on port", PORT);
});

// ─── Graceful Shutdown ──────────────────────────────────────────────────────
const shutdown = (signal) => {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  if (reconciliationScheduler && typeof reconciliationScheduler.stop === 'function') {
    reconciliationScheduler.stop();
  }

  server.close(async () => {
    logger.info('HTTP server closed.');

    try {
      await eventBus.shutdown();
    } catch (err) {
      logger.warn('Event bus shutdown failed', {
        error: err.message,
      });
    }

    process.exit(0);
  });

  // Force exit after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason });
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', { error: err.message, stack: err.stack });
  process.exit(1);
});

module.exports = server;
