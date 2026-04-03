'use strict';

/**
 * Integration tests for Auth endpoints.
 *
 * These tests use supertest to fire real HTTP requests against the Express app.
 * DB and Redis are mocked to keep tests fast and offline.
 */

const request = require('supertest');
const app = require('../../../apps/api/src/app');

// ─── Mock DB and Cache ───────────────────────────────────────────────────
jest.mock('../../../apps/api/src/config/db', () => ({
  query: jest.fn(),
}));

jest.mock('../../../packages/cache/cacheManager', () => ({
  cacheManager: {
    get: jest.fn().mockResolvedValue(null),
    getJSON: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(true),
    del: jest.fn().mockResolvedValue(true),
    exists: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('../../../packages/security/passwordHasher', () => ({
  hashPassword: jest.fn().mockResolvedValue('$2a$12$hashedpassword'),
  comparePassword: jest.fn(),
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

const { query } = require('../../../apps/api/src/config/db');
const { comparePassword } = require('../../../packages/security/passwordHasher');
const { cacheManager } = require('../../../packages/cache/cacheManager');

function sendJson(testRequest, payload) {
  return testRequest
    .set('Content-Type', 'application/json')
    .send(JSON.stringify(payload));
}

// ─── Fixtures ────────────────────────────────────────────────────────────
const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'integration@example.com',
  password_hash: '$2a$12$hashedpassword',
  role: 'viewer',
  status: 'active',
  created_at: new Date(),
};

// ─── POST /api/v1/auth/register ──────────────────────────────────────────
describe('POST /api/v1/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 201 with access_token for valid input', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })           // email unique check
      .mockResolvedValueOnce({ rows: [mockUser] });   // INSERT

    const res = await sendJson(
      request(app).post('/api/v1/auth/register'),
      { email: 'integration@example.com', password: 'Password123' }
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data.user.email).toBe(mockUser.email);
  });

  it('should return 400 for invalid email', async () => {
    const res = await sendJson(
      request(app).post('/api/v1/auth/register'),
      { email: 'not-an-email', password: 'Password123' }
    );

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for short password', async () => {
    const res = await sendJson(
      request(app).post('/api/v1/auth/register'),
      { email: 'valid@example.com', password: '123' }
    );

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 409 if email already taken', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: mockUser.id }] });

    const res = await sendJson(
      request(app).post('/api/v1/auth/register'),
      { email: 'integration@example.com', password: 'Password123' }
    );

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for missing fields', async () => {
    const res = await sendJson(request(app).post('/api/v1/auth/register'), {});

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/v1/auth/login ─────────────────────────────────────────────
describe('POST /api/v1/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should return 200 with access_token for valid credentials', async () => {
    query.mockResolvedValueOnce({ rows: [mockUser] });
    comparePassword.mockResolvedValueOnce(true);

    const res = await sendJson(
      request(app).post('/api/v1/auth/login'),
      { email: 'integration@example.com', password: 'Password123' }
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('access_token');
    expect(res.body.data).toHaveProperty('refresh_token');
    expect(typeof res.body.data.access_token).toBe('string');
  });

  it('should return 401 for wrong password', async () => {
    query.mockResolvedValueOnce({ rows: [mockUser] });
    comparePassword.mockResolvedValueOnce(false);

    const res = await sendJson(
      request(app).post('/api/v1/auth/login'),
      { email: 'integration@example.com', password: 'WrongPassword' }
    );

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 if user does not exist', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const res = await sendJson(
      request(app).post('/api/v1/auth/login'),
      { email: 'ghost@example.com', password: 'Password123' }
    );

    expect(res.status).toBe(401);
  });

  it('should return 400 for missing body', async () => {
    const res = await sendJson(request(app).post('/api/v1/auth/login'), {});

    expect(res.status).toBe(400);
  });
});

// ─── POST /api/v1/auth/refresh ───────────────────────────────────────────
describe('POST /api/v1/auth/refresh', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should rotate refresh token and return a new token pair', async () => {
    query.mockResolvedValue({ rows: [mockUser] });
    comparePassword.mockResolvedValueOnce(true);

    const loginRes = await sendJson(
      request(app).post('/api/v1/auth/login'),
      { email: 'integration@example.com', password: 'Password123', device_id: 'web' }
    );

    expect(loginRes.status).toBe(200);
    const originalRefreshToken = loginRes.body.data.refresh_token;

    const { decodeToken, hashToken } = require('../../../apps/api/src/modules/auth/token.service');
    const decoded = decodeToken(originalRefreshToken);

    cacheManager.getJSON.mockResolvedValueOnce({
      session_id: decoded.session_id,
      refresh_token_hash: hashToken(originalRefreshToken),
      expires_at: decoded.exp,
    });

    query.mockResolvedValueOnce({ rows: [mockUser] });

    const refreshRes = await sendJson(
      request(app).post('/api/v1/auth/refresh'),
      { refresh_token: originalRefreshToken, device_id: 'web' }
    );

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.success).toBe(true);
    expect(refreshRes.body.data).toHaveProperty('access_token');
    expect(refreshRes.body.data).toHaveProperty('refresh_token');
    expect(refreshRes.body.data.refresh_token).not.toBe(originalRefreshToken);
  });
});

