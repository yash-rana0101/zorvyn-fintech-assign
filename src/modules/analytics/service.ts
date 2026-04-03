import { z } from 'zod';
import { AppError } from '../../utils/errors';
import { ROLES } from '../../utils/constants';
import { getCache, getJSONCache, incrementCache, setJSONCache } from '../../lib/Redis';
import {
  AnalyticsSummaryResponse,
  AnalyticsTrendResponse,
  ServiceActor,
} from '../../types';
import * as analyticsRepository from './repository';

const ANALYTICS_CACHE_TTL_SECONDS = 60 * 60;
const ANALYTICS_VERSION_TTL_SECONDS = 60 * 60;

const querySchema = z.object({
  user_id: z.string().uuid().optional(),
});

function analyticsVersionKey(targetUserId?: string): string {
  return targetUserId
    ? `analytics:version:user:${targetUserId}`
    : 'analytics:version:all';
}

function summaryCacheKey(targetUserId: string | undefined, version: number): string {
  return targetUserId
    ? `analytics:summary:user:${targetUserId}:v${version}`
    : `analytics:summary:all:v${version}`;
}

function trendsCacheKey(targetUserId: string | undefined, version: number): string {
  return targetUserId
    ? `analytics:trends:user:${targetUserId}:v${version}`
    : `analytics:trends:all:v${version}`;
}

async function getAnalyticsVersion(targetUserId?: string): Promise<number> {
  const raw = await getCache(analyticsVersionKey(targetUserId));
  const parsed = Number.parseInt(raw ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function resolveTargetUserId(actor: ServiceActor, requestedUserId?: string): string | undefined {
  if (actor.role === 'viewer') {
    if (requestedUserId && requestedUserId !== actor.user_id) {
      throw new AppError('Viewer can only access own analytics', 403);
    }

    return actor.user_id;
  }

  return requestedUserId;
}

export async function getSummary(actor: ServiceActor, queryInput: unknown) {
  const data = querySchema.parse(queryInput ?? {});
  const targetUserId = resolveTargetUserId(actor, data.user_id);

  const version = await getAnalyticsVersion(targetUserId);
  const cacheKey = summaryCacheKey(targetUserId, version);
  const cached = await getJSONCache<AnalyticsSummaryResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  const summary = await analyticsRepository.getSummary(targetUserId);

  const response: AnalyticsSummaryResponse = {
    total_income: summary.total_income,
    total_expense: summary.total_expense,
    net_balance: summary.net_balance,
  };

  await setJSONCache(cacheKey, response, ANALYTICS_CACHE_TTL_SECONDS);

  return response;
}

export async function getTrends(actor: ServiceActor, queryInput: unknown) {
  const data = querySchema.parse(queryInput ?? {});
  const targetUserId = resolveTargetUserId(actor, data.user_id);

  const version = await getAnalyticsVersion(targetUserId);
  const cacheKey = trendsCacheKey(targetUserId, version);
  const cached = await getJSONCache<AnalyticsTrendResponse[]>(cacheKey);
  if (cached) {
    return cached;
  }

  const rows = await analyticsRepository.getMonthlyTrends(targetUserId);

  const response: AnalyticsTrendResponse[] = rows.map((row) => ({
    month: row.month_key,
    income: row.income,
    expense: row.expense,
  }));

  await setJSONCache(cacheKey, response, ANALYTICS_CACHE_TTL_SECONDS);

  return response;
}

export async function invalidateAnalyticsCache(userId?: string): Promise<void> {
  await incrementCache(analyticsVersionKey(), ANALYTICS_VERSION_TTL_SECONDS);
  if (userId) {
    await incrementCache(analyticsVersionKey(userId), ANALYTICS_VERSION_TTL_SECONDS);
  }
}
