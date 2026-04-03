'use strict';

const { Pool } = require('pg');
const logger = require('../logger/logger');
const { recordHistogram, METRICS } = require('../monitoring/metrics');

let pool = null;

function resolveServiceName() {
  return process.env.OBSERVABILITY_SERVICE_NAME || process.env.SERVICE_NAME || 'api';
}

/**
 * Singleton PostgreSQL pool.
 *
 * Features:
 *  - Connection pooling (2–20 connections)
 *  - Automatic reconnection
 *  - Health monitoring
 *  - Query helper with timing
 */
function getPool() {
  if (pool) return pool;

  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'finance_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

  pool.on('connect', (client) => {
    logger.debug('Database: new client connected');
    client.query("SET timezone = 'UTC'");
  });

  pool.on('error', (err) => {
    logger.error('Database pool error', { error: err.message });
    // Don't crash — let pool handle reconnection
  });

  return pool;
}

/**
 * Execute a parameterized query.
 * @param {string} text - SQL query
 * @param {any[]} [params] - Query parameters
 * @returns {Promise<import('pg').QueryResult>}
 */
async function query(text, params) {
  const startedAt = process.hrtime.bigint();
  const client = await getPool().connect();

  try {
    const result = await client.query(text, params);
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    recordHistogram(METRICS.DB_QUERY_DURATION_MS, Number(durationMs.toFixed(3)), {
      service: resolveServiceName(),
    });

    logger.debug('Query executed', {
      duration_ms: Number(durationMs.toFixed(3)),
      rows: result.rowCount,
    });

    return result;
  } catch (error) {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;

    recordHistogram(METRICS.DB_QUERY_DURATION_MS, Number(durationMs.toFixed(3)), {
      service: resolveServiceName(),
    });

    logger.error('Query failed', {
      duration_ms: Number(durationMs.toFixed(3)),
      error: error.message,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get a client for manual transaction management.
 * @returns {Promise<import('pg').PoolClient>}
 */
async function getClient() {
  return getPool().connect();
}

/**
 * Execute multiple queries in a transaction.
 * @param {Function} callback - Receives client, should run queries
 */
async function withTransaction(callback) {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getPool, query, getClient, withTransaction };
