'use strict';

const { z } = require('zod');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3101'),

  FINANCE_WRITE_DB_HOST: z.string().default(process.env.DB_HOST || 'localhost'),
  FINANCE_WRITE_DB_PORT: z.string().default(process.env.DB_PORT || '5432'),
  FINANCE_WRITE_DB_NAME: z.string().default(process.env.DB_NAME || 'finance_db'),
  FINANCE_WRITE_DB_USER: z.string().default(process.env.DB_USER || 'postgres'),
  FINANCE_WRITE_DB_PASSWORD: z.string().default(process.env.DB_PASSWORD || 'postgres'),
  FINANCE_WRITE_DB_POOL_MIN: z.string().default('2'),
  FINANCE_WRITE_DB_POOL_MAX: z.string().default('20'),

  FINANCE_WRITE_PUBLISH_RETRIES: z.string().default('3'),
  FINANCE_WRITE_PUBLISH_RETRY_BASE_MS: z.string().default('100'),

  FINANCE_WRITE_SERVICE_AUTH_TOKEN: z.string().optional(),

  OBSERVABILITY_SERVICE_NAME: z.string().default('finance-write-service'),
  REQUEST_LATENCY_ALERT_MS: z.string().default('1000'),
  MONITORING_API_KEY: z.string().optional(),

  REDIS_PUBSUB_ENABLED: z.string().default('true'),
  REDIS_PUBSUB_CLIENT_ID: z.string().default('finance-write-service'),
  REDIS_EVENTS_CHANNEL: z.string().default('transactions.events'),
  REDIS_DLQ_CHANNEL: z.string().default('transactions.dlq'),
  REDIS_PUBLISH_RETRIES: z.string().default('3'),
  REDIS_CONSUMER_RETRIES: z.string().default('3'),
  REDIS_RETRY_BASE_MS: z.string().default('100'),
});

let envCache = null;

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const errors = result.error.errors
      .map((entry) => `  - ${entry.path.join('.')}: ${entry.message}`)
      .join('\n');
    throw new Error(`Invalid finance write service configuration:\n${errors}`);
  }

  envCache = result.data;
  return envCache;
}

function getEnv() {
  if (!envCache) {
    return validateEnv();
  }

  return envCache;
}

module.exports = {
  validateEnv,
  getEnv,
};
