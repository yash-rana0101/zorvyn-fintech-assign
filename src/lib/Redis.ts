import Redis, { RedisOptions } from 'ioredis';
import { env } from '../config/env';

const DEFAULT_TTL_SECONDS = 60 * 60;

let redisClient: Redis | null = null;
let disabledWarningPrinted = false;
let connectionWarningPrinted = false;

function buildOptions(): RedisOptions {
  return {
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    password: env.REDIS_PASSWORD || undefined,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  };
}

function isAlreadyConnectingError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('already connecting') || normalized.includes('already connected');
}

function getClient(): Redis | null {
  if (!env.REDIS_ENABLED) {
    if (!disabledWarningPrinted) {
      // eslint-disable-next-line no-console
      console.warn('Redis is disabled (REDIS_ENABLED=false). Caching will be skipped.');
      disabledWarningPrinted = true;
    }

    return null;
  }

  if (redisClient) {
    return redisClient;
  }

  redisClient = new Redis(buildOptions());
  redisClient.on('error', (error) => {
    if (!connectionWarningPrinted) {
      // eslint-disable-next-line no-console
      console.warn(`Redis connection error. Continuing without cache. Reason: ${error.message}`);
      connectionWarningPrinted = true;
    }
  });

  return redisClient;
}

async function ensureConnected(client: Redis): Promise<boolean> {
  if (client.status === 'ready') {
    return true;
  }

  try {
    await client.connect();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isAlreadyConnectingError(message)) {
      if (!connectionWarningPrinted) {
        // eslint-disable-next-line no-console
        console.warn(`Redis unavailable. Continuing without cache. Reason: ${message}`);
        connectionWarningPrinted = true;
      }

      return false;
    }
  }

  return client.status === 'connect' || client.status === 'connecting';
}

async function withRedis<T>(
  operation: (client: Redis) => Promise<T>,
  fallback: T
): Promise<T> {
  const client = getClient();
  if (!client) {
    return fallback;
  }

  const connected = await ensureConnected(client);
  if (!connected) {
    return fallback;
  }

  try {
    return await operation(client);
  } catch (error) {
    if (!connectionWarningPrinted) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.warn(`Redis operation failed. Continuing without cache. Reason: ${message}`);
      connectionWarningPrinted = true;
    }

    return fallback;
  }
}

export async function getCache(key: string): Promise<string | null> {
  return withRedis((client) => client.get(key), null);
}

export async function setCache(
  key: string,
  value: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  await withRedis(
    async (client) => {
      if (ttlSeconds > 0) {
        await client.set(key, value, 'EX', ttlSeconds);
      } else {
        await client.set(key, value);
      }

      return undefined;
    },
    undefined
  );
}

export async function deleteCache(...keys: string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  await withRedis(
    async (client) => {
      await client.del(...keys);
      return undefined;
    },
    undefined
  );
}

export async function incrementCache(
  key: string,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<number> {
  return withRedis(
    async (client) => {
      const value = await client.incr(key);
      if (value === 1 && ttlSeconds > 0) {
        await client.expire(key, ttlSeconds);
      }

      return value;
    },
    0
  );
}

export async function getJSONCache<T>(key: string): Promise<T | null> {
  const value = await getCache(key);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function setJSONCache(
  key: string,
  value: unknown,
  ttlSeconds = DEFAULT_TTL_SECONDS
): Promise<void> {
  await setCache(key, JSON.stringify(value), ttlSeconds);
}

export async function closeRedis(): Promise<void> {
  if (!redisClient) {
    return;
  }

  try {
    await redisClient.quit();
  } catch {
    // ignore shutdown errors
  } finally {
    redisClient = null;
  }
}
