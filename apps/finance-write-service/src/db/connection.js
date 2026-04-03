'use strict';

const { Pool } = require('pg');
const logger = require('../../../../packages/logger/logger');
const { recordHistogram, METRICS } = require('../../../../packages/monitoring/metrics');
const {
  describeRouting,
  getConnectionOverride,
  resolveShardForUser,
} = require('../../../../packages/database/shardRouter');
const { getEnv } = require('../config/env');

let defaultPool = null;
const shardPools = new Map();
let shardRoutingLogged = false;

function resolveServiceName() {
  return process.env.OBSERVABILITY_SERVICE_NAME || 'finance-write-service';
}

function toInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildPoolConfig(env, overrides = {}) {
  return {
    host: overrides.host || env.FINANCE_WRITE_DB_HOST,
    port: toInteger(overrides.port, toInteger(env.FINANCE_WRITE_DB_PORT, 5432)),
    database: overrides.database || env.FINANCE_WRITE_DB_NAME,
    user: overrides.user || env.FINANCE_WRITE_DB_USER,
    password: overrides.password || env.FINANCE_WRITE_DB_PASSWORD,
    min: toInteger(overrides.min, toInteger(env.FINANCE_WRITE_DB_POOL_MIN, 2)),
    max: toInteger(overrides.max, toInteger(env.FINANCE_WRITE_DB_POOL_MAX, 20)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
}

function createPool(label, env, overrides = {}) {
  const pool = new Pool(buildPoolConfig(env, overrides));

  pool.on('error', (error) => {
    logger.error('Finance write DB pool error', {
      pool: label,
      error: error.message,
    });
  });

  return pool;
}

function getOrCreateShardPool(shardId, env, overrides = {}) {
  const key = String(shardId);
  if (shardPools.has(key)) {
    return shardPools.get(key);
  }

  const pool = createPool(`shard-${key}`, env, overrides);
  shardPools.set(key, pool);
  return pool;
}

function getPool() {
  if (defaultPool) {
    return defaultPool;
  }

  const env = getEnv();

  defaultPool = createPool('default', env);
  return defaultPool;
}

function getShardPool(shard) {
  const env = getEnv();
  const override = getConnectionOverride(shard.shard_id);

  if (!override) {
    return getPool();
  }

  return getOrCreateShardPool(shard.shard_id, env, override);
}

async function resolvePoolForUser(userId) {
  const shard = await resolveShardForUser(userId);

  if (!shardRoutingLogged) {
    logger.info('Finance write shard routing initialized', describeRouting());
    shardRoutingLogged = true;
  }

  return {
    pool: getShardPool(shard),
    shard,
  };
}

async function query(text, params) {
  const startedAt = process.hrtime.bigint();
  const client = await getPool().connect();

  try {
    const result = await client.query(text, params);
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    recordHistogram(METRICS.DB_QUERY_DURATION_MS, Number(durationMs.toFixed(3)), {
      service: resolveServiceName(),
    });

    return result;
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    recordHistogram(METRICS.DB_QUERY_DURATION_MS, Number(durationMs.toFixed(3)), {
      service: resolveServiceName(),
    });

    logger.error('Finance write DB query failed', {
      duration_ms: Number(durationMs.toFixed(3)),
      error: error.message,
    });
    throw error;
  } finally {
    client.release();
  }
}

async function queryForUser(userId, text, params) {
  const startedAt = process.hrtime.bigint();
  const { pool, shard } = await resolvePoolForUser(userId);
  const client = await pool.connect();

  try {
    const result = await client.query(text, params);
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    recordHistogram(METRICS.DB_QUERY_DURATION_MS, Number(durationMs.toFixed(3)), {
      service: resolveServiceName(),
    });

    logger.debug('Finance write DB shard query executed', {
      duration_ms: Number(durationMs.toFixed(3)),
      shard_id: shard.shard_id,
      virtual_shard_id: shard.virtual_shard_id,
      region: shard.region,
    });

    return result;
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    recordHistogram(METRICS.DB_QUERY_DURATION_MS, Number(durationMs.toFixed(3)), {
      service: resolveServiceName(),
    });

    logger.error('Finance write DB shard query failed', {
      duration_ms: Number(durationMs.toFixed(3)),
      shard_id: shard.shard_id,
      error: error.message,
    });

    throw error;
  } finally {
    client.release();
  }
}

async function getClient() {
  return getPool().connect();
}

async function getClientForUser(userId) {
  const { pool, shard } = await resolvePoolForUser(userId);
  const client = await pool.connect();
  client.__shard = shard;
  return client;
}

module.exports = {
  getPool,
  query,
  queryForUser,
  getClient,
  getClientForUser,
};
