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

jest.mock('../../../packages/event-bus/eventBus', () => ({
  eventBus: {
    publish: jest.fn(),
  },
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

jest.mock('../../../apps/api/src/shared/cache/cacheManager', () => ({
  cacheManager: {
    get: jest.fn().mockResolvedValue(null),
    getRaw: jest.fn().mockResolvedValue('1'),
    set: jest.fn().mockResolvedValue(true),
    increment: jest.fn().mockResolvedValue(1),
    invalidate: jest.fn().mockResolvedValue(true),
  },
}));

const financeRepository = require('../../../apps/api/src/modules/finance/finance.repository');
const userRepository = require('../../../apps/api/src/modules/user/user.repository');
const { getClient } = require('../../../apps/api/src/config/db');
const { eventBus } = require('../../../packages/event-bus/eventBus');
const { cacheManager } = require('../../../apps/api/src/shared/cache/cacheManager');
const financeService = require('../../../apps/api/src/modules/finance/finance.service');

const activeUser = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  status: 'active',
};

const baseTransaction = {
  id: 'fd4a9f51-d1ab-4f8a-aeab-ecdf507f8c99',
  user_id: activeUser.id,
  amount: '1000.00',
  type: 'income',
  category: 'salary',
  note: 'monthly',
  timestamp: new Date('2026-01-01T10:00:00.000Z'),
  created_at: new Date('2026-01-01T10:00:00.000Z'),
  updated_at: new Date('2026-01-01T10:00:00.000Z'),
};

describe('financeService.createTransaction()', () => {
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.findById.mockResolvedValue(activeUser);
    cacheManager.get.mockResolvedValue(null);
    cacheManager.getRaw.mockResolvedValue('1');
    cacheManager.set.mockResolvedValue(true);
    cacheManager.increment.mockResolvedValue(1);

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    getClient.mockResolvedValue(mockClient);
  });

  it('creates a transaction and emits TransactionCreated event', async () => {
    financeRepository.createWithIdempotency.mockResolvedValue({
      created: true,
      transaction: baseTransaction,
    });

    const result = await financeService.createTransaction(
      {
        amount: 1000,
        type: 'income',
        category: 'salary',
        note: 'monthly',
        idempotency_key: 'idem-create-1',
      },
      activeUser.id
    );

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(financeRepository.createWithIdempotency).toHaveBeenCalledWith(
      mockClient,
      expect.objectContaining({
        id: expect.any(String),
        user_id: activeUser.id,
        idempotency_key: 'idem-create-1',
      })
    );
    expect(mockClient.query).toHaveBeenNthCalledWith(2, 'COMMIT');
    expect(eventBus.publish).toHaveBeenCalledWith(
      'finance.transaction.created',
      expect.objectContaining({
        transaction_id: baseTransaction.id,
        user_id: baseTransaction.user_id,
        amount: 1000,
        type: 'income',
      })
    );
    expect(result.created).toBe(true);
    expect(result.transaction.amount).toBe(1000);
    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });

  it('returns existing transaction for duplicate idempotency key', async () => {
    financeRepository.createWithIdempotency.mockResolvedValue({
      created: false,
      transaction: baseTransaction,
    });

    const result = await financeService.createTransaction(
      {
        amount: 1000,
        type: 'income',
        category: 'salary',
        idempotency_key: 'idem-create-1',
      },
      activeUser.id
    );

    expect(result.created).toBe(false);
    expect(result.transaction.id).toBe(baseTransaction.id);
    expect(eventBus.publish).not.toHaveBeenCalled();
  });

  it('rejects invalid amount values', async () => {
    await expect(
      financeService.createTransaction(
        {
          amount: -10,
          type: 'income',
          category: 'salary',
          idempotency_key: 'idem-invalid-1',
        },
        activeUser.id
      )
    ).rejects.toThrow();

    expect(financeRepository.createWithIdempotency).not.toHaveBeenCalled();
  });
});

describe('financeService.getTransactions()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.findById.mockResolvedValue(activeUser);
    cacheManager.get.mockResolvedValue(null);
    cacheManager.getRaw.mockResolvedValue('1');
    cacheManager.set.mockResolvedValue(true);
  });

  it('returns cached paginated list on cache hit', async () => {
    const cachedResponse = {
      data: [
        {
          id: baseTransaction.id,
          user_id: baseTransaction.user_id,
          amount: 1000,
          type: baseTransaction.type,
          category: baseTransaction.category,
          note: baseTransaction.note,
          timestamp: baseTransaction.timestamp,
          created_at: baseTransaction.created_at,
          updated_at: baseTransaction.updated_at,
        },
      ],
      pagination: {
        total: 1,
        page: 1,
        limit: 10,
        pages: 1,
        has_next: false,
        has_prev: false,
      },
    };

    cacheManager.get.mockImplementation(async (key) => {
      if (String(key).startsWith('user:')) {
        return null;
      }

      return cachedResponse;
    });

    const result = await financeService.getTransactions(
      {
        page: '1',
        limit: '10',
      },
      {
        user_id: activeUser.id,
        role: 'admin',
      }
    );

    expect(result).toEqual(cachedResponse);
    expect(financeRepository.list).not.toHaveBeenCalled();
    expect(financeRepository.count).not.toHaveBeenCalled();
  });

  it('forces viewer scope to own user_id', async () => {
    financeRepository.list.mockResolvedValue([baseTransaction]);
    financeRepository.count.mockResolvedValue(1);

    const viewer = {
      user_id: '550e8400-e29b-41d4-a716-446655440099',
      role: 'viewer',
    };

    userRepository.findById.mockResolvedValue({
      id: viewer.user_id,
      status: 'active',
    });

    const result = await financeService.getTransactions(
      {
        user_id: '550e8400-e29b-41d4-a716-446655440123',
        page: '1',
        limit: '10',
      },
      viewer
    );

    expect(financeRepository.list).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: viewer.user_id }),
      expect.objectContaining({ limit: 10, offset: 0 })
    );
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });
});

describe('financeService.updateTransaction()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    userRepository.findById.mockResolvedValue(activeUser);
  });

  it('rejects update payload that tries to change idempotency key', async () => {
    await expect(
      financeService.updateTransaction(
        baseTransaction.id,
        { idempotency_key: 'should-not-change' },
        activeUser.id
      )
    ).rejects.toThrow();

    expect(financeRepository.findById).not.toHaveBeenCalled();
  });

  it('throws 404 when transaction does not exist', async () => {
    financeRepository.findById.mockResolvedValue(null);

    await expect(
      financeService.updateTransaction(baseTransaction.id, { amount: 1200 }, activeUser.id)
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
