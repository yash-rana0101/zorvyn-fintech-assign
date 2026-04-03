'use strict';

const Redis = require('ioredis');
const logger = require('../logger/logger');

let client = null;

/**
 * Get or create the Redis client singleton.
 *
 * Features:
 *  - Automatic reconnection with exponential backoff
 *  - Lazy connection mode
 *  - Error isolation (failures are logged, not thrown)
 */
function getRedisClient() {
  if (client) return client;

  client = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    lazyConnect: true,
    keepAlive: 30_000,
    retryStrategy(times) {
      if (times > 10) {
        logger.error('Redis: max retry attempts exceeded, giving up');
        return null;
      }
      const delay = Math.min(times * 200, 2000);
      logger.warn(`Redis: retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },
    reconnectOnError(err) {
      logger.warn('Redis: reconnecting on error', { error: err.message });
      return true;
    },
  });

  client.on('connect', () => {
    logger.info('Redis: connected');
  });

  client.on('ready', () => {
    logger.debug('Redis: ready to accept commands');
  });

  client.on('error', (err) => {
    logger.error('Redis error', { error: err.message });
    // Do not crash — graceful degradation to DB
  });

  client.on('close', () => {
    logger.warn('Redis: connection closed');
  });

  // Eagerly connect
  client.connect().catch((err) => {
    logger.warn('Redis: initial connection failed, will retry', {
      error: err.message,
    });
  });

  return client;
}

/**
 * Check if Redis is currently connected.
 * @returns {boolean}
 */
function isRedisReady() {
  return client?.status === 'ready';
}

module.exports = { getRedisClient, isRedisReady };
