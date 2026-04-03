'use strict';

jest.mock('../../../packages/cache/redisClient', () => ({
  getRedisClient: jest.fn(),
  isRedisReady: jest.fn(),
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  http: jest.fn(),
}));

const { getRedisClient, isRedisReady } = require('../../../packages/cache/redisClient');
const { checkLimit } = require('../../../apps/api/src/shared/rate-limiter/rateLimiter');

describe('shared rate limiter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns degraded allow when redis is not ready', async () => {
    isRedisReady.mockReturnValue(false);

    const result = await checkLimit('user-1', {
      maxRequests: 100,
      windowMs: 60_000,
      keyPrefix: 'rate',
    });

    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(getRedisClient).not.toHaveBeenCalled();
  });

  it('increments and sets expiry on first hit', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
      ttl: jest.fn().mockResolvedValue(60),
    };

    isRedisReady.mockReturnValue(true);
    getRedisClient.mockReturnValue(redis);

    const result = await checkLimit('user-42', {
      maxRequests: 100,
      windowMs: 60_000,
      keyPrefix: 'rate',
    });

    expect(redis.incr).toHaveBeenCalledWith('rate:user-42');
    expect(redis.expire).toHaveBeenCalledWith('rate:user-42', 60);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(99);
    expect(result.degraded).toBe(false);
  });

  it('blocks requests over configured threshold', async () => {
    const redis = {
      incr: jest.fn().mockResolvedValue(101),
      expire: jest.fn(),
      ttl: jest.fn().mockResolvedValue(12),
    };

    isRedisReady.mockReturnValue(true);
    getRedisClient.mockReturnValue(redis);

    const result = await checkLimit('user-99', {
      maxRequests: 100,
      windowMs: 60_000,
      keyPrefix: 'rate',
    });

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBe(12);
    expect(result.remaining).toBe(0);
  });

  it('fails open if redis operation throws', async () => {
    const redis = {
      incr: jest.fn().mockRejectedValue(new Error('redis unavailable')),
      expire: jest.fn(),
      ttl: jest.fn(),
    };

    isRedisReady.mockReturnValue(true);
    getRedisClient.mockReturnValue(redis);

    const result = await checkLimit('user-fallback', {
      maxRequests: 100,
      windowMs: 60_000,
      keyPrefix: 'rate',
    });

    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
  });
});
