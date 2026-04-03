'use strict';

const { verifyToken } = require('../../../../packages/security/jwt');
const { isBlacklisted } = require('../../../../packages/security/tokenManager');
const logger = require('../../../../packages/logger/logger');
const { setRequestContext } = require('../../../../packages/logger/requestContext');

/**
 * Authentication middleware.
 *
 * Extracts JWT from Authorization header, verifies it,
 * and attaches the decoded payload to req.user.
 *
 * Stateless — no DB call. Token is self-contained.
 *
 * Flow:
 *   Request → Extract Bearer token → Verify JWT → Attach req.user → next()
 */
async function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authorization header missing',
      });
    }

    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization format. Expected: Bearer <token>',
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    const payload = verifyToken(token);
    const isTokenRevoked = payload.jti ? await isBlacklisted(payload.jti) : false;

    if (isTokenRevoked) {
      return res.status(401).json({
        success: false,
        error: 'Token has been revoked',
      });
    }

    // Attach decoded user to request for downstream use
    req.user = {
      user_id: payload.user_id,
      email: payload.email,
      role: payload.role,
      jti: payload.jti || null,
      exp: payload.exp || null,
      session_id: payload.session_id || null,
      device_id: payload.device_id || null,
    };

    setRequestContext({
      user_id: payload.user_id,
    });

    logger.debug('Auth middleware: user authenticated', {
      user_id: payload.user_id,
      role: payload.role,
    });

    return next();
  } catch (err) {
    return next(err); // Passes JWT errors to errorHandler
  }
}

module.exports = { authenticate };
