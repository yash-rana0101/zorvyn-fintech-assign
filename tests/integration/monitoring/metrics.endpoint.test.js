'use strict';

jest.mock('../../../apps/api/src/config/db', () => ({
  query: jest.fn(),
  getClient: jest.fn(),
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  http: jest.fn(),
}));

const request = require('supertest');
const app = require('../../../apps/api/src/app');
const {
  incrementCounter,
  METRICS,
  resetMetrics,
} = require('../../../packages/monitoring/metrics');

describe('GET /metrics', () => {
  beforeEach(() => {
    resetMetrics();
    incrementCounter(METRICS.HTTP_REQUESTS_TOTAL, {
      service: 'api',
      method: 'GET',
      endpoint: '/bootstrap',
      status: '200',
    });
  });

  it('returns Prometheus metrics output', async () => {
    const response = await request(app).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.headers).toHaveProperty('x-request-id');
    expect(response.text).toContain('http_requests_total');
  });
});
