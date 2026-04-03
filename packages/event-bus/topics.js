'use strict';

/**
 * Event Topics — centralized constants.
 *
 * All event names must be defined here to:
 *  - Prevent typos
 *  - Keep event transport swappable without changing callers
 *  - Provide discoverability for agents
 */
const TOPICS = Object.freeze({
  // ─── Finance Events ────────────────────────────────────────
  TRANSACTION_CREATED: 'finance.transaction.created',
  TRANSACTION_UPDATED: 'finance.transaction.updated',
  TRANSACTION_DELETED: 'finance.transaction.deleted',

  // ─── User Events ───────────────────────────────────────────
  USER_REGISTERED: 'user.registered',
  USER_UPDATED: 'user.updated',
  USER_ROLE_CHANGED: 'user.role.changed',
  USER_DEACTIVATED: 'user.deactivated',

  // ─── Auth Events ───────────────────────────────────────────
  USER_LOGGED_IN: 'auth.user.logged_in',
  USER_LOGGED_OUT: 'auth.user.logged_out',

  // ─── Analytics Events (Phase 5+) ──────────────────────────
  ANALYTICS_REQUESTED: 'analytics.requested',
  ANALYTICS_COMPUTED: 'analytics.computed',
});

module.exports = { TOPICS };
