'use strict';

const { eventBus } = require('../../../../packages/event-bus/eventBus');
const { TOPICS } = require('../../../../packages/event-bus/topics');
const { getRequestContext } = require('../../../../packages/logger/requestContext');
const logger = require('../../../../packages/logger/logger');
const { incrementCounter, METRICS } = require('../../../../packages/monitoring/metrics');
const { executeWithRetry } = require('../../../../packages/resilience/retryHandler');
const { injectTraceHeaders, startSpan } = require('../../../../packages/tracing/tracer');

function parseIntSafe(value, fallback, min = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

function toEventTimestamp(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return new Date().toISOString();
  }

  return parsed.toISOString();
}

async function publishTransactionCreated(transaction) {
  const maxRetries = parseIntSafe(process.env.FINANCE_WRITE_PUBLISH_RETRIES, 3, 0);
  const baseDelayMs = parseIntSafe(process.env.FINANCE_WRITE_PUBLISH_RETRY_BASE_MS, 100, 1);
  const requestContext = getRequestContext();
  const traceHeaders = injectTraceHeaders();

  const payload = {
    transaction_id: transaction.id,
    user_id: transaction.user_id,
    amount: transaction.amount,
    type: transaction.type,
    category: transaction.category,
    timestamp: toEventTimestamp(transaction.timestamp),
    request_id: requestContext?.request_id || null,
    trace_id: traceHeaders['x-trace-id'] || requestContext?.trace_id || null,
    traceparent: traceHeaders.traceparent || null,
  };

  const span = startSpan('finance-write-service.publish-transaction-created', {
    service: 'finance-write-service',
    topic: TOPICS.TRANSACTION_CREATED,
  });

  try {
    await executeWithRetry(
      async () => {
        eventBus.publish(TOPICS.TRANSACTION_CREATED, payload);
      },
      {
        maxAttempts: maxRetries + 1,
        baseDelayMs,
        label: 'publish_transaction_created',
        service: 'finance-write-service',
        onRetry: ({ attempt, delayMs, error }) => {
          logger.warn('Finance write service event publish retry', {
            topic: TOPICS.TRANSACTION_CREATED,
            attempt,
            backoff_ms: delayMs,
            error: error.message,
          });
        },
      }
    );

    incrementCounter(METRICS.REDIS_PUBLISH_TOTAL, {
      service: 'finance-write-service',
      topic: TOPICS.TRANSACTION_CREATED,
      status: 'success',
    });
    span.end({ status: 'success' });
  } catch (error) {
    incrementCounter(METRICS.REDIS_PUBLISH_TOTAL, {
      service: 'finance-write-service',
      topic: TOPICS.TRANSACTION_CREATED,
      status: 'failed',
    });
    span.end({
      status: 'error',
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  publishTransactionCreated,
};
