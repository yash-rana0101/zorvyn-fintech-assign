'use strict';

const ANALYTICS_PERIODS = Object.freeze({
  MONTHLY: 'monthly',
});

const DEFAULT_TREND_PERIOD = ANALYTICS_PERIODS.MONTHLY;
const ANALYTICS_MIN_TTL_SECONDS = 10;
const ANALYTICS_MAX_TTL_SECONDS = 30;

const TREND_MONTH_LABELS = Object.freeze([
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]);

const DEFAULT_CATEGORY = 'uncategorized';

function resolveAnalyticsCacheTtl() {
  const configured = Number.parseInt(process.env.ANALYTICS_CACHE_TTL || '', 10);

  if (Number.isFinite(configured)) {
    return Math.min(
      ANALYTICS_MAX_TTL_SECONDS,
      Math.max(ANALYTICS_MIN_TTL_SECONDS, configured)
    );
  }

  return 20;
}

const ANALYTICS_CACHE_TTL_SECONDS = resolveAnalyticsCacheTtl();

module.exports = {
  ANALYTICS_PERIODS,
  DEFAULT_TREND_PERIOD,
  ANALYTICS_MIN_TTL_SECONDS,
  ANALYTICS_MAX_TTL_SECONDS,
  ANALYTICS_CACHE_TTL_SECONDS,
  TREND_MONTH_LABELS,
  DEFAULT_CATEGORY,
};
