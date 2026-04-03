'use strict';

jest.mock('../../../packages/cache/redisClient', () => ({
  getRedisClient: jest.fn(),
  isRedisReady: jest.fn(),
}));

jest.mock('../../../packages/database/connection', () => ({
  getPool: jest.fn(),
}));

jest.mock('../../../packages/event-bus/eventBus', () => ({
  eventBus: {
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

const { getRedisClient, isRedisReady } = require('../../../packages/cache/redisClient');
const { getPool } = require('../../../packages/database/connection');
const { eventBus } = require('../../../packages/event-bus/eventBus');
const { createHealthCheck } = require('../../../packages/monitoring/healthCheck');

function createMockResponse() {
  const response = {
    statusCode: 0,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };

  return response;
}

describe('healthCheck', () => {
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

  it('returns healthy response when dependencies are available', async () => {
    const handler = createHealthCheck({ serviceName: 'api' });

    const req = {
      headers: {},
      app: { locals: {} },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.status).toBe('healthy');
    expect(res.body.checks.postgres.status).toBe('ok');
    expect(res.body.checks.redis.status).toBe('ok');
    expect(res.body.checks.event_bus.status).toBe('disabled');
  });

  it('returns degraded status when postgres check fails', async () => {
    getPool.mockReturnValue({
      query: jest.fn().mockRejectedValue(new Error('connection refused')),
    });

    const handler = createHealthCheck({ serviceName: 'api' });

    const req = {
      headers: {},
      app: { locals: {} },
    };
    const res = createMockResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks.postgres.status).toBe('error');
  });
});
