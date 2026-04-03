'use strict';

jest.mock('../../../apps/api/src/config/db', () => ({
  query: jest.fn(),
}));

jest.mock('../../../packages/cache/cacheManager', () => ({
  cacheManager: {
    get: jest.fn().mockResolvedValue(null),
    getJSON: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
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
const { query } = require('../../../apps/api/src/config/db');
const { cacheManager } = require('../../../packages/cache/cacheManager');
const { hashPassword } = require('../../../packages/security/passwordHasher');
const { generateToken } = require('../../../apps/api/src/modules/auth/token.service');

function sendJson(testRequest, payload) {
  return testRequest
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(payload));
}

const adminUser = {
  id: '550e8400-e29b-41d4-a716-446655440010',
  name: 'Admin User',
  email: 'admin@example.com',
  role: 'admin',
  status: 'active',
  created_at: new Date(),
  updated_at: new Date(),
};

const viewerUser = {
  id: '550e8400-e29b-41d4-a716-446655440011',
  name: 'Viewer User',
  email: 'viewer@example.com',
  role: 'viewer',
  status: 'active',
  created_at: new Date(),
  updated_at: new Date(),
};

describe('User module integration', () => {
  let adminToken;
  let viewerToken;

  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.getJSON.mockResolvedValue(null);
    cacheManager.set.mockResolvedValue(true);
    cacheManager.del.mockResolvedValue(true);
    hashPassword.mockResolvedValue('$2a$12$hashedpassword');

    adminToken = generateToken({
      user_id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    });

    viewerToken = generateToken({
      user_id: viewerUser.id,
      email: viewerUser.email,
      role: viewerUser.role,
    });
  });

  describe('POST /api/v1/users', () => {
    it('creates user for admin role', async () => {
      const createdUser = {
        id: '550e8400-e29b-41d4-a716-446655440099',
        name: 'Yash',
        email: 'yash@example.com',
        role: 'analyst',
        status: 'active',
        created_at: new Date(),
        updated_at: new Date(),
      };

      query
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [createdUser] });

      const res = await sendJson(
        request(app)
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${adminToken}`),
        {
          name: 'Yash',
          email: 'yash@example.com',
          password: 'Password123',
          role: 'analyst',
        }
      );

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.email).toBe('yash@example.com');
      expect(res.body.data).not.toHaveProperty('password_hash');
    });

    it('rejects non-admin user', async () => {
      const res = await sendJson(
        request(app)
          .post('/api/v1/users')
          .set('Authorization', `Bearer ${viewerToken}`),
        {
          name: 'Yash',
          email: 'yash@example.com',
          password: 'Password123',
          role: 'analyst',
        }
      );

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/v1/users/:id', () => {
    it('allows analyst/viewer to fetch self', async () => {
      cacheManager.getJSON.mockResolvedValueOnce({
        id: viewerUser.id,
        name: viewerUser.name,
        email: viewerUser.email,
        role: viewerUser.role,
        status: viewerUser.status,
      });

      const res = await request(app)
        .get(`/api/v1/users/${viewerUser.id}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(viewerUser.id);
    });

    it('forbids analyst/viewer from fetching other users', async () => {
      const res = await request(app)
        .get(`/api/v1/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${viewerToken}`);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PUT /api/v1/users/:id', () => {
    it('allows self update for name only', async () => {
      const renamedUser = {
        ...viewerUser,
        name: 'Renamed Viewer',
      };

      query
        .mockResolvedValueOnce({ rows: [viewerUser] })
        .mockResolvedValueOnce({ rows: [renamedUser] });

      const res = await sendJson(
        request(app)
          .put(`/api/v1/users/${viewerUser.id}`)
          .set('Authorization', `Bearer ${viewerToken}`),
        { name: 'Renamed Viewer' }
      );

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Renamed Viewer');
    });

    it('rejects self role escalation attempts', async () => {
      query.mockResolvedValueOnce({ rows: [viewerUser] });

      const res = await sendJson(
        request(app)
          .put(`/api/v1/users/${viewerUser.id}`)
          .set('Authorization', `Bearer ${viewerToken}`),
        { role: 'admin' }
      );

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('DELETE /api/v1/users/:id', () => {
    it('deactivates user for admin role', async () => {
      const inactiveUser = {
        ...viewerUser,
        status: 'inactive',
      };

      query
        .mockResolvedValueOnce({ rows: [viewerUser] })
        .mockResolvedValueOnce({ rows: [inactiveUser] });

      const res = await request(app)
        .delete(`/api/v1/users/${viewerUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('inactive');
    });
  });

  describe('GET /api/v1/users', () => {
    it('returns paginated users for admin', async () => {
      query
        .mockResolvedValueOnce({ rows: [adminUser, viewerUser] })
        .mockResolvedValueOnce({ rows: [{ total: 5 }] });

      const res = await request(app)
        .get('/api/v1/users?page=1&limit=2')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.pagination.total).toBe(5);
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.limit).toBe(2);
    });
  });
});