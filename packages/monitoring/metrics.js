'use strict';

let promClient = null;

try {
  promClient = require('prom-client');
} catch {
  promClient = null;
}

const logger = require('../logger/logger');

const METRICS = Object.freeze({
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION_MS: 'http_request_duration_ms',
  HTTP_LATENCY_MS: 'http_request_duration_ms',
  HTTP_ERRORS_TOTAL: 'http_request_errors_total',
  AUTH_LOGIN_TOTAL: 'auth_login_total',
  AUTH_FAILURE_TOTAL: 'auth_failure_total',
  CACHE_HIT_TOTAL: 'cache_hit_total',
  CACHE_MISS_TOTAL: 'cache_miss_total',
  DB_QUERY_DURATION_MS: 'db_query_duration_ms',
  RETRY_TOTAL: 'retry_total',
  CIRCUIT_BREAKER_STATE: 'circuit_breaker_state',
  FINANCE_WRITE_REQUEST_TOTAL: 'finance_write_request_total',
  FINANCE_WRITE_REQUEST_DURATION_MS: 'finance_write_request_duration_ms',
  REDIS_PUBLISH_TOTAL: 'redis_publish_total',
  REDIS_CONSUME_TOTAL: 'redis_consume_total',
  RECONCILIATION_RUN_TOTAL: 'reconciliation_run_total',
  RECONCILIATION_MISMATCH_TOTAL: 'reconciliation_mismatch_total',
});

const metricDefinitions = {
  [METRICS.HTTP_REQUESTS_TOTAL]: {
    type: 'counter',
    help: 'Total number of HTTP requests',
    labelNames: ['service', 'method', 'endpoint', 'status'],
  },
  [METRICS.HTTP_REQUEST_DURATION_MS]: {
    type: 'histogram',
    help: 'HTTP request duration in milliseconds',
    labelNames: ['service', 'method', 'endpoint', 'status'],
    buckets: [5, 10, 25, 50, 75, 100, 250, 500, 1000, 2500, 5000],
  },
  [METRICS.HTTP_ERRORS_TOTAL]: {
    type: 'counter',
    help: 'Total number of HTTP error responses',
    labelNames: ['service', 'method', 'endpoint', 'status'],
  },
  [METRICS.CACHE_HIT_TOTAL]: {
    type: 'counter',
    help: 'Total cache hits',
    labelNames: ['service'],
  },
  [METRICS.CACHE_MISS_TOTAL]: {
    type: 'counter',
    help: 'Total cache misses',
    labelNames: ['service'],
  },
  [METRICS.DB_QUERY_DURATION_MS]: {
    type: 'histogram',
    help: 'Database query duration in milliseconds',
    labelNames: ['service'],
    buckets: [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000],
  },
  [METRICS.RETRY_TOTAL]: {
    type: 'counter',
    help: 'Total retry attempts',
    labelNames: ['service', 'operation'],
  },
  [METRICS.CIRCUIT_BREAKER_STATE]: {
    type: 'gauge',
    help: 'Circuit breaker state (1 means active state)',
    labelNames: ['service', 'dependency', 'state'],
  },
  [METRICS.FINANCE_WRITE_REQUEST_TOTAL]: {
    type: 'counter',
    help: 'Total finance write service requests',
    labelNames: ['service', 'status'],
  },
  [METRICS.FINANCE_WRITE_REQUEST_DURATION_MS]: {
    type: 'histogram',
    help: 'Finance write service request latency in milliseconds',
    labelNames: ['service', 'status'],
    buckets: [10, 20, 50, 100, 250, 500, 1000, 2500, 5000],
  },
  [METRICS.REDIS_PUBLISH_TOTAL]: {
    type: 'counter',
    help: 'Total Redis publish attempts',
    labelNames: ['service', 'topic', 'status'],
  },
  [METRICS.REDIS_CONSUME_TOTAL]: {
    type: 'counter',
    help: 'Total Redis consume outcomes',
    labelNames: ['service', 'topic', 'status'],
  },
  [METRICS.RECONCILIATION_RUN_TOTAL]: {
    type: 'counter',
    help: 'Total reconciliation job executions',
    labelNames: ['service', 'status'],
  },
  [METRICS.RECONCILIATION_MISMATCH_TOTAL]: {
    type: 'counter',
    help: 'Total mismatches found by reconciliation job',
    labelNames: ['service'],
  },
};

let registry = null;
const metricsByName = new Map();
let initialized = false;

