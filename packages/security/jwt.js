'use strict';

const jwt = require('jsonwebtoken');

/**
 * JWT utilities — shared security package.
 *
 * Algorithm: HS256 (symmetric)
 * Upgrade path: Switch to RS256 (asymmetric) for multi-service auth in Phase 8+
 *
 * This wraps jsonwebtoken with:
 *  - Consistent issuer/audience claims
 *  - Centralized secret management
 *  - Typed errors for clean error handling
 */

/**
 * Sign a JWT token.
 * @param {object} payload - Data to embed in token
 * @param {object} [options] - jwt.sign options overrides
 * @returns {string} Signed JWT
 */
function sign(payload, options = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');

  return jwt.sign(payload, secret, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    issuer: 'finance-api',
    audience: 'finance-client',
    ...options,
  });
}

function createJwtError(message) {
  const error = new Error(message);
  error.name = 'JsonWebTokenError';
  return error;
}

/**
 * Verify and decode a JWT.
 * @param {string} token
 * @param {{ expectedTokenType?: 'access'|'refresh'|'any' }} [options]
 * @returns {object} Decoded payload
 * @throws {JsonWebTokenError|TokenExpiredError}
 */
function verify(token, options = {}) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');

  const payload = jwt.verify(token, secret, {
    issuer: 'finance-api',
    audience: 'finance-client',
  });

  const expectedTokenType = options.expectedTokenType || 'access';
  if (expectedTokenType === 'access' && payload.token_type === 'refresh') {
    throw createJwtError('Refresh token cannot be used as access token');
  }

  if (expectedTokenType === 'refresh' && payload.token_type !== 'refresh') {
    throw createJwtError('Invalid refresh token');
  }

  return payload;
}

/**
 * Decode token WITHOUT verification (unsafe, for inspection only).
 * @param {string} token
 * @returns {object|null}
 */
function decode(token) {
  return jwt.decode(token);
}

// Re-export for backward compatibility
const generateToken = sign;
const verifyToken = verify;
const verifyRefreshToken = (token) => verify(token, { expectedTokenType: 'refresh' });

module.exports = {
  sign,
  verify,
  verifyRefreshToken,
  decode,
  generateToken,
  verifyToken,
};
