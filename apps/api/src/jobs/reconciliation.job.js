'use strict';

const { query } = require('../config/db');
const analyticsRepository = require('../modules/analytics/analytics.repository');
const logger = require('../../../../packages/logger/logger');
const { incrementCounter, METRICS } = require('../../../../packages/monitoring/metrics');

const DEFAULT_INTERVAL_MS = 24 * 60 * 60 * 1000; // Daily
const DEFAULT_STARTUP_DELAY_MS = 30 * 1000;
const DEFAULT_USER_BATCH_SIZE = 5000;
const EPSILON = 0.01;

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseInteger(value, fallback, min = 1) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

function toAmount(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Number(parsed.toFixed(2));
}

function isEqualAmount(left, right) {
  return Math.abs(toAmount(left) - toAmount(right)) <= EPSILON;
}

function sanitizeDetails(details) {
  if (!details || typeof details !== 'object') {
    return {};
  }

  return details;
}

function buildReconciledSnapshot(existingSnapshot, aggregate) {
  const now = new Date().toISOString();

  return {
    total_income: toAmount(aggregate.total_income),
    total_expense: toAmount(aggregate.total_expense),
    net_balance: toAmount(aggregate.total_income) - toAmount(aggregate.total_expense),
    events_processed: Number.parseInt(existingSnapshot?.events_processed, 10) || 0,
    category_totals: sanitizeDetails(existingSnapshot?.category_totals),
    trends: sanitizeDetails(existingSnapshot?.trends),
    updated_at: now,
    reconciled_at: now,
  };
}

async function persistReconciliationRun(summary) {
  try {
    await query(
      `INSERT INTO reconciliation_runs (
        id,
        status,
        checked_at,
        users_checked,
        mismatches,
        details
      )
      VALUES (
        uuid_generate_v4(),
        $1,
        NOW(),
        $2,
        $3,
        $4::jsonb
      )`,
      [
        summary.status,
        summary.users_checked,
        summary.mismatches,
        JSON.stringify({
          repaired: summary.repaired,
          duration_ms: summary.duration_ms,
          sample: summary.sample,
        }),
      ]
    );
  } catch (error) {
    logger.warn('Failed to persist reconciliation run metadata', {
      error: error.message,
    });
  }
}

async function loadTransactionAggregates(limit) {
  return query(
    `SELECT
      user_id,
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0)::numeric AS total_income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0)::numeric AS total_expense
     FROM transactions
     GROUP BY user_id
     ORDER BY user_id
     LIMIT $1`,
    [limit]
  );
}

async function runReconciliation(options = {}) {
  const startedAt = Date.now();
  const userLimit = parseInteger(
    options.userLimit || process.env.RECONCILIATION_USER_LIMIT,
    DEFAULT_USER_BATCH_SIZE
  );

  const sample = [];
  let mismatches = 0;
  let repaired = 0;
  let usersChecked = 0;

  try {
    const aggregatesResult = await loadTransactionAggregates(userLimit);
    const aggregates = aggregatesResult.rows || [];

    for (const aggregate of aggregates) {
      usersChecked += 1;

      const expectedIncome = toAmount(aggregate.total_income);
      const expectedExpense = toAmount(aggregate.total_expense);
      const expectedNet = toAmount(expectedIncome - expectedExpense);

      const snapshot = await analyticsRepository.getSnapshot(aggregate.user_id);

      const snapshotIncome = toAmount(snapshot?.total_income);
      const snapshotExpense = toAmount(snapshot?.total_expense);
      const snapshotNet = toAmount(snapshot?.net_balance);

      const aligned =
        isEqualAmount(snapshotIncome, expectedIncome)
        && isEqualAmount(snapshotExpense, expectedExpense)
        && isEqualAmount(snapshotNet, expectedNet);

      if (!aligned) {
        mismatches += 1;

        const reconciled = buildReconciledSnapshot(snapshot, {
          total_income: expectedIncome,
          total_expense: expectedExpense,
        });

        const updated = await analyticsRepository.setSnapshot(
          aggregate.user_id,
          reconciled,
          parseInteger(process.env.ANALYTICS_CACHE_TTL, 20)
        );

        if (updated) {
          repaired += 1;
        }

        if (sample.length < 25) {
          sample.push({
            user_id: aggregate.user_id,
            expected: {
              total_income: expectedIncome,
              total_expense: expectedExpense,
              net_balance: expectedNet,
            },
            actual: {
              total_income: snapshotIncome,
              total_expense: snapshotExpense,
              net_balance: snapshotNet,
            },
          });
        }
      }
    }

    const summary = {
      status: 'success',
      users_checked: usersChecked,
      mismatches,
      repaired,
      sample,
      duration_ms: Date.now() - startedAt,
    };

    incrementCounter(METRICS.RECONCILIATION_RUN_TOTAL, {
      service: 'api',
      status: summary.status,
    });

    if (mismatches > 0) {
      incrementCounter(METRICS.RECONCILIATION_MISMATCH_TOTAL, {
        service: 'api',
      }, mismatches);
    }

    await persistReconciliationRun(summary);

    logger.info('Reconciliation job completed', {
      users_checked: usersChecked,
      mismatches,
      repaired,
      duration_ms: summary.duration_ms,
    });

    return summary;
  } catch (error) {
    const summary = {
      status: 'failed',
      users_checked: usersChecked,
      mismatches,
      repaired,
      sample,
      duration_ms: Date.now() - startedAt,
      error: error.message,
    };

    incrementCounter(METRICS.RECONCILIATION_RUN_TOTAL, {
      service: 'api',
      status: 'failed',
    });

    await persistReconciliationRun(summary);

    logger.error('Reconciliation job failed', {
      error: error.message,
      duration_ms: summary.duration_ms,
    });

    throw error;
  }
}

function startReconciliationScheduler() {
  const enabled = parseBoolean(process.env.RECONCILIATION_ENABLED, false);
  if (!enabled) {
    logger.info('Reconciliation scheduler is disabled');
    return null;
  }

  const intervalMs = parseInteger(
    process.env.RECONCILIATION_INTERVAL_MS,
    DEFAULT_INTERVAL_MS
  );
  const startupDelayMs = parseInteger(
    process.env.RECONCILIATION_STARTUP_DELAY_MS,
    DEFAULT_STARTUP_DELAY_MS,
    0
  );

  let running = false;
  let intervalHandle = null;
  let startupHandle = null;

  const tick = async () => {
    if (running) {
      logger.warn('Skipping reconciliation tick because previous run is still active');
      return;
    }

    running = true;
    try {
      await runReconciliation();
    } finally {
      running = false;
    }
  };

  startupHandle = setTimeout(() => {
    void tick();
    intervalHandle = setInterval(() => {
      void tick();
    }, intervalMs);

    if (typeof intervalHandle.unref === 'function') {
      intervalHandle.unref();
    }
  }, startupDelayMs);

  if (typeof startupHandle.unref === 'function') {
    startupHandle.unref();
  }

  logger.info('Reconciliation scheduler started', {
    interval_ms: intervalMs,
    startup_delay_ms: startupDelayMs,
  });

  return {
    async runNow() {
      return runReconciliation();
    },
    stop() {
      if (startupHandle) {
        clearTimeout(startupHandle);
        startupHandle = null;
      }

      if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
      }

      logger.info('Reconciliation scheduler stopped');
    },
  };
}

module.exports = {
  runReconciliation,
  startReconciliationScheduler,
};
