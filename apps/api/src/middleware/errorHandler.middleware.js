'use strict';

const logger = require('../../../../packages/logger/logger');

/**
 * Global error handler middleware.
 * Must be registered LAST in the Express middleware chain.
 *
 * Handles:
 *  - Validation errors (Zod)
 *  - JWT errors
 *  - PostgreSQL errors
 *  - Generic application errors
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const requestId = req.requestId || req.headers['x-request-id'] || null;

  // ── Zod Validation Error ──────────────────────────────────
  if (err.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      request_id: requestId,
      details: err.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // ── JWT Errors ────────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      error: 'Invalid token',
      request_id: requestId,
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      error: 'Token has expired',
      request_id: requestId,
    });
  }

  // ── PostgreSQL Unique Violation ───────────────────────────
  if (err.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'Resource already exists',
      request_id: requestId,
      detail: err.detail || undefined,
    });
  }

  // ── Application Errors with explicit status ───────────────
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      error: err.message,
      request_id: requestId,
    });
  }

  // ── Unknown / Internal Server Error ──────────────────────
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
  });

  return res.status(500).json({
    success: false,
    request_id: requestId,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message,
  });
}

module.exports = errorHandler;
