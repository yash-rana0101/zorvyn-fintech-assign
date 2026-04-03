'use strict';

/**
 * Application-wide constants.
 * Import from here — never hard-code magic values in business logic.
 */

// ─── Roles ────────────────────────────────────────────────────────────────
const ROLES = Object.freeze({
  ADMIN: 'admin',
  ANALYST: 'analyst',
  VIEWER: 'viewer',
});

const ALL_ROLES = Object.values(ROLES);

// ─── User Status ──────────────────────────────────────────────────────────
const USER_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
});

// ─── Transaction Types ────────────────────────────────────────────────────
const TRANSACTION_TYPES = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
});

// ─── Cache TTLs (seconds) ─────────────────────────────────────────────────
const CACHE_TTL = Object.freeze({
  RBAC_ROLE: 300,          // 5 minutes
  DASHBOARD_SUMMARY: 30,   // 30 seconds
  USER_PROFILE: 60,        // 1 minute
});

// ─── Pagination ───────────────────────────────────────────────────────────
const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

// ─── HTTP Status Codes ────────────────────────────────────────────────────
const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
});

module.exports = {
  ROLES,
  ALL_ROLES,
  USER_STATUS,
  TRANSACTION_TYPES,
  CACHE_TTL,
  PAGINATION,
  HTTP_STATUS,
};
