'use strict';

const { z } = require('zod');

/**
 * Environment variable schema — validated at startup.
 * Keeps configuration explicit and safe.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // PostgreSQL
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.string().default('5432'),
  DB_NAME: z.string().default('finance_db'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_POOL_MIN: z.string().default('2'),
  DB_POOL_MAX: z.string().default('20'),

  // Redis
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.string().default('6379'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.string().default('0'),

  // Redis Pub/Sub
  REDIS_PUBSUB_ENABLED: z.string().default('true'),
  REDIS_PUBSUB_CLIENT_ID: z.string().default('finance-api'),
  REDIS_EVENTS_CHANNEL: z.string().default('transactions.events'),
  REDIS_DLQ_CHANNEL: z.string().default('transactions.dlq'),
  REDIS_PUBLISH_RETRIES: z.string().default('3'),
  REDIS_CONSUMER_RETRIES: z.string().default('3'),
  REDIS_RETRY_BASE_MS: z.string().default('100'),

  // Rate limiting
  RATE_LIMIT_WINDOW_MS: z.string().default('60000'),
  RATE_LIMIT_MAX_REQUESTS: z.string().default('100'),

  // RBAC TTL
  RBAC_CACHE_TTL: z.string().default('300'),

  // Observability
  OBSERVABILITY_SERVICE_NAME: z.string().default('api'),
  REQUEST_LATENCY_ALERT_MS: z.string().default('1000'),
  MONITORING_API_KEY: z.string().optional(),

  // Phase 6 cache TTL controls
  USER_CACHE_TTL: z.string().default('300'),
  TRANSACTIONS_CACHE_TTL: z.string().default('20'),
  ANALYTICS_CACHE_TTL: z.string().default('20'),

  // Phase 10 shard routing and reconciliation
  SHARD_ROUTING_ENABLED: z.string().default('false'),
  SHARD_COUNT: z.string().default('1'),
  VIRTUAL_SHARD_COUNT: z.string().default('64'),
  HOME_REGION: z.string().default('ap-south-1'),
  SHARD_CONNECTIONS_JSON: z.string().default('{}'),
  SHARD_REGION_MAP: z.string().default('{"0":"ap-south-1"}'),
  SHARD_OVERRIDE_TTL_SECONDS: z.string().default('604800'),

  RECONCILIATION_ENABLED: z.string().default('false'),
  RECONCILIATION_INTERVAL_MS: z.string().default('86400000'),
  RECONCILIATION_STARTUP_DELAY_MS: z.string().default('30000'),
  RECONCILIATION_USER_LIMIT: z.string().default('5000'),
});

let _env = null;

/**
 * Validate env vars. Throws on startup if required vars are missing.
 * @returns {object} Validated, parsed env
 */
function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors
      .map((e) => `  - ${e.path.join('.')}: ${e.message}`)
      .join('\n');
    throw new Error(`❌ Invalid environment configuration:\n${errors}`);
  }
  _env = result.data;
  return _env;
}

/**
 * Get validated env (cached after first call).
 * @returns {object}
 */
function getEnv() {
  if (!_env) {
    return validateEnv();
  }
  return _env;
}

module.exports = { validateEnv, getEnv };
