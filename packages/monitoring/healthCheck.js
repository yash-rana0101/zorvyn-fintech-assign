'use strict';

const { getRedisClient, isRedisReady } = require('../cache/redisClient');
const { getPool } = require('../database/connection');
const { eventBus } = require('../event-bus/eventBus');
const logger = require('../logger/logger');

function isCriticalFailure(status) {
  return status === 'error' || status === 'down';
}

function defaultDbCheck() {
  return getPool().query('SELECT 1');
}

async function evaluateEventBusCheck() {
  if (!eventBus || typeof eventBus.getHealth !== 'function') {
    return {
      status: 'unknown',
      message: 'Event bus health integration unavailable',
    };
  }

  const eventBusHealth = eventBus.getHealth();

  if (!eventBusHealth.redis_pubsub_enabled) {
    return {
      status: 'disabled',
      enabled: false,
    };
  }

  if (eventBusHealth.publisher.connected && eventBusHealth.subscriber.connected) {
    return {
      status: 'ok',
      enabled: true,
      publisher: eventBusHealth.publisher,
      subscriber: eventBusHealth.subscriber,
    };
  }

  return {
    status: 'degraded',
    enabled: true,
    publisher: eventBusHealth.publisher,
    subscriber: eventBusHealth.subscriber,
  };
}

function createHealthCheck(options = {}) {
  const serviceName = options.serviceName || 'api';
  const includePostgres = options.includePostgres !== false;
  const includeRedis = options.includeRedis !== false;
  const includeEventBus = options.includeEventBus !== false;

  return async function healthCheckHandler(req, res) {
    const startedAt = Date.now();
    const checks = {
      service: {
        status: 'ok',
        name: serviceName,
      },
    };

    if (includePostgres) {
      try {
        await (options.dbCheck || defaultDbCheck)();
        checks.postgres = { status: 'ok' };
      } catch (error) {
        checks.postgres = {
          status: 'error',
          error: error.message,
        };
        logger.warn('Health check: PostgreSQL dependency unavailable', {
          service: serviceName,
          error: error.message,
        });
      }
    }

    if (includeRedis) {
      try {
        if (!isRedisReady()) {
          checks.redis = {
            status: 'degraded',
            message: 'Redis is not ready',
          };
        } else {
          await getRedisClient().ping();
          checks.redis = { status: 'ok' };
        }
      } catch (error) {
        checks.redis = {
          status: 'error',
          error: error.message,
        };
        logger.warn('Health check: Redis dependency unavailable', {
          service: serviceName,
          error: error.message,
        });
      }
    }

    if (includeEventBus) {
      try {
        checks.event_bus = await evaluateEventBusCheck();
      } catch (error) {
        checks.event_bus = {
          status: 'error',
          error: error.message,
        };
      }
    }

    const hasCriticalFailure = Object.values(checks)
      .some((check) => check && isCriticalFailure(check.status));

    const httpStatus = hasCriticalFailure ? 503 : 200;

    return res.status(httpStatus).json({
      status: hasCriticalFailure ? 'degraded' : 'healthy',
      service: serviceName,
      request_id: req.requestId || req.headers['x-request-id'] || null,
      timestamp: new Date().toISOString(),
      latency_ms: Date.now() - startedAt,
      checks,
      version: process.env.npm_package_version || '1.0.0',
      env: process.env.NODE_ENV || 'development',
    });
  };
}

const healthCheck = createHealthCheck({ serviceName: 'api' });

module.exports = {
  createHealthCheck,
  healthCheck,
};
