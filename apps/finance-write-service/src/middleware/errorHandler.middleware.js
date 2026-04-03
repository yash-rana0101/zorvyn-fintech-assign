'use strict';

const logger = require('../../../../packages/logger/logger');

// eslint-disable-next-line no-unused-vars
function errorHandler(error, req, res, next) {
  const requestId = req.requestId || req.headers['x-request-id'] || null;

  if (error.name === 'ZodError') {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      request_id: requestId,
      details: error.errors.map((entry) => ({
        field: entry.path.join('.'),
        message: entry.message,
      })),
    });
  }

  if (error.code === '23505') {
    return res.status(409).json({
      success: false,
      error: 'Resource already exists',
      request_id: requestId,
      detail: error.detail || undefined,
    });
  }

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      error: error.message,
      request_id: requestId,
    });
  }

  logger.error('Unhandled finance write service error', {
    message: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  return res.status(500).json({
    success: false,
    request_id: requestId,
    error:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : error.message,
  });
}

module.exports = errorHandler;
