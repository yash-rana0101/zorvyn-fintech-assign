'use strict';

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const router = require('./routes');
const errorHandler = require('./middleware/errorHandler.middleware');
const { registerAnalyticsConsumers } = require('./modules/analytics/analytics.consumer');
const { healthCheck } = require('../../../packages/monitoring/healthCheck');
const {
  createHttpMetricsMiddleware,
  createRequestContextMiddleware,
  metricsEndpointHandler,
  monitoringAuthMiddleware,
} = require('../../../packages/monitoring/httpMiddleware');

const app = express();

registerAnalyticsConsumers();

// ─── Security Headers ───────────────────────────────────────────────────────
app.use(helmet());

// ─── CORS ───────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-trace-id', 'traceparent', 'x-monitoring-key'],
  })
);

// ─── Body Parsing ───────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Request Context + Metrics ──────────────────────────────────────────────
app.use(createRequestContextMiddleware({ serviceName: 'api' }));
app.use(createHttpMetricsMiddleware({ serviceName: 'api' }));

// ─── Health Check ───────────────────────────────────────────────────────────
app.get('/health', healthCheck);
app.get('/metrics', monitoringAuthMiddleware, metricsEndpointHandler);

// ─── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/v1', router);

// ─── 404 Handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Route not found',
    path: req.originalUrl,
    request_id: req.requestId || req.headers['x-request-id'] || null,
  });
});

// ─── Global Error Handler ───────────────────────────────────────────────────
app.use(errorHandler);

module.exports = app;