// ─── POST /api/v1/auth/logout ────────────────────────────────────────────
describe('POST /api/v1/auth/logout', () => {
  beforeEach(() => jest.clearAllMocks());

  it('should revoke active session and return logged_out=true', async () => {
    query.mockResolvedValue({ rows: [mockUser] });
    comparePassword.mockResolvedValueOnce(true);

    const loginRes = await sendJson(
      request(app).post('/api/v1/auth/login'),
      { email: 'integration@example.com', password: 'Password123', device_id: 'web' }
    );

    const accessToken = loginRes.body.data.access_token;
    const refreshToken = loginRes.body.data.refresh_token;

    const { decodeToken, hashToken } = require('../../../apps/api/src/modules/auth/token.service');
    const decodedRefresh = decodeToken(refreshToken);

    cacheManager.getJSON.mockResolvedValueOnce({
      session_id: decodedRefresh.session_id,
      refresh_token_hash: hashToken(refreshToken),
      expires_at: decodedRefresh.exp,
    });

    const logoutRes = await sendJson(
      request(app)
        .post('/api/v1/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`),
      { refresh_token: refreshToken, device_id: 'web' }
    );

    expect(logoutRes.status).toBe(200);
    expect(logoutRes.body.success).toBe(true);
    expect(logoutRes.body.data.logged_out).toBe(true);
  });
});

// ─── GET /api/v1/auth/me ─────────────────────────────────────────────────
describe('GET /api/v1/auth/me', () => {
  let validToken;

  beforeEach(() => {
    jest.clearAllMocks();
    // Generate a real JWT for testing
    const { generateToken } = require('../../../apps/api/src/modules/auth/token.service');
    validToken = generateToken({
      user_id: mockUser.id,
      email: mockUser.email,
      role: mockUser.role,
    });
  });

  it('should return 200 with user profile for valid JWT', async () => {
    const { cacheManager } = require('../../../packages/cache/cacheManager');
    cacheManager.get.mockResolvedValueOnce(mockUser.role);
    query.mockResolvedValueOnce({ rows: [mockUser] });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${validToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe(mockUser.email);
    expect(res.body.data.role).toBe(mockUser.role);
    expect(res.body.data).not.toHaveProperty('password_hash');
  });

  it('should return 401 with no Authorization header', async () => {
    const res = await request(app).get('/api/v1/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('should return 401 for invalid token', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Bearer this.is.invalid');

    expect(res.status).toBe(401);
  });

  it('should return 401 for malformed Authorization header', async () => {
    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Token abc123');

    expect(res.status).toBe(401);
  });
});

// ─── GET /health ─────────────────────────────────────────────────────────
describe('GET /health', () => {
  it('should return 200 with status ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

// ─── 404 fallback ────────────────────────────────────────────────────────
describe('404 fallback', () => {
  it('should return 404 for unknown routes', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
