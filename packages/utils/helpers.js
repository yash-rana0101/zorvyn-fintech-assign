'use strict';

const { PAGINATION } = require('./constants');

/**
 * General-purpose helper utilities.
 * All helpers must be pure functions with no side effects.
 */

/**
 * Remove sensitive fields from an object before sending it.
 * @param {object} obj
 * @param {string[]} fields - Fields to omit
 * @returns {object}
 */
function omit(obj, fields) {
  const result = { ...obj };
  fields.forEach((f) => delete result[f]);
  return result;
}

/**
 * Pick specific fields from an object.
 * @param {object} obj
 * @param {string[]} fields
 * @returns {object}
 */
function pick(obj, fields) {
  return fields.reduce((acc, key) => {
    if (key in obj) acc[key] = obj[key];
    return acc;
  }, {});
}

/**
 * Sleep for N milliseconds (useful in retry logic).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff.
 * @param {Function} fn
 * @param {number} [maxRetries=3]
 * @param {number} [baseDelayMs=200]
 */
async function withRetry(fn, maxRetries = 3, baseDelayMs = 200) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      await sleep(baseDelayMs * attempt);
    }
  }
}

/**
 * Paginate a DB query result.
 * @param {number} page - 1-indexed page number
 * @param {number} limit - Items per page
 * @returns {{ offset: number, limit: number }}
 */
function getPagination(page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT) {
  const safePage = Math.max(1, parseInt(page, 10));
  const safeLimit = Math.min(
    PAGINATION.MAX_LIMIT,
    Math.max(1, parseInt(limit, 10))
  );
  return {
    offset: (safePage - 1) * safeLimit,
    limit: safeLimit,
    page: safePage,
  };
}

/**
 * Build a standard paginated response.
 * @param {Array} data
 * @param {number} total - Total record count
 * @param {number} page
 * @param {number} limit
 */
function paginatedResponse(data, total, page, limit) {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
      has_next: page * limit < total,
      has_prev: page > 1,
    },
  };
}

module.exports = { omit, pick, sleep, withRetry, getPagination, paginatedResponse };
