'use strict';

jest.mock('../../../apps/api/src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

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

jest.mock('../../../packages/cache/cacheManager', () => ({
  cacheManager: {
    get: jest.fn().mockResolvedValue(null),
    getJSON: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
  },
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

jest.mock('../../../packages/security/passwordHasher', () => ({
  hashPassword: jest.fn().mockResolvedValue('$2a$12$hashedpassword'),
  comparePassword: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../packages/security/tokenManager', () => ({
  invalidateRole: jest.fn().mockResolvedValue(undefined),
  isBlacklisted: jest.fn().mockResolvedValue(false),
  blacklistToken: jest.fn().mockResolvedValue(undefined),
  getRefreshSession: jest.fn().mockResolvedValue(null),
  revokeRefreshSession: jest.fn().mockResolvedValue(true),
  upsertRefreshSession: jest.fn().mockResolvedValue(true),
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  http: jest.fn(),
}));

jest.mock('../../../packages/monitoring/healthCheck', () => ({
  healthCheck: (req, res) => res.json({ status: 'ok' }),
}));

const request = require('supertest');
const app = require('../../../apps/api/src/app');
const { generateToken } = require('../../../apps/api/src/modules/auth/token.service');
const { getClient } = require('../../../apps/api/src/config/db');
const financeRepository = require('../../../apps/api/src/modules/finance/finance.repository');
const userRepository = require('../../../apps/api/src/modules/user/user.repository');

function sendJson(testRequest, payload) {
  return testRequest
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(payload));
}

const users = {
  admin: {
    user_id: '550e8400-e29b-41d4-a716-446655440010',
    email: 'admin@example.com',
    role: 'admin',
  },
  analyst: {
    user_id: '550e8400-e29b-41d4-a716-446655440020',
    email: 'analyst@example.com',
    role: 'analyst',
  },
  viewer: {
    user_id: '550e8400-e29b-41d4-a716-446655440030',
    email: 'viewer@example.com',
    role: 'viewer',
  },
};

const baseTransaction = {
  id: 'fd4a9f51-d1ab-4f8a-aeab-ecdf507f8c99',
  user_id: users.admin.user_id,
  amount: '1000.00',
  type: 'income',
  category: 'salary',
  note: 'monthly salary',
  timestamp: new Date('2026-01-01T10:00:00.000Z'),
  created_at: new Date('2026-01-01T10:00:00.000Z'),
  updated_at: new Date('2026-01-01T10:00:00.000Z'),
};

describe('Finance module integration', () => {
  let adminToken;
  let analystToken;
  let viewerToken;
  let mockClient;

  beforeEach(() => {
    jest.clearAllMocks();

    adminToken = generateToken(users.admin);
    analystToken = generateToken(users.analyst);
    viewerToken = generateToken(users.viewer);

    mockClient = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
      release: jest.fn(),
    };

    getClient.mockResolvedValue(mockClient);

    userRepository.findById.mockImplementation(async (id) => {
      if (id === users.admin.user_id) return { id, status: 'active', role: 'admin' };
      if (id === users.analyst.user_id) return { id, status: 'active', role: 'analyst' };
      if (id === users.viewer.user_id) return { id, status: 'active', role: 'viewer' };
      return { id, status: 'active', role: 'viewer' };
    });
  });

  describe('POST /api/v1/transactions', () => {
    it('creates a transaction for admin', async () => {
      financeRepository.createWithIdempotency.mockResolvedValue({
        created: true,
        transaction: baseTransaction,
      });

      const res = await sendJson(
        request(app)
          .post('/api/v1/transactions')
          .set('Authorization', `Bearer ${adminToken}`),
        {
          amount: 1000,
          type: 'income',
          category: 'salary',
          note: 'monthly salary',
          idempotency_key: 'idem-int-1',
        }
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(baseTransaction.id);
      expect(res.body.data.status).toBe('created');
    });

    it('returns existing transaction for duplicate idempotency key', async () => {
      financeRepository.createWithIdempotency.mockResolvedValue({
        created: false,
        transaction: baseTransaction,
      });

      const res = await sendJson(
        request(app)
          .post('/api/v1/transactions')
          .set('Authorization', `Bearer ${adminToken}`),
        {
          amount: 1000,
          type: 'income',
          category: 'salary',
          idempotency_key: 'idem-int-1',
        }
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(baseTransaction.id);
      expect(res.body.data.status).toBe('existing');
    });

    it('forbids viewer from creating transactions', async () => {
      const res = await sendJson(
        request(app)
          .post('/api/v1/transactions')
          .set('Authorization', `Bearer ${viewerToken}`),
        {
          amount: 1000,
          type: 'income',
          category: 'salary',
          idempotency_key: 'idem-int-denied-1',
        }
      );

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/transactions', () => {
    it('enforces viewer own-only visibility', async () => {
      financeRepository.list.mockResolvedValue([
        { ...baseTransaction, user_id: users.viewer.user_id },
      ]);
      financeRepository.count.mockResolvedValue(1);

      const res = await request(app)
        .get('/api/v1/transactions?user_id=550e8400-e29b-41d4-a716-446655440999&page=1&limit=10')
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(financeRepository.list).toHaveBeenCalledWith(
        expect.objectContaining({ user_id: users.viewer.user_id }),
        expect.objectContaining({ limit: 10, offset: 0 })
      );
    });

    it('returns filtered paginated result for admin', async () => {
      financeRepository.list.mockResolvedValue([baseTransaction]);
      financeRepository.count.mockResolvedValue(3);

      const res = await request(app)
        .get('/api/v1/transactions?type=income&category=salary&page=1&limit=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.pagination.total).toBe(3);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(1);
    });
  });

  describe('PUT /api/v1/transactions/:id', () => {
    it('forbids analyst from updating transactions', async () => {
      const res = await sendJson(
        request(app)
          .put(`/api/v1/transactions/${baseTransaction.id}`)
          .set('Authorization', `Bearer ${analystToken}`),
        {
          amount: 1500,
        }
      );

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
