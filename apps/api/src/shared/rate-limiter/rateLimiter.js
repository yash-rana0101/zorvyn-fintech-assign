'use strict';

const { getRedisClient, isRedisReady } = require('../../../../../packages/cache/redisClient');
const logger = require('../../../../../packages/logger/logger');

function toWindowSeconds(windowMs) {
  const parsed = Number.parseInt(windowMs, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60;
  }

  return Math.max(1, Math.ceil(parsed / 1000));
}

/**
 * Redis-backed rate limiter check.
 * Uses INCR + EXPIRE for atomic counters and graceful degradation.
 */
async function checkLimit(
  userId,
  {
    maxRequests = 100,
    windowMs = 60_000,
    keyPrefix = 'rate',
  } = {}
) {
  if (!userId) {
    return {
      allowed: true,
      degraded: true,
      limit: maxRequests,
      remaining: maxRequests,
      retryAfter: toWindowSeconds(windowMs),
      totalHits: 0,
    };
  }

  const windowSeconds = toWindowSeconds(windowMs);
  const key = `${keyPrefix}:${userId}`;

  if (!isRedisReady()) {
    logger.warn('Rate limiter running in degraded mode (redis not ready)', {
      key,
    });
    return {
      allowed: true,
      degraded: true,
      limit: maxRequests,
      remaining: maxRequests,
      retryAfter: windowSeconds,
      totalHits: 0,
    };
  }

  try {
    const redis = getRedisClient();
    const totalHits = await redis.incr(key);

    if (totalHits === 1) {
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const retryAfter = ttl > 0 ? ttl : windowSeconds;
    const remaining = Math.max(0, maxRequests - totalHits);

    return {
      allowed: totalHits <= maxRequests,
      degraded: false,
      limit: maxRequests,
      remaining,
      retryAfter,
      totalHits,
    };
  } catch (err) {
    logger.warn('Rate limiter redis operation failed, allowing request', {
      key,
      error: err.message,
    });

    return {
      allowed: true,
      degraded: true,
      limit: maxRequests,
      remaining: maxRequests,
      retryAfter: windowSeconds,
      totalHits: 0,
    };
  }
}

module.exports = {
  checkLimit,
};
