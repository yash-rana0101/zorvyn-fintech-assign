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
}));

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
const { TOPICS } = require('../../../packages/event-bus/topics');

async function flushAsyncTicks(count = 1) {
  for (let i = 0; i < count; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe('Phase 4 finance-to-analytics event flow', () => {
  const userId = '550e8400-e29b-41d4-a716-446655440321';
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    analyticsService.resetAnalyticsState();
    unregisterAnalyticsConsumers();
    eventBus.clearAllSubscribers();
    registerAnalyticsConsumers();

    userRepository.findById.mockResolvedValue({
      id: userId,
      status: 'active',
      role: 'analyst',
    });

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    getClient.mockResolvedValue(mockClient);
  });

  afterAll(() => {
    unregisterAnalyticsConsumers();
    eventBus.clearAllSubscribers();
  });

  it('processes TransactionCreated asynchronously after finance write', async () => {
    financeRepository.createWithIdempotency.mockResolvedValue({
      created: true,
      transaction: {
        id: 'fd4a9f51-d1ab-4f8a-aeab-ecdf507f8a11',
        user_id: userId,
        amount: '1000.00',
        type: 'income',
        category: 'salary',
        note: null,
        timestamp: new Date('2026-01-01T10:00:00.000Z'),
        created_at: new Date('2026-01-01T10:00:00.000Z'),
        updated_at: new Date('2026-01-01T10:00:00.000Z'),
      },
    });

    await financeService.createTransaction(
      {
        amount: 1000,
        type: 'income',
        category: 'salary',
        idempotency_key: 'phase4-flow-1',
      },
      userId
    );

    await flushAsyncTicks(3);

    expect(analyticsService.getUserSnapshot(userId)).toEqual(
      expect.objectContaining({
        total_income: 1000,
        total_expense: 0,
        net_balance: 1000,
        events_processed: 1,
      })
    );
  });

  it('executes multiple subscribers independently when one fails', async () => {
    financeRepository.createWithIdempotency.mockResolvedValue({
      created: true,
      transaction: {
        id: 'fd4a9f51-d1ab-4f8a-aeab-ecdf507f8a12',
        user_id: userId,
        amount: '250.00',
        type: 'expense',
        category: 'ops',
        note: null,
        timestamp: new Date('2026-01-02T10:00:00.000Z'),
        created_at: new Date('2026-01-02T10:00:00.000Z'),
        updated_at: new Date('2026-01-02T10:00:00.000Z'),
      },
    });

    const failingHandler = jest.fn(() => {
      throw new Error('subscriber failure');
    });
    const healthyHandler = jest.fn();

    eventBus.subscribe(TOPICS.TRANSACTION_CREATED, failingHandler);
    eventBus.subscribe(TOPICS.TRANSACTION_CREATED, healthyHandler);

    await financeService.createTransaction(
      {
        amount: 250,
        type: 'expense',
        category: 'ops',
        idempotency_key: 'phase4-flow-2',
      },
      userId
    );

    await flushAsyncTicks(5);

    expect(healthyHandler).toHaveBeenCalledTimes(1);
    expect(failingHandler).toHaveBeenCalledTimes(2);
    expect(analyticsService.getUserSnapshot(userId)).toEqual(
      expect.objectContaining({
        total_income: 0,
        total_expense: 250,
        net_balance: -250,
        events_processed: 1,
      })
    );
  });
});
