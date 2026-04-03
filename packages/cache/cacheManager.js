'use strict';

const { getRedisClient, isRedisReady } = require('./redisClient');
const logger = require('../logger/logger');
const { incrementCounter, METRICS } = require('../monitoring/metrics');

function resolveServiceName() {
  return process.env.OBSERVABILITY_SERVICE_NAME || process.env.SERVICE_NAME || 'api';
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Cache Manager — get/set/del/exists helpers with TTL support.
 *
 * All operations fail gracefully: if Redis is unavailable,
 * operations return null/false instead of throwing.
 * This enables fallback-to-DB patterns.
 *
 * Key conventions:
 *  - RBAC roles:       user:{userId}:role
 *  - Dashboard cache:  dashboard:{userId}:summary
 *  - Rate limit:       ratelimit:{ip}
 */

const cacheManager = {
  /**
   * Get a cached value.
   * @param {string} key
   * @returns {Promise<string|null>}
   */
  async get(key) {
    try {
      if (!isRedisReady()) return null;
      const value = await getRedisClient().get(key);

      incrementCounter(value !== null ? METRICS.CACHE_HIT_TOTAL : METRICS.CACHE_MISS_TOTAL, {
        service: resolveServiceName(),
      });

      logger.debug('Cache GET', { key, hit: value !== null });
      return value;
    } catch (err) {
      logger.warn('Cache GET failed', { key, error: err.message });
      return null;
    }
  },

  /**
   * Set a cached value with TTL.
   * @param {string} key
   * @param {string|object} value - Objects are JSON-serialized automatically
   * @param {number} [ttlSeconds=300] - Time to live in seconds
   */
  async set(key, value, ttlSeconds = 300) {
    try {
      if (!isRedisReady()) return false;
      const serialized =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      await getRedisClient().setex(key, ttlSeconds, serialized);
      logger.debug('Cache SET', { key, ttl: ttlSeconds });
      return true;
    } catch (err) {
      logger.warn('Cache SET failed', { key, error: err.message });
      return false;
    }
  },

  /**
   * Delete one or more keys.
   * @param {...string} keys
   */
  async del(...keys) {
    try {
      if (!isRedisReady()) return false;
      await getRedisClient().del(...keys);
      logger.debug('Cache DEL', { keys });
      return true;
    } catch (err) {
      logger.warn('Cache DEL failed', { keys, error: err.message });
      return false;
    }
  },

  /**
   * Check if a key exists.
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  async exists(key) {
    try {
      if (!isRedisReady()) return false;
      const count = await getRedisClient().exists(key);
      return count === 1;
    } catch (err) {
      logger.warn('Cache EXISTS failed', { key, error: err.message });
      return false;
    }
  },

  /**
   * Get a JSON-parsed value.
   * @param {string} key
   * @returns {Promise<object|null>}
   */
  async getJSON(key) {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  },

  /**
   * Increment a counter (for rate limiting / analytics).
   * @param {string} key
   * @param {number} [ttlSeconds]
   * @returns {Promise<number>} New counter value
   */
  async increment(key, ttlSeconds) {
    try {
      if (!isRedisReady()) return 0;
      const redis = getRedisClient();
      const val = await redis.incr(key);
      if (ttlSeconds && val === 1) {
        await redis.expire(key, ttlSeconds);
      }
      return val;
    } catch (err) {
      logger.warn('Cache INCR failed', { key, error: err.message });
      return 0;
    }
  },

  /**
   * Set a value only when the key does not exist.
   */
  async setIfNotExists(key, value, ttlSeconds = 5) {
    try {
      if (!isRedisReady()) return false;

      const serialized =
        typeof value === 'object' ? JSON.stringify(value) : String(value);

      const result = await getRedisClient().set(
        key,
        serialized,
        'EX',
        ttlSeconds,
        'NX'
      );

      return result === 'OK';
    } catch (err) {
      logger.warn('Cache SET NX failed', { key, error: err.message });
      return false;
    }
  },

  /**
   * Stampede-safe cache read-through helper.
   *
   * 1. Return hot value when present.
   * 2. Acquire lock and compute once on miss.
   * 3. Other callers wait briefly for warm value.
   * 4. If still missing, return stale value and refresh in background.
   */
  async getOrCompute(key, computeFn, options = {}) {
    if (typeof computeFn !== 'function') {
      throw new Error('computeFn must be a function');
    }

    const ttlSeconds = Number.parseInt(options.ttlSeconds, 10) || 300;
    const lockTtlSeconds = Number.parseInt(options.lockTtlSeconds, 10) || 5;
    const staleTtlSeconds = Number.parseInt(options.staleTtlSeconds, 10)
      || Math.max(ttlSeconds + 30, ttlSeconds * 2);
    const waitTimeoutMs = Number.parseInt(options.waitTimeoutMs, 10) || 1200;
    const pollIntervalMs = Number.parseInt(options.pollIntervalMs, 10) || 50;

    const lockKey = options.lockKey || `lock:${key}`;
    const staleKey = options.staleKey || `stale:${key}`;

    const cached = await this.getJSON(key);
    if (cached !== null && cached !== undefined) {
      return cached;
    }

    const lockAcquired = await this.setIfNotExists(lockKey, process.pid, lockTtlSeconds);

    if (lockAcquired) {
      try {
        const computed = await computeFn();

        if (computed !== null && computed !== undefined) {
          await this.set(key, computed, ttlSeconds);
          await this.set(staleKey, computed, staleTtlSeconds);
        }

        return computed;
      } finally {
        await this.del(lockKey);
      }
    }

    const deadline = Date.now() + waitTimeoutMs;
    while (Date.now() < deadline) {
      await wait(pollIntervalMs);
      const retryValue = await this.getJSON(key);
      if (retryValue !== null && retryValue !== undefined) {
        return retryValue;
      }
    }

    const staleValue = await this.getJSON(staleKey);
    if (staleValue !== null && staleValue !== undefined) {
      setImmediate(async () => {
        const backgroundLock = await this.setIfNotExists(lockKey, process.pid, lockTtlSeconds);
        if (!backgroundLock) {
          return;
        }

        try {
          const refreshed = await computeFn();
          if (refreshed !== null && refreshed !== undefined) {
            await this.set(key, refreshed, ttlSeconds);
            await this.set(staleKey, refreshed, staleTtlSeconds);
          }
        } catch (err) {
          logger.warn('Background cache refresh failed', {
            key,
            error: err.message,
          });
        } finally {
          await this.del(lockKey);
        }
      });

      return staleValue;
    }

    const fallbackValue = await computeFn();
    if (fallbackValue !== null && fallbackValue !== undefined) {
      await this.set(key, fallbackValue, ttlSeconds);
      await this.set(staleKey, fallbackValue, staleTtlSeconds);
    }

    return fallbackValue;
  },
};

module.exports = { cacheManager };