function ensureInitialized() {
  if (initialized) {
    return;
  }

  initialized = true;

  if (!promClient) {
    logger.warn('prom-client is not installed; metrics endpoint will return fallback output');
    return;
  }

  registry = new promClient.Registry();
  promClient.collectDefaultMetrics({
    register: registry,
    prefix: 'finance_',
  });

  for (const [name, definition] of Object.entries(metricDefinitions)) {
    const metric = createMetric(name, definition);
    if (metric) {
      metricsByName.set(name, metric);
    }
  }
}

function createMetric(name, definition) {
  if (!promClient || !registry) {
    return null;
  }

  if (registry.getSingleMetric(name)) {
    return registry.getSingleMetric(name);
  }

  const baseConfig = {
    name,
    help: definition.help || `${name} metric`,
    labelNames: definition.labelNames || [],
    registers: [registry],
  };

  if (definition.type === 'histogram') {
    return new promClient.Histogram({
      ...baseConfig,
      buckets: definition.buckets,
    });
  }

  if (definition.type === 'gauge') {
    return new promClient.Gauge(baseConfig);
  }

  return new promClient.Counter(baseConfig);
}

function getMetric(name, expectedType = 'counter') {
  ensureInitialized();

  if (!promClient || !registry) {
    return null;
  }

  if (metricsByName.has(name)) {
    return metricsByName.get(name);
  }

  const definition = metricDefinitions[name] || {
    type: expectedType,
    help: `${name} metric`,
    labelNames: [],
  };

  const metric = createMetric(name, definition);
  if (metric) {
    metricsByName.set(name, metric);
  }

  return metric;
}

function resolveLabels(definition, labels) {
  if (!definition || !Array.isArray(definition.labelNames) || definition.labelNames.length === 0) {
    return {};
  }

  return definition.labelNames.reduce((acc, key) => {
    const value = labels?.[key];
    acc[key] = value === undefined || value === null ? 'unknown' : String(value);
    return acc;
  }, {});
}

function withMetricSafety(actionName, callback) {
  try {
    return callback();
  } catch (error) {
    logger.warn(`Metric operation failed: ${actionName}`, {
      error: error.message,
    });
    return undefined;
  }
}

function incrementCounter(name, labels = {}, value = 1) {
  return withMetricSafety(`increment:${name}`, () => {
    const metric = getMetric(name, 'counter');
    if (!metric) {
      return;
    }

    const definition = metricDefinitions[name] || { labelNames: [] };
    const safeValue = Number(value);
    metric.inc(resolveLabels(definition, labels), Number.isFinite(safeValue) ? safeValue : 1);
  });
}

function recordHistogram(name, value, labels = {}) {
  return withMetricSafety(`histogram:${name}`, () => {
    const metric = getMetric(name, 'histogram');
    if (!metric) {
      return;
    }

    const definition = metricDefinitions[name] || { labelNames: [] };
    const safeValue = Number(value);

    if (!Number.isFinite(safeValue) || safeValue < 0) {
      return;
    }

    metric.observe(resolveLabels(definition, labels), safeValue);
  });
}

function setGauge(name, value, labels = {}) {
  return withMetricSafety(`gauge:${name}`, () => {
    const metric = getMetric(name, 'gauge');
    if (!metric) {
      return;
    }

    const definition = metricDefinitions[name] || { labelNames: [] };
    const safeValue = Number(value);

    if (!Number.isFinite(safeValue)) {
      return;
    }

    metric.set(resolveLabels(definition, labels), safeValue);
  });
}

function setCircuitBreakerState(service, dependency, state) {
  const states = ['closed', 'half_open', 'open'];

  for (const candidateState of states) {
    setGauge(METRICS.CIRCUIT_BREAKER_STATE, state === candidateState ? 1 : 0, {
      service,
      dependency,
      state: candidateState,
    });
  }
}

async function getMetricsSnapshot() {
  ensureInitialized();

  if (!promClient || !registry) {
    return '# Metrics unavailable: prom-client dependency is missing\n';
  }

  return registry.metrics();
}

function getMetricsContentType() {
  ensureInitialized();
  if (!promClient || !registry) {
    return 'text/plain; charset=utf-8';
  }

  return registry.contentType;
}

function isMetricsAvailable() {
  return Boolean(promClient);
}

function resetMetrics() {
  ensureInitialized();

  if (!promClient || !registry) {
    return;
  }

  registry.resetMetrics();
}

module.exports = {
  getMetricsContentType,
  getMetricsSnapshot,
  incrementCounter,
  isMetricsAvailable,
  METRICS,
  recordHistogram,
  resetMetrics,
  setCircuitBreakerState,
  setGauge,
};
