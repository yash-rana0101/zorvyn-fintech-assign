'use strict';

jest.mock('../../../apps/api/src/modules/finance/finance.repository', () => ({
  createWithIdempotency: jest.fn(),
  findById: jest.fn(),
  findByIdempotencyKey: jest.fn(),
  list: jest.fn(),
  count: jest.fn(),
  update: jest.fn(),
  deleteById: jest.fn(),
}));

jest.mock('../../../apps/api/src/modules/user/user.repository', () => ({
  findById: jest.fn(),
  findByEmail: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  list: jest.fn(),
  count: jest.fn(),
}));

jest.mock('../../../apps/api/src/config/db', () => ({
  getClient: jest.fn(),
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  http: jest.fn(),
}));

const request = require('supertest');
const app = require('../../../apps/api/src/app');
const { generateToken } = require('../../../apps/api/src/modules/auth/token.service');
const financeRepository = require('../../../apps/api/src/modules/finance/finance.repository');
const userRepository = require('../../../apps/api/src/modules/user/user.repository');
const { getClient } = require('../../../apps/api/src/config/db');
const financeService = require('../../../apps/api/src/modules/finance/finance.service');
const analyticsService = require('../../../apps/api/src/modules/analytics/analytics.service');
const {
  registerAnalyticsConsumers,
  unregisterAnalyticsConsumers,
} = require('../../../apps/api/src/modules/analytics/analytics.consumer');
const { eventBus } = require('../../../packages/event-bus/eventBus');

async function flushAsyncTicks(count = 1) {
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('Analytics module integration', () => {
  const viewer = {
    user_id: '550e8400-e29b-41d4-a716-446655440331',
    email: 'viewer.analytics@example.com',
    role: 'viewer',
  };

  const admin = {
    user_id: '550e8400-e29b-41d4-a716-446655440332',
    email: 'admin.analytics@example.com',
    role: 'admin',
  };

  let viewerToken;
  let adminToken;

  beforeEach(() => {
    jest.clearAllMocks();

    analyticsService.resetAnalyticsState();
    unregisterAnalyticsConsumers();
    eventBus.clearAllSubscribers();
    registerAnalyticsConsumers();

    viewerToken = generateToken(viewer);
    adminToken = generateToken(admin);

    userRepository.findById.mockImplementation(async (id) => {
      if (id === viewer.user_id) {
        return { id, status: 'active', role: 'viewer' };
      }

      if (id === admin.user_id) {
        return { id, status: 'active', role: 'admin' };
      }

      return { id, status: 'active', role: 'viewer' };
    });

    const mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    getClient.mockResolvedValue(mockClient);
  });

  afterAll(() => {
    unregisterAnalyticsConsumers();
    eventBus.clearAllSubscribers();
  });

  it('returns summary and monthly trends from event-driven aggregates', async () => {
    financeRepository.createWithIdempotency
      .mockResolvedValueOnce({
        created: true,
        transaction: {
          id: 'fd4a9f51-d1ab-4f8a-aeab-ecdf507f7011',
          user_id: viewer.user_id,
          amount: '1200.00',
          type: 'income',
          category: 'salary',
          note: null,
          timestamp: new Date('2026-01-02T10:00:00.000Z'),
          created_at: new Date('2026-01-02T10:00:00.000Z'),
          updated_at: new Date('2026-01-02T10:00:00.000Z'),
        },
      })
      .mockResolvedValueOnce({
        created: true,
        transaction: {
          id: 'fd4a9f51-d1ab-4f8a-aeab-ecdf507f7012',
          user_id: viewer.user_id,
          amount: '200.00',
          type: 'expense',
          category: 'food',
          note: null,
          timestamp: new Date('2026-02-05T12:00:00.000Z'),
          created_at: new Date('2026-02-05T12:00:00.000Z'),
          updated_at: new Date('2026-02-05T12:00:00.000Z'),
        },
      });

    await financeService.createTransaction(
      {
        amount: 1200,
        type: 'income',
        category: 'salary',
        timestamp: '2026-01-02T10:00:00.000Z',
        idempotency_key: 'phase5-analytics-1',
      },
      viewer.user_id
    );

    await financeService.createTransaction(
      {
        amount: 200,
        type: 'expense',
        category: 'food',
        timestamp: '2026-02-05T12:00:00.000Z',
        idempotency_key: 'phase5-analytics-2',
      },
      viewer.user_id
    );

    await flushAsyncTicks(5);

    const summaryRes = await request(app)
      .get('/api/v1/analytics/summary')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.success).toBe(true);
    expect(summaryRes.body.data).toEqual({
      total_income: 1200,
      total_expense: 200,
      net_balance: 1000,
    });

    const trendsRes = await request(app)
      .get('/api/v1/analytics/trends?period=monthly')
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(trendsRes.status).toBe(200);
    expect(trendsRes.body.success).toBe(true);
    expect(trendsRes.body.data).toEqual([
      {
        month: 'Jan',
        income: 1200,
        expense: 0,
      },
      {
        month: 'Feb',
        income: 0,
        expense: 200,
      },
    ]);
  });

  it('prevents viewers from requesting another user summary', async () => {
    const res = await request(app)
      .get(`/api/v1/analytics/summary?user_id=${admin.user_id}`)
      .set('Authorization', `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('allows admin to request analytics for another user', async () => {
    await analyticsService.consumeTransactionCreated({
      payload: {
        user_id: viewer.user_id,
        amount: 99,
        type: 'income',
        category: 'salary',
        timestamp: '2026-03-01T00:00:00.000Z',
      },
    });

    const res = await request(app)
      .get(`/api/v1/analytics/summary?user_id=${viewer.user_id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.net_balance).toBe(99);
  });
});
