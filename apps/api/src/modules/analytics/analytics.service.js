'use strict';

const { z } = require('zod');
const logger = require('../../../../../packages/logger/logger');
const {
  HTTP_STATUS,
  ROLES,
} = require('../../../../../packages/utils/constants');
const analyticsRepository = require('./analytics.repository');
const {
  ANALYTICS_CACHE_TTL_SECONDS,
  ANALYTICS_PERIODS,
  DEFAULT_CATEGORY,
  DEFAULT_TREND_PERIOD,
  TREND_MONTH_LABELS,
} = require('./analytics.types');

const summaryQuerySchema = z
  .object({
    user_id: z.string().uuid('user_id must be a valid UUID').optional(),
  })
  .passthrough();

const trendsQuerySchema = z
  .object({
    user_id: z.string().uuid('user_id must be a valid UUID').optional(),
    period: z.enum([ANALYTICS_PERIODS.MONTHLY]).default(DEFAULT_TREND_PERIOD),
  })
  .passthrough();

const userSnapshots = new Map();
const userUpdateLocks = new Map();
const processedEventKeys = new Set();
const processedEventOrder = [];
const MAX_PROCESSED_EVENT_KEYS = 10_000;

function buildError(message, statusCode) {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
}

function createDefaultSnapshot() {
  return {
    total_income: 0,
    total_expense: 0,
    net_balance: 0,
    events_processed: 0,
    category_totals: {},
    trends: {
      monthly: {},
    },
    updated_at: null,
  };
}

function createEmptyTrendBucket() {
  return {
    income: 0,
    expense: 0,
  };
}

