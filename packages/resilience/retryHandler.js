'use strict';

const logger = require('../logger/logger');
const { incrementCounter, METRICS } = require('../monitoring/metrics');

function wait(delayMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  });
}

function normalizeNumber(value, fallback, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

function getRetryDelay(baseDelayMs, attempt) {
  const exponent = Math.max(0, attempt - 1);
  return baseDelayMs * (2 ** exponent);
}

async function executeWithRetry(operation, options = {}) {
  const maxAttempts = normalizeNumber(options.maxAttempts, 3, 1);
  const baseDelayMs = normalizeNumber(options.baseDelayMs, 100, 1);
  const label = options.label || 'operation';
  const service = options.service || 'app';
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : null;

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;

      if (attempt >= maxAttempts) {
        break;
      }

      const delayMs = getRetryDelay(baseDelayMs, attempt);
      incrementCounter(METRICS.RETRY_TOTAL, {
        service,
        operation: label,
      });

      if (onRetry) {
        onRetry({
          attempt,
          nextAttempt: attempt + 1,
          maxAttempts,
          delayMs,
          error,
        });
      } else {
        logger.warn('Retrying operation', {
          service,
          label,
          attempt,
          next_attempt: attempt + 1,
          max_attempts: maxAttempts,
          delay_ms: delayMs,
          error: error.message,
        });
      }

      // Backoff prevents immediate retry storms during dependency outages.
      // eslint-disable-next-line no-await-in-loop
      await wait(delayMs);
    }
  }

  throw lastError;
}

module.exports = {
  executeWithRetry,
  getRetryDelay,
};
