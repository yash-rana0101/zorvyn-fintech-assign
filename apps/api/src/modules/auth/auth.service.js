'use strict';

const { z } = require('zod');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../../config/db');
const {
  decodeToken,
  generateRefreshToken,
  generateToken,
  getTokenTtlSeconds,
  hashToken,
  verifyRefreshToken,
} = require('./token.service');
const { hashPassword, comparePassword } = require('../../../../../packages/security/passwordHasher');
const { cacheManager } = require('../../../../../packages/cache/cacheManager');
const {
  blacklistToken,
  getRefreshSession,
  isBlacklisted,
  revokeRefreshSession,
  upsertRefreshSession,
} = require('../../../../../packages/security/tokenManager');
const logger = require('../../../../../packages/logger/logger');
const { ROLES } = require('./auth.types');

// ─── Validation Schemas ──────────────────────────────────────────────────────
const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
  device_id: z.string().trim().max(64, 'device_id is too long').optional(),
});

const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum([ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER]).default(ROLES.VIEWER),
  device_id: z.string().trim().max(64, 'device_id is too long').optional(),
});

const refreshSchema = z.object({
  refresh_token: z.string().min(20, 'refresh_token is required'),
  device_id: z.string().trim().max(64, 'device_id is too long').optional(),
});

const logoutSchema = z.object({
  refresh_token: z.string().min(20).optional(),
  device_id: z.string().trim().max(64, 'device_id is too long').optional(),
});

// ─── Redis Cache Key ─────────────────────────────────────────────────────────
const roleKey = (userId) => `user:${userId}:role`;
const ROLE_TTL = parseInt(process.env.RBAC_CACHE_TTL || '300', 10); // 5 min default
const DEFAULT_DEVICE_ID = 'web';

// ─── Service Functions ───────────────────────────────────────────────────────

function normalizeDeviceId(value) {
  if (typeof value !== 'string') {
    return DEFAULT_DEVICE_ID;
  }

  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
  if (!normalized) {
    return DEFAULT_DEVICE_ID;
  }

  return normalized.slice(0, 64);
}

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

function buildUnauthorizedError(message) {
  const err = new Error(message);
  err.statusCode = 401;
  return err;
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
  };
}

async function issueTokenBundle(user, deviceId, previousSessionId = null) {
  const sessionId = uuidv4();

  const access_token = generateToken(sanitizeUser(user), {
    session_id: sessionId,
    device_id: deviceId,
  });

  const refresh_token = generateRefreshToken(sanitizeUser(user), {
    session_id: sessionId,
    device_id: deviceId,
  });

  const refreshPayload = decodeToken(refresh_token) || {};
  const refreshTtlSeconds = Math.max(1, getTokenTtlSeconds(refresh_token));

  await upsertRefreshSession(
    user.id,
    deviceId,
    {
      session_id: sessionId,
      refresh_token_hash: hashToken(refresh_token),
      expires_at: refreshPayload.exp || nowInSeconds() + refreshTtlSeconds,
      previous_session_id: previousSessionId,
    },
    refreshTtlSeconds
  );

  return {
    access_token,
    refresh_token,
    token_type: 'Bearer',
    expires_in: getTokenTtlSeconds(access_token),
    refresh_expires_in: refreshTtlSeconds,
    session_id: sessionId,
    device_id: deviceId,
  };
}

async function getActiveUserById(userId) {
  const result = await query(
    'SELECT id, email, role, status FROM users WHERE id = $1',
    [userId]
  );

  const user = result.rows[0];
  if (!user) {
    throw buildUnauthorizedError('Invalid refresh token');
  }

  if (user.status !== 'active') {
    const err = new Error('Account is inactive');
    err.statusCode = 403;
    throw err;
  }

  return user;
}

/**
 * Register a new user.
 * @param {object} input
 * @returns {{ access_token: string, user: object }}
 */
async function register(input) {
  const data = registerSchema.parse(input);
  const deviceId = normalizeDeviceId(data.device_id);

  // Check if user exists
  const existing = await query(
    'SELECT id FROM users WHERE email = $1',
    [data.email]
  );
  if (existing.rows.length > 0) {
    const err = new Error('Email already registered');
    err.statusCode = 409;
    throw err;
  }

  const id = uuidv4();
  const passwordHash = await hashPassword(data.password);

  const result = await query(
    `INSERT INTO users (id, email, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, 'active', NOW(), NOW())
     RETURNING id, email, role, status, created_at`,
    [id, data.email, passwordHash, data.role]
  );

  const user = result.rows[0];

  // Cache role in Redis for fast RBAC lookups
  await cacheManager.set(roleKey(user.id), user.role, ROLE_TTL);

  const tokenBundle = await issueTokenBundle(user, deviceId);

  logger.info('User registered', { user_id: user.id, role: user.role });

  return {
    ...tokenBundle,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
    },
  };
}