function toAmount(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function toEventDate(value) {
  const source = value || new Date().toISOString();
  const parsed = new Date(source);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function normalizeCategory(value) {
  if (typeof value !== 'string') {
    return DEFAULT_CATEGORY;
  }

  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : DEFAULT_CATEGORY;
}

function getMonthBucketKey(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function cloneMonthlyBuckets(monthlyBuckets) {
  const clone = {};

  for (const [monthKey, bucket] of Object.entries(monthlyBuckets || {})) {
    clone[monthKey] = {
      income: toAmount(bucket?.income) || 0,
      expense: toAmount(bucket?.expense) || 0,
    };
  }

  return clone;
}

function normalizeSnapshot(snapshot) {
  const normalized = createDefaultSnapshot();

  normalized.total_income = toAmount(snapshot?.total_income) || 0;
  normalized.total_expense = toAmount(snapshot?.total_expense) || 0;
  normalized.net_balance = normalized.total_income - normalized.total_expense;

  const processed = Number.parseInt(snapshot?.events_processed, 10);
  normalized.events_processed =
    Number.isFinite(processed) && processed >= 0 ? processed : 0;

  if (
    snapshot?.category_totals &&
    typeof snapshot.category_totals === 'object' &&
    !Array.isArray(snapshot.category_totals)
  ) {
    for (const [category, total] of Object.entries(snapshot.category_totals)) {
      const parsedTotal = toAmount(total);
      if (parsedTotal !== null) {
        normalized.category_totals[category] = parsedTotal;
      }
    }
  }

  normalized.trends.monthly = cloneMonthlyBuckets(snapshot?.trends?.monthly);

  if (typeof snapshot?.updated_at === 'string') {
    normalized.updated_at = snapshot.updated_at;
  }

  return normalized;
}

function cloneSnapshot(snapshot) {
  return normalizeSnapshot(snapshot);
}

function buildEventDedupKey(event, payload) {
  const explicitEventId =
    payload?.event_id || event?.id || event?.event_id || null;

  if (typeof explicitEventId === 'string' && explicitEventId.trim().length > 0) {
    return `event:${explicitEventId.trim()}`;
  }

  if (payload?.transaction_id && payload?.user_id) {
    return `tx:${payload.user_id}:${payload.transaction_id}`;
  }

  return null;
}

function hasProcessedEvent(dedupKey) {
  if (!dedupKey) {
    return false;
  }

  return processedEventKeys.has(dedupKey);
}

function markEventProcessed(dedupKey) {
  if (!dedupKey || processedEventKeys.has(dedupKey)) {
    return;
  }

  processedEventKeys.add(dedupKey);
  processedEventOrder.push(dedupKey);

  while (processedEventOrder.length > MAX_PROCESSED_EVENT_KEYS) {
    const oldestKey = processedEventOrder.shift();
    if (oldestKey) {
      processedEventKeys.delete(oldestKey);
    }
  }
}

function withUserLock(userId, operation) {
  const pending = userUpdateLocks.get(userId) || Promise.resolve();
  const running = pending.catch(() => undefined).then(operation);

  userUpdateLocks.set(userId, running);

  return running.finally(() => {
    if (userUpdateLocks.get(userId) === running) {
      userUpdateLocks.delete(userId);
    }
  });
}

async function loadSnapshot(userId) {
  const inMemorySnapshot = userSnapshots.get(userId);
  if (inMemorySnapshot) {
    return cloneSnapshot(inMemorySnapshot);
  }

  const cachedSnapshot = await analyticsRepository.getSnapshot(userId);
  if (!cachedSnapshot) {
    return createDefaultSnapshot();
  }

  const normalized = normalizeSnapshot(cachedSnapshot);
  userSnapshots.set(userId, normalized);
  return cloneSnapshot(normalized);
}

async function persistSnapshot(userId, snapshot) {
  const normalized = normalizeSnapshot(snapshot);
  userSnapshots.set(userId, normalized);

  const cached = await analyticsRepository.setSnapshot(
    userId,
    normalized,
    ANALYTICS_CACHE_TTL_SECONDS
  );

  if (!cached) {
    logger.warn('Analytics cache write failed, using in-memory snapshot', {
      user_id: userId,
    });
  }

  return cloneSnapshot(normalized);
}

function resolveTargetUserId(actor, requestedUserId) {
  if (!actor?.user_id) {
    throw buildError('Authentication required', HTTP_STATUS.UNAUTHORIZED);
  }

  if (actor.role === ROLES.VIEWER) {
    if (requestedUserId && requestedUserId !== actor.user_id) {
      throw buildError(
        'Viewer can only access own analytics',
        HTTP_STATUS.FORBIDDEN
      );
    }

    return actor.user_id;
  }

  return requestedUserId || actor.user_id;
}

function toMonthLabel(monthKey) {
  const parts = monthKey.split('-');
  if (parts.length !== 2) {
    return monthKey;
  }

  const monthIndex = Number.parseInt(parts[1], 10) - 1;
  if (!Number.isInteger(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return monthKey;
  }

  return TREND_MONTH_LABELS[monthIndex];
}

async function updateAggregates(payload) {
  const userId = payload?.user_id;
  const type = payload?.type;
  const amount = toAmount(payload?.amount);
  const eventDate = toEventDate(payload?.timestamp);
  const category = normalizeCategory(payload?.category);

  if (!userId || !type || amount === null || !eventDate) {
    logger.warn('Analytics consumer ignored invalid event payload', {
      has_user_id: Boolean(userId),
      has_type: Boolean(type),
      has_amount: amount !== null,
      has_timestamp: Boolean(eventDate),
    });
    return null;
  }

  if (type !== 'income' && type !== 'expense') {
    logger.warn('Analytics consumer ignored unsupported transaction type', {
      user_id: userId,
      type,
    });
    return null;
  }

  return withUserLock(userId, async () => {
    const current = await loadSnapshot(userId);

    if (type === 'income') {
      current.total_income += amount;
    } else {
      current.total_expense += amount;
    }

    current.net_balance = current.total_income - current.total_expense;
    current.events_processed += 1;

    current.category_totals[category] =
      (current.category_totals[category] || 0) + amount;

    const monthKey = getMonthBucketKey(eventDate);
    if (!current.trends.monthly[monthKey]) {
      current.trends.monthly[monthKey] = createEmptyTrendBucket();
    }

    current.trends.monthly[monthKey][type] += amount;
    current.updated_at = new Date().toISOString();

    return persistSnapshot(userId, current);
  });
}

async function consumeTransactionCreated(event) {
  const payload = event?.payload || {};

  const dedupKey = buildEventDedupKey(event, payload);
  if (hasProcessedEvent(dedupKey)) {
    logger.debug('Analytics consumer skipped duplicate event', {
      dedup_key: dedupKey,
      user_id: payload?.user_id || null,
    });
    return null;
  }

  const snapshot = await updateAggregates({
    ...payload,
    timestamp: payload.timestamp || event?.timestamp,
  });

  if (snapshot) {
    markEventProcessed(dedupKey);
  }

  return snapshot;
}

function getUserSnapshot(userId) {
  const current = userSnapshots.get(userId);
  if (!current) {
    return createDefaultSnapshot();
  }

  return cloneSnapshot(current);
}

async function getSummary(actorOrUserId, queryParams = {}) {
  let userId;

  if (typeof actorOrUserId === 'string') {
    userId = actorOrUserId;
  } else {
    const query = summaryQuerySchema.parse(queryParams || {});
    userId = resolveTargetUserId(actorOrUserId, query.user_id);
  }

  const snapshot = await loadSnapshot(userId);

  return {
    total_income: snapshot.total_income,
    total_expense: snapshot.total_expense,
    net_balance: snapshot.net_balance,
  };
}

async function getTrends(actorOrUserId, queryOrPeriod = {}) {
  let userId;
  let period = DEFAULT_TREND_PERIOD;

  if (typeof actorOrUserId === 'string') {
    userId = actorOrUserId;
    if (typeof queryOrPeriod === 'string' && queryOrPeriod.trim().length > 0) {
      period = queryOrPeriod.trim().toLowerCase();
    }
  } else {
    const query = trendsQuerySchema.parse(queryOrPeriod || {});
    userId = resolveTargetUserId(actorOrUserId, query.user_id);
    period = query.period;
  }

  if (period !== ANALYTICS_PERIODS.MONTHLY) {
    throw buildError('Unsupported trend period', HTTP_STATUS.BAD_REQUEST);
  }

  const snapshot = await loadSnapshot(userId);
  const monthlyBuckets = snapshot.trends.monthly || {};

  return Object.keys(monthlyBuckets)
    .sort()
    .map((monthKey) => ({
      month: toMonthLabel(monthKey),
      income: toAmount(monthlyBuckets[monthKey]?.income) || 0,
      expense: toAmount(monthlyBuckets[monthKey]?.expense) || 0,
    }));
}

function resetAnalyticsState() {
  userSnapshots.clear();
  userUpdateLocks.clear();
  processedEventKeys.clear();
  processedEventOrder.length = 0;
}

module.exports = {
  consumeTransactionCreated,
  getUserSnapshot,
  updateAggregates,
  getSummary,
  getTrends,
  resetAnalyticsState,
};
