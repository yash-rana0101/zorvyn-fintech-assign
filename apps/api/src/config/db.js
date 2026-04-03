'use strict';

const { Pool } = require('pg');
const logger = require('../../../../packages/logger/logger');
const {
  describeRouting,
  getConnectionOverride,
  resolveShardForUser,
} = require('../../../../packages/database/shardRouter');

let defaultPool = null;
const shardPools = new Map();
let shardRoutingLogged = false;

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return parsed;
}

function buildPoolConfig(overrides = {}) {
  return {
    host: overrides.host || process.env.DB_HOST || 'localhost',
    port: parseInteger(overrides.port, parseInteger(process.env.DB_PORT || '5432', 5432)),
    database: overrides.database || process.env.DB_NAME || 'finance_db',
    user: overrides.user || process.env.DB_USER || 'postgres',
    password: overrides.password || process.env.DB_PASSWORD || 'postgres',
    min: parseInteger(overrides.min, parseInteger(process.env.DB_POOL_MIN || '2', 2)),
    max: parseInteger(overrides.max, parseInteger(process.env.DB_POOL_MAX || '20', 20)),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  };
}

function createPool(label, overrides = {}) {
  const pool = new Pool(buildPoolConfig(overrides));

  pool.on('connect', () => {
    logger.debug('PostgreSQL: new client connected', {
      pool: label,
    });
  });

  pool.on('error', (err) => {
    logger.error('PostgreSQL pool error', {
      pool: label,
      error: err.message,
    });
  });
  console.log("Database Connected Successfully");
  return pool;
}

function getOrCreateShardPool(shardId, overrides = {}) {
  const key = String(shardId);
  if (shardPools.has(key)) {
    return shardPools.get(key);
  }

  const pool = createPool(`shard-${key}`, overrides);
  shardPools.set(key, pool);
  return pool;
}

function getShardPool(shard) {
  const override = getConnectionOverride(shard.shard_id);
  if (!override) {
    return getPool();
  }

  return getOrCreateShardPool(shard.shard_id, override);
}

async function resolvePoolForUser(userId) {
  const shard = await resolveShardForUser(userId);

  if (!shardRoutingLogged) {
    const summary = describeRouting();
    logger.info('Shard routing initialized', summary);
    shardRoutingLogged = true;
  }

  return {
    pool: getShardPool(shard),
    shard,
  };
}

/**
 * Get or create the PostgreSQL connection pool.
 * Singleton pattern to reuse connections across requests.
 */
function getPool() {
  if (defaultPool) return defaultPool;

  defaultPool = createPool('default');
  return defaultPool;
}

/**
 * Execute a query using the pool.
 * @param {string} text - SQL query string
 * @param {Array} [params] - Query parameters
 */
async function query(text, params) {
  const start = Date.now();
  const client = await getPool().connect();
  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    logger.debug('PostgreSQL query executed', { duration, rows: result.rowCount });
    return result;
  } finally {
    client.release();
  }
}

/**
 * Execute a query for a specific user using shard routing when configured.
 * Falls back to the default pool when routing is disabled.
 *
 * @param {string} userId
 * @param {string} text
 * @param {Array} [params]
 */
async function queryForUser(userId, text, params) {
  const start = Date.now();
  const { pool, shard } = await resolvePoolForUser(userId);
  const client = await pool.connect();

  try {
    const result = await client.query(text, params);
    const duration = Date.now() - start;

    logger.debug('PostgreSQL shard query executed', {
      duration,
      rows: result.rowCount,
      shard_id: shard.shard_id,
      virtual_shard_id: shard.virtual_shard_id,
      region: shard.region,
    });

    return result;
  } finally {
    client.release();
  }
}

/**
 * Get a dedicated client for transactions.
 * Remember to call client.release() after use.
 */
async function getClient() {
  return getPool().connect();
}

/**
 * Get a dedicated shard-routed client for user-scoped writes.
 * @param {string} userId
 */
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
