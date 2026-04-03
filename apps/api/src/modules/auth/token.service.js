'use strict';

const { randomUUID, createHash } = require('crypto');
const jwt = require('jsonwebtoken');

const ISSUER = 'finance-api';
const AUDIENCE = 'finance-client';

function nowInSeconds() {
  return Math.floor(Date.now() / 1000);
}

function createJwtError(message) {
  const error = new Error(message);
  error.name = 'JsonWebTokenError';
  return error;
}

function buildBasePayload(user) {
  return {
    user_id: user.user_id || user.id,
    email: user.email,
    role: user.role,
  };
}

/**
 * Generate a signed JWT token.
 *
 * Payload: { user_id, email, role }
 * Expiry: configurable via JWT_EXPIRES_IN (default: 1h)
 * Algorithm: HS256
 *
 * @param {{ user_id: string, email: string, role: string }} user
 * @param {{ session_id?: string, device_id?: string, expiresIn?: string }} [options]
 * @returns {string} Signed JWT
 */
function generateToken(user, options = {}) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload = buildBasePayload(user);
  payload.token_type = 'access';
  payload.jti = randomUUID();

  if (options.session_id) {
    payload.session_id = options.session_id;
  }

  if (options.device_id) {
    payload.device_id = options.device_id;
  }

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: options.expiresIn || process.env.JWT_EXPIRES_IN || '1h',
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/**
 * Generate a refresh token bound to a session/device tuple.
 *
 * @param {{ user_id: string, email: string, role: string }} user
 * @param {{ session_id: string, device_id: string, expiresIn?: string }} options
 * @returns {string}
 */
function generateRefreshToken(user, options = {}) {
  if (!options.session_id) {
    throw new Error('session_id is required to generate refresh token');
  }

  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  const payload = buildBasePayload(user);
  payload.token_type = 'refresh';
  payload.session_id = options.session_id;
  payload.device_id = options.device_id || 'web';
  payload.jti = randomUUID();

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: options.expiresIn || process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

function verifyRawToken(token) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }

  return jwt.verify(token, process.env.JWT_SECRET, {
    issuer: ISSUER,
    audience: AUDIENCE,
  });
}

/**
 * Verify and decode a JWT token.
 * Throws JsonWebTokenError or TokenExpiredError on failure.
 *
 * @param {string} token
 * @returns {object} Decoded payload
 */
function verifyToken(token) {
  const payload = verifyRawToken(token);

  if (payload.token_type === 'refresh') {
    throw createJwtError('Refresh token cannot be used as access token');
  }

  return payload;
}

/**
 * Verify a refresh token.
 * @param {string} token
 * @returns {object}
 */
function verifyRefreshToken(token) {
  const payload = verifyRawToken(token);

  if (payload.token_type !== 'refresh') {
    throw createJwtError('Invalid refresh token');
  }

  return payload;
}

/**
 * Decode a token WITHOUT verifying signature.
 * Use only for non-security-sensitive inspection.
 *
 * @param {string} token
 * @returns {object|null}
 */
function decodeToken(token) {
  return jwt.decode(token);
}

function getTokenTtlSeconds(token) {
  const decoded = decodeToken(token);

  if (!decoded || typeof decoded !== 'object' || !decoded.exp) {
    return 0;
  }

  return Math.max(0, decoded.exp - nowInSeconds());
}

function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

module.exports = {
  decodeToken,
  generateToken,
  generateRefreshToken,
  getTokenTtlSeconds,
  hashToken,
  verifyRefreshToken,
  verifyToken,
};
