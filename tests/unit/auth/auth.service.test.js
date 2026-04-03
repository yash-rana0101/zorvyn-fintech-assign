'use strict';

/**
 * Unit tests for auth.service.js
 * 
 * DB and Redis are fully mocked — these tests are fast and offline.
 */

// ─── Mock dependencies BEFORE requiring the module ───────────────────────
jest.mock('../../../apps/api/src/config/db', () => ({
  query: jest.fn(),
}));

jest.mock('../../../packages/cache/cacheManager', () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../packages/security/passwordHasher', () => ({
  hashPassword: jest.fn(),
  comparePassword: jest.fn(),
}));

jest.mock('../../../packages/security/tokenManager', () => ({
  blacklistToken: jest.fn().mockResolvedValue(undefined),
  isBlacklisted: jest.fn().mockResolvedValue(false),
  getRefreshSession: jest.fn().mockResolvedValue(null),
  revokeRefreshSession: jest.fn().mockResolvedValue(true),
  upsertRefreshSession: jest.fn().mockResolvedValue(true),
  invalidateRole: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { query } = require('../../../apps/api/src/config/db');
const { cacheManager } = require('../../../packages/cache/cacheManager');
const { hashPassword, comparePassword } = require('../../../packages/security/passwordHasher');
const tokenManager = require('../../../packages/security/tokenManager');
const {
  decodeToken,
  generateRefreshToken,
  hashToken,
} = require('../../../apps/api/src/modules/auth/token.service');
const authService = require('../../../apps/api/src/modules/auth/auth.service');

// ─── Test Data ───────────────────────────────────────────────────────────
const mockUser = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'test@example.com',
  password_hash: '$2a$12$hashedpassword',
  role: 'viewer',
  status: 'active',
  created_at: new Date(),
};

// ─── register() ──────────────────────────────────────────────────────────
describe('authService.register()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hashPassword.mockResolvedValue('$2a$12$hashedpassword');
    cacheManager.set.mockResolvedValue(true);
    tokenManager.upsertRefreshSession.mockResolvedValue(true);
  });

  it('should register a new user and return access_token', async () => {
    query
      .mockResolvedValueOnce({ rows: [] }) // no existing user
      .mockResolvedValueOnce({ rows: [mockUser] }); // INSERT result

    const result = await authService.register({
      email: 'test@example.com',
      password: 'Password123',
      role: 'viewer',
    });

    expect(result).toHaveProperty('access_token');
    expect(result.user.email).toBe('test@example.com');
    expect(result.user.role).toBe('viewer');
  });

  it('should throw 409 if email already exists', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: mockUser.id }] });

    await expect(
      authService.register({ email: 'test@example.com', password: 'Password123' })
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('should throw ZodError for invalid email', async () => {
    await expect(
      authService.register({ email: 'not-an-email', password: 'Password123' })
    ).rejects.toThrow();
  });

  it('should throw ZodError for short password', async () => {
    await expect(
      authService.register({ email: 'test@example.com', password: 'short' })
    ).rejects.toThrow();
  });

  it('should default role to viewer', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ ...mockUser, role: 'viewer' }] });

    const result = await authService.register({
      email: 'new@example.com',
      password: 'Password123',
    });

    expect(result.user.role).toBe('viewer');
  });

  it('should cache role in Redis after registration', async () => {
    query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [mockUser] });

    await authService.register({ email: 'test@example.com', password: 'Password123' });

    expect(cacheManager.set).toHaveBeenCalledWith(
      `user:${mockUser.id}:role`,
      mockUser.role,
      expect.any(Number)
    );
  });
});

