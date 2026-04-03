'use strict';

const { cacheManager: baseCacheManager } = require('../../../../../packages/cache/cacheManager');

/**
 * App-level cache manager abstraction for Phase 6.
 * It keeps the cache contract local to the API app while reusing
 * the shared package implementation underneath.
 */
const cacheManager = {
  async get(key) {
    return baseCacheManager.getJSON(key);
  },

  async getRaw(key) {
    return baseCacheManager.get(key);
  },

  async set(key, value, ttlSeconds) {
    return baseCacheManager.set(key, value, ttlSeconds);
  },

  async invalidate(...keys) {
    if (!Array.isArray(keys) || keys.length === 0) {
      return false;
    }

    return baseCacheManager.del(...keys);
  },

  async increment(key, ttlSeconds) {
    return baseCacheManager.increment(key, ttlSeconds);
  },

  async setIfNotExists(key, value, ttlSeconds) {
    return baseCacheManager.setIfNotExists(key, value, ttlSeconds);
  },

  async getOrCompute(key, computeFn, options) {
    return baseCacheManager.getOrCompute(key, computeFn, options);
  },
};

module.exports = { cacheManager };
