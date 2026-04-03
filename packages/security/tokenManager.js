'use strict';

const { createHash } = require('crypto');
const { cacheManager } = require('../cache/cacheManager');
const logger = require('../logger/logger');

/**
 * Token Manager — handles token invalidation / blacklisting.
 *
 * Phase 1: Redis-based blacklist (simple approach)
 * Future: Short-lived access tokens + refresh token rotation
 *
 * Key: token:blacklist:{jti}  TTL = remaining token lifetime
 */

const BLACKLIST_PREFIX = 'token:blacklist:';
const SESSION_PREFIX = 'session:';

function normalizeDeviceId(deviceId) {
  const fallback = 'web';
  if (typeof deviceId !== 'string') {
    return fallback;
  }

  const normalized = deviceId.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, '-');
  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, 64);
}

function refreshSessionKey(userId, deviceId) {
  return `${SESSION_PREFIX}${userId}:${normalizeDeviceId(deviceId)}`;
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

/**
 * Blacklist a token (e.g., on logout).
 * @param {string} jti - JWT ID (or a hash of the token)
 * @param {number} ttlSeconds - Remaining token lifetime
 */
async function blacklistToken(jti, ttlSeconds) {
  const key = `${BLACKLIST_PREFIX}${jti}`;
  await cacheManager.set(key, '1', ttlSeconds);
  logger.info('Token blacklisted', { jti });
}

/**
 * Check if a token is blacklisted.
 * @param {string} jti
 * @returns {Promise<boolean>}
 */
async function isBlacklisted(jti) {
  if (typeof cacheManager.exists !== 'function') {
    return false;
  }

  const key = `${BLACKLIST_PREFIX}${jti}`;
  return cacheManager.exists(key);
}

/**
 * Cache a user's role for fast RBAC lookups.
 * @param {string} userId
 * @param {string} role
 * @param {number} [ttlSeconds=300]
 */
async function cacheUserRole(userId, role, ttlSeconds = 300) {
  const key = `user:${userId}:role`;
  await cacheManager.set(key, role, ttlSeconds);
}

/**
 * Get cached user role. Returns null if cache miss.
 * @param {string} userId
 * @returns {Promise<string|null>}
 */
async function getCachedRole(userId) {
  const key = `user:${userId}:role`;
  return cacheManager.get(key);
}

/**
 * Invalidate cached role (call on role change).
 * @param {string} userId
 */
async function invalidateRole(userId) {
  const key = `user:${userId}:role`;
  await cacheManager.del(key);
  logger.info('Role cache invalidated', { userId });
}

/**
 * Upsert active refresh session for a user/device tuple.
 *
 * Key format:
 *   session:{user_id}:{device_id}
 */
async function upsertRefreshSession(userId, deviceId, session, ttlSeconds) {
  const key = refreshSessionKey(userId, deviceId);
  const ok = await cacheManager.set(key, {
    session_id: session.session_id,
    refresh_token_hash: session.refresh_token_hash,
    expires_at: session.expires_at,
    previous_session_id: session.previous_session_id || null,
    created_at: session.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, ttlSeconds);

  if (ok) {
    logger.info('Refresh session upserted', {
      user_id: userId,
      device_id: normalizeDeviceId(deviceId),
      session_id: session.session_id,
    });
  }

  return ok;
}

async function getRefreshSession(userId, deviceId) {
  const key = refreshSessionKey(userId, deviceId);
  const session = await cacheManager.getJSON(key);

  if (!session || typeof session !== 'object') {
    return null;
  }

  return session;
}

async function revokeRefreshSession(userId, deviceId) {
  const key = refreshSessionKey(userId, deviceId);
  const removed = await cacheManager.del(key);

  if (removed) {
    logger.info('Refresh session revoked', {
      user_id: userId,
      device_id: normalizeDeviceId(deviceId),
    });
  }

  return removed;
}

module.exports = {
  blacklistToken,
  hashToken,
  getRefreshSession,
  isBlacklisted,
  cacheUserRole,
  getCachedRole,
  invalidateRole,
  revokeRefreshSession,
  upsertRefreshSession,
};
