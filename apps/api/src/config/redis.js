'use strict';

/**
 * Redis configuration.
 * The actual client lives in packages/cache/redisClient.js.
 * This file exports the config object so it can be reused.
 */
function getRedisConfig() {
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    retryStrategy: (times) => {
      if (times > 10) return null; // Stop retrying
      return Math.min(times * 200, 2000); // Exponential backoff up to 2s
    },
    lazyConnect: true,
    keepAlive: 30_000,
  };
}

module.exports = { getRedisConfig };