/**
 * Authenticate a user with email + password, return JWT.
 * @param {object} input
 * @returns {{ access_token: string, user: object }}
 */
async function login(input) {
  const data = loginSchema.parse(input);
  const deviceId = normalizeDeviceId(data.device_id);

  // Fetch user from DB
  const result = await query(
    'SELECT id, email, password_hash, role, status FROM users WHERE email = $1',
    [data.email]
  );

  if (result.rows.length === 0) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  const user = result.rows[0];

  if (user.status !== 'active') {
    const err = new Error('Account is inactive');
    err.statusCode = 403;
    throw err;
  }

  const valid = await comparePassword(data.password, user.password_hash);
  if (!valid) {
    const err = new Error('Invalid email or password');
    err.statusCode = 401;
    throw err;
  }

  // Cache role in Redis for fast future RBAC lookups
  await cacheManager.set(roleKey(user.id), user.role, ROLE_TTL);

  const tokenBundle = await issueTokenBundle(user, deviceId);

  logger.info('User logged in', { user_id: user.id, role: user.role });

  return {
    ...tokenBundle,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Get user profile — checks Redis first, falls back to DB.
 * This demonstrates the Redis-first caching pattern for RBAC.
 *
 * @param {string} userId
 * @returns {object} User profile
 */
async function getProfile(userId) {
  // Try Redis first
  let role = await cacheManager.get(roleKey(userId));

  const result = await query(
    'SELECT id, email, role, status, created_at FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  const user = result.rows[0];

  // If Redis miss, refresh cache
  if (!role) {
    logger.debug('Redis miss for role, refreshing cache', { userId });
    await cacheManager.set(roleKey(userId), user.role, ROLE_TTL);
  }

  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
  };
}

/**
 * Rotate refresh token and issue a new session/token pair.
 *
 * @param {{ refresh_token: string, device_id?: string }} input
 */
async function refresh(input) {
  const data = refreshSchema.parse(input || {});
  const payload = verifyRefreshToken(data.refresh_token);

  const userId = payload.user_id;
  const deviceId = normalizeDeviceId(data.device_id || payload.device_id);

  if (!userId || !payload.session_id) {
    throw buildUnauthorizedError('Invalid refresh token');
  }

  if (payload.jti) {
    const wasRevoked = await isBlacklisted(`refresh:${payload.jti}`);
    if (wasRevoked) {
      throw buildUnauthorizedError('Refresh token has been revoked');
    }
  }

  const activeSession = await getRefreshSession(userId, deviceId);
  if (!activeSession) {
    throw buildUnauthorizedError('Refresh session not found or expired');
  }

  if (activeSession.session_id !== payload.session_id) {
    throw buildUnauthorizedError('Refresh token session mismatch');
  }

  if (activeSession.refresh_token_hash !== hashToken(data.refresh_token)) {
    throw buildUnauthorizedError('Refresh token has been rotated');
  }

  if (Number(activeSession.expires_at) <= nowInSeconds()) {
    await revokeRefreshSession(userId, deviceId);
    throw buildUnauthorizedError('Refresh token has expired');
  }

  const user = await getActiveUserById(userId);
  await cacheManager.set(roleKey(user.id), user.role, ROLE_TTL);

  const rotated = await issueTokenBundle(user, deviceId, payload.session_id);

  const refreshJti = typeof payload.jti === 'string' ? payload.jti : null;
  if (refreshJti) {
    const ttlSeconds = getTokenTtlSeconds(data.refresh_token);
    if (ttlSeconds > 0) {
      await blacklistToken(`refresh:${refreshJti}`, ttlSeconds);
    }
  }

  return {
    ...rotated,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Logout by revoking current access token and optional refresh session.
 *
 * @param {{ refresh_token?: string, device_id?: string, access_jti?: string, access_exp?: number }} input
 */
async function logout(input) {
  const data = logoutSchema.parse(input || {});

  if (data.refresh_token) {
    const payload = verifyRefreshToken(data.refresh_token);
    const userId = payload.user_id;
    const deviceId = normalizeDeviceId(data.device_id || payload.device_id);

    const activeSession = await getRefreshSession(userId, deviceId);
    if (activeSession && activeSession.session_id === payload.session_id) {
      await revokeRefreshSession(userId, deviceId);
    }

    const refreshJti = typeof payload.jti === 'string' ? payload.jti : null;
    if (refreshJti) {
      const ttlSeconds = getTokenTtlSeconds(data.refresh_token);
      if (ttlSeconds > 0) {
        await blacklistToken(`refresh:${refreshJti}`, ttlSeconds);
      }
    }
  }

  if (typeof input?.access_jti === 'string' && input.access_jti.length > 0) {
    const ttlSeconds = Math.max(0, Number(input.access_exp) - nowInSeconds());
    if (ttlSeconds > 0) {
      await blacklistToken(input.access_jti, ttlSeconds);
    }
  }

  return {
    logged_out: true,
  };
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getProfile,
};
