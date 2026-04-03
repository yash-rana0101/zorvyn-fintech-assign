'use strict';

const { randomBytes } = require('crypto');

const logger = require('../logger/logger');
const { getRequestContext, setRequestContext } = require('../logger/requestContext');

function normalizeId(value, expectedLength) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const regex = expectedLength === 32 ? /^[0-9a-f]{32}$/ : /^[0-9a-f]{16}$/;

  if (!regex.test(normalized)) {
    return null;
  }

  return normalized;
}

function randomHex(sizeInBytes) {
  return randomBytes(sizeInBytes).toString('hex');
}

function generateTraceId() {
  return randomHex(16);
}

function generateSpanId() {
  return randomHex(8);
}

function parseTraceparent(rawTraceparent) {
  if (typeof rawTraceparent !== 'string') {
    return null;
  }

  const parts = rawTraceparent.trim().split('-');
  if (parts.length !== 4) {
    return null;
  }

  const traceId = normalizeId(parts[1], 32);
  const spanId = normalizeId(parts[2], 16);

  if (!traceId || !spanId) {
    return null;
  }

  return {
    trace_id: traceId,
    span_id: spanId,
  };
}

function extractIncomingTraceContext(headers = {}) {
  const traceparent = parseTraceparent(headers.traceparent || headers.Traceparent);
  if (traceparent) {
    return traceparent;
  }

  const traceId = normalizeId(
    headers['x-trace-id'] || headers['X-Trace-Id'],
    32
  );

  if (!traceId) {
    return null;
  }

  return {
    trace_id: traceId,
    span_id: null,
  };
}

function getTraceContext() {
  const context = getRequestContext();
  if (!context) {
    return null;
  }

  const traceId = normalizeId(context.trace_id, 32);
  const spanId = normalizeId(context.span_id, 16);

  if (!traceId) {
    return null;
  }

  return {
    trace_id: traceId,
    span_id: spanId,
  };
}

function startSpan(name, attributes = {}, parentContext = null) {
  const activeContext = getRequestContext() || {};

  const normalizedParentTraceId = normalizeId(parentContext?.trace_id, 32);
  const normalizedParentSpanId = normalizeId(parentContext?.span_id, 16);

  const traceId =
    normalizedParentTraceId
    || normalizeId(activeContext.trace_id, 32)
    || generateTraceId();

  const parentSpanId =
    normalizedParentSpanId
    || normalizeId(activeContext.span_id, 16)
    || null;

  const spanId = generateSpanId();
  const startedAt = process.hrtime.bigint();

  setRequestContext({
    trace_id: traceId,
    span_id: spanId,
  });

  let finished = false;

  return {
    context: {
      trace_id: traceId,
      span_id: spanId,
      parent_span_id: parentSpanId,
      name,
      attributes,
    },
    end(result = {}) {
      if (finished) {
        return null;
      }

      finished = true;
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

      if (parentSpanId) {
        setRequestContext({ span_id: parentSpanId });
      }

      const spanResult = {
        trace_id: traceId,
        span_id: spanId,
        parent_span_id: parentSpanId,
        name,
        duration_ms: Number(durationMs.toFixed(3)),
        ...result,
      };

      logger.debug('Trace span completed', spanResult);

      return spanResult;
    },
  };
}

function injectTraceHeaders(headers = {}) {
  const traceContext = getTraceContext();

  if (!traceContext) {
    return { ...headers };
  }

  const spanId = traceContext.span_id || generateSpanId();

  return {
    ...headers,
    'x-trace-id': traceContext.trace_id,
    traceparent: `00-${traceContext.trace_id}-${spanId}-01`,
  };
}

module.exports = {
  extractIncomingTraceContext,
  generateSpanId,
  generateTraceId,
  getTraceContext,
  injectTraceHeaders,
  parseTraceparent,
  startSpan,
};
