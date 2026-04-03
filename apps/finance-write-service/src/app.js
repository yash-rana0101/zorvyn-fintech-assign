'use strict';

const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const { HTTP_STATUS } = require('../../../packages/utils/constants');
const { getPool } = require('./db/connection');
const { createHealthCheck } = require('../../../packages/monitoring/healthCheck');
const {
  createHttpMetricsMiddleware,
  createRequestContextMiddleware,
  metricsEndpointHandler,
  monitoringAuthMiddleware,
} = require('../../../packages/monitoring/httpMiddleware');
const router = require('./routes');
const errorHandler = require('./middleware/errorHandler.middleware');

const app = express();
const financeWriteHealthCheck = createHealthCheck({
  serviceName: 'finance-write-service',
  includeRedis: false,
  dbCheck: () => getPool().query('SELECT 1'),
});

function authenticateServiceRequest(req, res, next) {
  const expectedToken = process.env.FINANCE_WRITE_SERVICE_AUTH_TOKEN;

  if (!expectedToken || req.path === '/health' || req.path === '/metrics') {
    return next();
  }

  const providedToken = req.header('x-service-auth');
  if (providedToken !== expectedToken) {
    return res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      error: 'Unauthorized service request',
    });
  }

  return next();
}

app.use(helmet());
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : '*',
    methods: ['POST', 'GET'],
    allowedHeaders: ['Content-Type', 'x-service-auth', 'x-request-id', 'x-trace-id', 'traceparent', 'x-monitoring-key'],
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(createRequestContextMiddleware({ serviceName: 'finance-write-service' }));
app.use(createHttpMetricsMiddleware({ serviceName: 'finance-write-service' }));

app.get('/health', financeWriteHealthCheck);
app.get('/metrics', monitoringAuthMiddleware, metricsEndpointHandler);

app.use(authenticateServiceRequest);
app.use('/', router);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    request_id: req.requestId || req.headers['x-request-id'] || null,
  });
});

app.use(errorHandler);

module.exports = app;
