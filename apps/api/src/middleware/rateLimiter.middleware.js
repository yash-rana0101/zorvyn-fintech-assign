'use strict';

const logger = require('../../../../packages/logger/logger');
const { checkLimit } = require('../shared/rate-limiter/rateLimiter');

function getWindowMs() {
  const parsed = Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 60_000;
  }

  return parsed;
}

function getMaxRequests() {
  const parsed = Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 100;
  }

  return parsed;
}

function setRateLimitHeaders(res, details, { includeRetryAfter = false } = {}) {
  if (!details) {
    return;
  }

  res.setHeader('X-RateLimit-Limit', String(details.limit));
  res.setHeader('X-RateLimit-Remaining', String(details.remaining));

  if (includeRetryAfter) {
    res.setHeader('Retry-After', String(details.retryAfter));
  }
}

function createRedisRateLimiter({
  windowMs,
  maxRequests,
  keyPrefix,
  resolveIdentity,
  limitExceededMessage,
  logLabel,
}) {
  return async (req, res, next) => {
    const identity = resolveIdentity(req);

    const result = await checkLimit(identity, {
      maxRequests,
      windowMs,
      keyPrefix,
    });

    setRateLimitHeaders(res, result);

    if (!result.allowed) {
      setRateLimitHeaders(res, result, { includeRetryAfter: true });

      logger.warn(logLabel, {
        identity,
        path: req.path,
        method: req.method,
      });

      return res.status(429).json({
        success: false,
        error: limitExceededMessage,
        retryAfter: result.retryAfter,
      });
    }

    return next();
  };
}

/**
 * Default rate limiter.
 * 100 requests per minute per authenticated user when available.
 */
const defaultLimiter = createRedisRateLimiter({
  windowMs: getWindowMs(),
  maxRequests: getMaxRequests(),
  keyPrefix: 'rate',
  resolveIdentity: (req) => req.user?.user_id || req.ip,
  limitExceededMessage: 'Too many requests. Please try again later.',
  logLabel: 'Rate limit exceeded',
});

/**
 * Strict auth limiter for sensitive endpoints.
 * 10 requests per 15 minutes keyed by email (fallback to IP).
 */
const authLimiter = createRedisRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxRequests: 10,
  keyPrefix: 'auth-rate',
  resolveIdentity: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    return email || req.ip;
  },
  limitExceededMessage: 'Too many authentication attempts. Please try again in 15 minutes.',
  logLabel: 'Auth rate limit exceeded',
});

const noopLimiter = (req, res, next) => next();

module.exports = {
  defaultLimiter: process.env.NODE_ENV === 'test' ? noopLimiter : defaultLimiter,
  authLimiter: process.env.NODE_ENV === 'test' ? noopLimiter : authLimiter,
};