// ─── login() ─────────────────────────────────────────────────────────────
describe('authService.login()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.set.mockResolvedValue(true);
    tokenManager.upsertRefreshSession.mockResolvedValue(true);
  });

  it('should return access_token for valid credentials', async () => {
    query.mockResolvedValueOnce({ rows: [mockUser] });
    comparePassword.mockResolvedValueOnce(true);

    const result = await authService.login({
      email: 'test@example.com',
      password: 'Password123',
    });

    expect(result).toHaveProperty('access_token');
    expect(typeof result.access_token).toBe('string');
    expect(result.user.email).toBe(mockUser.email);
  });

  it('should throw 401 if user not found', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    await expect(
      authService.login({ email: 'nobody@example.com', password: 'Password123' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should throw 401 if password is wrong', async () => {
    query.mockResolvedValueOnce({ rows: [mockUser] });
    comparePassword.mockResolvedValueOnce(false);

    await expect(
      authService.login({ email: 'test@example.com', password: 'WrongPassword' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('should throw 403 if user is inactive', async () => {
    query.mockResolvedValueOnce({ rows: [{ ...mockUser, status: 'inactive' }] });

    await expect(
      authService.login({ email: 'test@example.com', password: 'Password123' })
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('should cache role in Redis on successful login', async () => {
    query.mockResolvedValueOnce({ rows: [mockUser] });
    comparePassword.mockResolvedValueOnce(true);

    await authService.login({ email: 'test@example.com', password: 'Password123' });

    expect(cacheManager.set).toHaveBeenCalledWith(
      `user:${mockUser.id}:role`,
      mockUser.role,
      expect.any(Number)
    );
  });
});

// ─── getProfile() ────────────────────────────────────────────────────────
describe('authService.getProfile()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.set.mockResolvedValue(true);
  });

  it('should return user profile', async () => {
    cacheManager.get.mockResolvedValueOnce('viewer');
    query.mockResolvedValueOnce({ rows: [mockUser] });

    const profile = await authService.getProfile(mockUser.id);

    expect(profile.id).toBe(mockUser.id);
    expect(profile.email).toBe(mockUser.email);
    expect(profile.role).toBe(mockUser.role);
  });

  it('should throw 404 if user not found', async () => {
    cacheManager.get.mockResolvedValueOnce(null);
    query.mockResolvedValueOnce({ rows: [] });

    await expect(authService.getProfile('non-existent-id'))
      .rejects.toMatchObject({ statusCode: 404 });
  });

  it('should refresh Redis cache on cache miss', async () => {
    cacheManager.get.mockResolvedValueOnce(null); // Cache miss
    query.mockResolvedValueOnce({ rows: [mockUser] });

    await authService.getProfile(mockUser.id);

    expect(cacheManager.set).toHaveBeenCalledWith(
      `user:${mockUser.id}:role`,
      mockUser.role,
      expect.any(Number)
    );
  });
});

describe('authService.refresh()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheManager.set.mockResolvedValue(true);
    tokenManager.isBlacklisted.mockResolvedValue(false);
    tokenManager.upsertRefreshSession.mockResolvedValue(true);
  });

  it('rotates refresh token and returns new token pair', async () => {
    const refreshToken = generateRefreshToken(
      {
        user_id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      },
      {
        session_id: '76f372f3-bfc0-4bc0-b870-b82693c20ce0',
        device_id: 'web',
      }
    );

    const decoded = decodeToken(refreshToken);

    tokenManager.getRefreshSession.mockResolvedValueOnce({
      session_id: decoded.session_id,
      refresh_token_hash: hashToken(refreshToken),
      expires_at: decoded.exp,
    });

    query.mockResolvedValueOnce({
      rows: [
        {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          status: 'active',
        },
      ],
    });

    const result = await authService.refresh({
      refresh_token: refreshToken,
      device_id: 'web',
    });

    expect(result).toHaveProperty('access_token');
    expect(result).toHaveProperty('refresh_token');
    expect(result.refresh_token).not.toBe(refreshToken);
    expect(tokenManager.blacklistToken).toHaveBeenCalled();
  });

  it('rejects revoked refresh token', async () => {
    const refreshToken = generateRefreshToken(
      {
        user_id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      },
      {
        session_id: '3f0968cd-bf7f-4314-8af2-5d4f5e70453d',
        device_id: 'web',
      }
    );

    tokenManager.isBlacklisted.mockResolvedValueOnce(true);

    await expect(
      authService.refresh({ refresh_token: refreshToken, device_id: 'web' })
    ).rejects.toMatchObject({ statusCode: 401 });
  });
});

describe('authService.logout()', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    tokenManager.blacklistToken.mockResolvedValue(undefined);
    tokenManager.revokeRefreshSession.mockResolvedValue(true);
  });

  it('revokes refresh session and access token', async () => {
    const refreshToken = generateRefreshToken(
      {
        user_id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      },
      {
        session_id: '85bb3f4a-a2d5-4fc4-905e-2f6d75ebec74',
        device_id: 'web',
      }
    );

    const decoded = decodeToken(refreshToken);
    tokenManager.getRefreshSession.mockResolvedValueOnce({
      session_id: decoded.session_id,
      refresh_token_hash: hashToken(refreshToken),
      expires_at: decoded.exp,
    });

    const result = await authService.logout({
      refresh_token: refreshToken,
      device_id: 'web',
      access_jti: 'access-jti-1',
      access_exp: Math.floor(Date.now() / 1000) + 600,
    });

    expect(result.logged_out).toBe(true);
    expect(tokenManager.revokeRefreshSession).toHaveBeenCalledWith(mockUser.id, 'web');
    expect(tokenManager.blacklistToken).toHaveBeenCalled();
  });
});
