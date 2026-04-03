'use strict';

const { randomUUID } = require('crypto');

const logger = require('../logger/logger');
const { runWithRequestContext, setRequestContext } = require('../logger/requestContext');
const { startSpan, extractIncomingTraceContext } = require('../tracing/tracer');
const {
  getMetricsContentType,
  getMetricsSnapshot,
  incrementCounter,
  METRICS,
  recordHistogram,
} = require('./metrics');

function createRequestId() {
  if (typeof randomUUID === 'function') {
    return randomUUID();
  }

  return `req_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;
}

function resolveRequestId(rawRequestId) {
  if (typeof rawRequestId !== 'string') {
    return createRequestId();
  }

  const normalized = rawRequestId.trim();
  if (normalized.length === 0) {
    return createRequestId();
  }

  return normalized.slice(0, 128);
}

function resolveEndpointLabel(req) {
  if (req.route && req.route.path) {
    const baseUrl = req.baseUrl || '';
    return `${baseUrl}${req.route.path}`;
  }

  const originalUrl = typeof req.originalUrl === 'string' ? req.originalUrl : '';
  const [pathOnly] = originalUrl.split('?');

  return pathOnly || req.path || 'unknown';
}

function createRequestContextMiddleware({ serviceName }) {
  const service = serviceName || 'service';

  return (req, res, next) => {
    const requestId = resolveRequestId(req.headers['x-request-id']);
    const incomingTraceContext = extractIncomingTraceContext(req.headers);

    const context = {
      request_id: requestId,
      endpoint: req.originalUrl,
      method: req.method,
      service,
      user_id: null,
      status: null,
      trace_id: incomingTraceContext?.trace_id || null,
      span_id: incomingTraceContext?.span_id || null,
    };

    return runWithRequestContext(context, () => {
      const span = startSpan(
        `http.${req.method.toLowerCase()}`,
        {
          service,
          endpoint: req.originalUrl,
          method: req.method,
        },
        incomingTraceContext
      );

      req.requestId = requestId;
      req.traceId = span.context.trace_id;

      res.setHeader('x-request-id', requestId);
      res.setHeader('x-trace-id', span.context.trace_id);

      res.on('finish', () => {
        setRequestContext({
          endpoint: resolveEndpointLabel(req),
          method: req.method,
          status: res.statusCode,
          user_id: req.user?.user_id || null,
        });

        span.end({
          endpoint: resolveEndpointLabel(req),
          status_code: res.statusCode,
          user_id: req.user?.user_id || null,
        });
      });

      return next();
    });
  };
}

function createHttpMetricsMiddleware({ serviceName, latencyAlertMs }) {
  const service = serviceName || 'service';
  const highLatencyThresholdMs = Number.isFinite(Number(latencyAlertMs))
    ? Number(latencyAlertMs)
    : Number.parseInt(process.env.REQUEST_LATENCY_ALERT_MS || '1000', 10);

  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();

    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const normalizedDurationMs = Number(durationMs.toFixed(3));
      const endpoint = resolveEndpointLabel(req);
      const labels = {
        service,
        method: req.method,
        endpoint,
        status: String(res.statusCode),
      };

      incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, labels);
      recordHistogram(METRICS.HTTP_REQUEST_DURATION_MS, normalizedDurationMs, labels);

      if (res.statusCode >= 400) {
        incrementCounter(METRICS.HTTP_ERRORS_TOTAL, labels);
      }

      logger.info('HTTP request completed', {
        endpoint,
        method: req.method,
        status: res.statusCode,
        latency_ms: normalizedDurationMs,
        user_id: req.user?.user_id || null,
      });

      if (Number.isFinite(highLatencyThresholdMs) && normalizedDurationMs >= highLatencyThresholdMs) {
        logger.warn('Request latency threshold exceeded', {
          endpoint,
          method: req.method,
          status: res.statusCode,
          latency_ms: normalizedDurationMs,
          threshold_ms: highLatencyThresholdMs,
        });
      }
    });

    return next();
  };
}

function monitoringAuthMiddleware(req, res, next) {
  const monitoringKey = process.env.MONITORING_API_KEY;

  if (!monitoringKey) {
    return next();
  }

  const providedKey = req.header('x-monitoring-key');

  if (providedKey !== monitoringKey) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized monitoring request',
    });
  }

  return next();
}

async function metricsEndpointHandler(req, res) {
  try {
    const snapshot = await getMetricsSnapshot();
    res.setHeader('Content-Type', getMetricsContentType());
    res.status(200).send(snapshot);
  } catch (error) {
    logger.warn('Failed to render metrics endpoint', {
      error: error.message,
    });

    res.status(500).json({
      success: false,
      error: 'Unable to collect metrics',
    });
  }
}

module.exports = {
  createHttpMetricsMiddleware,
  createRequestContextMiddleware,
  metricsEndpointHandler,
  monitoringAuthMiddleware,
};
