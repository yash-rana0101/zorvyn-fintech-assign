'use strict';

require('dotenv').config();

const app = require('./app');
const { validateEnv } = require('./config/env');
const { eventBus } = require('../../../packages/event-bus/eventBus');
const logger = require('../../../packages/logger/logger');

validateEnv();

const PORT = Number.parseInt(
  process.env.FINANCE_WRITE_SERVICE_PORT || process.env.PORT || '3101',
  10
);
const NODE_ENV = process.env.NODE_ENV || 'development';

const server = app.listen(PORT, () => {
  const address = server.address();
  const activePort =
    address && typeof address === 'object' && address.port
      ? address.port
      : PORT;

  logger.info('Finance write service started', {
    port: activePort,
    env: NODE_ENV,
    pid: process.pid,
  });
  console.log('Finance Write Service is running on port', activePort);
});

server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    const message = `Finance write service cannot start: port ${PORT} is already in use`;

    logger.error(message, {
      port: PORT,
      code: error.code,
    });
    console.error(`${message}. Stop the process using this port and restart.`);
    process.exit(1);
    return;
  }

  logger.error('Finance write service failed to bind port', {
    port: PORT,
    code: error?.code,
    message: error?.message,
  });
  console.error(`Finance write service failed to start: ${error?.message || 'Unknown bind error'}`);
  process.exit(1);
});

const shutdown = (signal) => {
  logger.info(`Finance write service received ${signal}, starting shutdown`);

  if (!server.listening) {
    process.exit(0);
    return;
  }

  server.close(async () => {
    logger.info('Finance write HTTP server closed');

    try {
      await eventBus.shutdown();
    } catch (error) {
      logger.warn('Finance write event bus shutdown failed', {
        error: error.message,
      });
    }

    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Finance write service forced shutdown after timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Finance write unhandled promise rejection', reason);
  logger.error('Finance write unhandled promise rejection', { reason });
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Finance write uncaught exception', error);
  logger.error('Finance write uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
  process.exit(1);
});

module.exports = server;
