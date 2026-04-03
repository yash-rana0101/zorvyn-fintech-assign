import { config } from 'dotenv';
import { z } from 'zod';

config();

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off']);

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();

    if (TRUE_VALUES.has(normalized)) {
      return true;
    }

    if (FALSE_VALUES.has(normalized)) {
      return false;
    }
  }

  return value;
}, z.boolean());

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().optional(),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().default('finance_db'),
  DB_USER: z.string().default('postgres'),
  DB_PASSWORD: z.string().default('postgres'),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(1),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  CORS_ALLOWED_ORIGINS: z.string().default('*'),
  API_BODY_LIMIT: z.string().default('100kb'),
  TRUST_PROXY: booleanFromEnv.default(false),
  ENFORCE_HTTPS: booleanFromEnv.default(false),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(200),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  REDIS_ENABLED: booleanFromEnv.default(true),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().nonnegative().default(0),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('1h'),
});

export const env = envSchema.parse(process.env);
