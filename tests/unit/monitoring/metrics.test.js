'use strict';

const {
  getMetricsSnapshot,
  incrementCounter,
  METRICS,
  recordHistogram,
  resetMetrics,
  setCircuitBreakerState,
} = require('../../../packages/monitoring/metrics');

describe('monitoring metrics', () => {
  beforeEach(() => {
    resetMetrics();
  });

  it('records HTTP, cache, and DB metrics', async () => {
    incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, {
      service: 'api',
      method: 'GET',
      endpoint: '/health',
      status: '200',
    });

    incrementCounter(METRICS.CACHE_HIT_TOTAL, {
      service: 'api',
    });

    recordHistogram(METRICS.DB_QUERY_DURATION_MS, 12.5, {
      service: 'api',
    });

    const snapshot = await getMetricsSnapshot();

    expect(snapshot).toContain('http_requests_total');
    expect(snapshot).toContain('cache_hit_total');
    expect(snapshot).toContain('db_query_duration_ms');
  });

  it('tracks circuit breaker state as gauge values', async () => {
    setCircuitBreakerState('api', 'finance-write-service', 'open');

    const snapshot = await getMetricsSnapshot();

    expect(snapshot).toContain('circuit_breaker_state');
    expect(snapshot).toContain('state="open"');
  });
});
