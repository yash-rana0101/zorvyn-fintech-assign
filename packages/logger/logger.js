'use strict';

const { createLogger, format, transports } = require('winston');
const { getRequestContext } = require('./requestContext');

const { combine, timestamp, errors, json, colorize, printf } = format;

// ─── Log Levels ─────────────────────────────────────────────────────────────
// error > warn > info > http > debug

const isDev = process.env.NODE_ENV !== 'production';
const SENSITIVE_KEY_PATTERN = /(password|token|authorization|secret|api[_-]?key)/i;

function sanitizeValue(value, keyPath = '') {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    if (SENSITIVE_KEY_PATTERN.test(keyPath)) {
      return '[REDACTED]';
    }

    return value;
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => sanitizeValue(entry, `${keyPath}[${index}]`));
  }

  if (typeof value === 'object') {
    return Object.entries(value).reduce((acc, [key, nestedValue]) => {
      const nestedKeyPath = keyPath ? `${keyPath}.${key}` : key;

      if (SENSITIVE_KEY_PATTERN.test(key)) {
        acc[key] = '[REDACTED]';
      } else {
        acc[key] = sanitizeValue(nestedValue, nestedKeyPath);
      }

      return acc;
    }, {});
  }

  return value;
}

const contextAndSanitizerFormat = format((info) => {
  const requestContext = getRequestContext();

  if (requestContext) {
    if (!info.request_id && requestContext.request_id) {
      info.request_id = requestContext.request_id;
    }

    if (!info.trace_id && requestContext.trace_id) {
      info.trace_id = requestContext.trace_id;
    }

    if (!info.user_id && requestContext.user_id) {
      info.user_id = requestContext.user_id;
    }

    if (!info.endpoint && requestContext.endpoint) {
      info.endpoint = requestContext.endpoint;
    }

    if (!info.status && requestContext.status) {
      info.status = requestContext.status;
    }

    if (!info.service && requestContext.service) {
      info.service = requestContext.service;
    }
  }

  return sanitizeValue(info);
});

// ─── Dev Format ─────────────────────────────────────────────────────────────
const devFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'HH:mm:ss' }),
  errors({ stack: true }),
  contextAndSanitizerFormat(),
  printf(({ timestamp, level, message, stack, ...meta }) => {
    const metaStr = Object.keys(meta).length
      ? `\n${JSON.stringify(meta, null, 2)}`
      : '';
    return `${timestamp} [${level}] ${message}${stack ? '\n' + stack : ''}${metaStr}`;
  })
);

// ─── Production Format ───────────────────────────────────────────────────────
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  contextAndSanitizerFormat(),
  json()
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  format: isDev ? devFormat : prodFormat,
  transports: [
    new transports.Console(),
  ],
  exitOnError: false,
});

logger.on('error', (error) => {
  try {
    // If Winston internals fail, keep logging failure visible without crashing.
    console.error(JSON.stringify({
      level: 'error',
      message: 'Logger transport failure',
      error: error.message,
      timestamp: new Date().toISOString(),
    }));
  } catch {
    console.error('Logger transport failure', error.message);
  }
});

// Add file transports in production
if (!isDev) {
  logger.add(
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
    })
  );
  logger.add(
    new transports.File({
      filename: 'logs/combined.log',
      maxsize: 10 * 1024 * 1024,
      maxFiles: 10,
    })
  );
}

function logInfo(message, data = {}) {
  logger.info(message, data);
}

function logError(message, error, data = {}) {
  if (error instanceof Error) {
    logger.error(message, {
      ...data,
      error: error.message,
      stack: error.stack,
    });
    return;
  }

  logger.error(message, {
    ...data,
    error: error ? String(error) : 'Unknown error',
  });
}

logger.logInfo = logInfo;
logger.logError = logError;

module.exports = logger;
