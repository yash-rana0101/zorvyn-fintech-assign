'use strict';

jest.mock('../../../apps/api/src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../packages/database/connection', () => ({
  getPool: jest.fn(),
}));

jest.mock('../../../packages/cache/redisClient', () => ({
  getRedisClient: jest.fn(),
  isRedisReady: jest.fn(),
}));

jest.mock('../../../packages/event-bus/eventBus', () => ({
  eventBus: {
    publish: jest.fn(),
    subscribe: jest.fn(() => () => true),
    shutdown: jest.fn(),
    getHealth: jest.fn(),
  },
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  http: jest.fn(),
}));

const request = require('supertest');
const { getPool } = require('../../../packages/database/connection');
const { getRedisClient, isRedisReady } = require('../../../packages/cache/redisClient');
const { eventBus } = require('../../../packages/event-bus/eventBus');
const app = require('../../../apps/api/src/app');

describe('GET /health', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getPool.mockReturnValue({
      query: jest.fn().mockResolvedValue({ rows: [{ ok: 1 }] }),
    });

    isRedisReady.mockReturnValue(true);
    getRedisClient.mockReturnValue({
      ping: jest.fn().mockResolvedValue('PONG'),
    });

    eventBus.getHealth.mockReturnValue({
      redis_pubsub_enabled: false,
      publisher: { enabled: false, connected: false },
      subscriber: { enabled: false, connected: false, running: false },
    });
  });

  it('returns healthy with dependency checks', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    expect(response.body.status).toBe('healthy');
    expect(response.body.checks.postgres.status).toBe('ok');
    expect(response.body.checks.redis.status).toBe('ok');
    expect(response.body.checks.event_bus.status).toBe('disabled');
    expect(response.headers).toHaveProperty('x-request-id');
  });

  it('returns degraded when postgres is unavailable', async () => {
    getPool.mockReturnValue({
      query: jest.fn().mockRejectedValue(new Error('db unavailable')),
    });

    const response = await request(app).get('/health');

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('degraded');
    expect(response.body.checks.postgres.status).toBe('error');
  });
});
