'use strict';

/**
 * @typedef {Object} Transaction
 * @property {string} id
 * @property {string} user_id
 * @property {number} amount
 * @property {'income'|'expense'} type
 * @property {string} category
 * @property {string|null} note
 * @property {Date|string} timestamp
 * @property {Date|string} created_at
 * @property {Date|string} updated_at
 */

const TRANSACTION_CATEGORY_MAX_LENGTH = 100;
const TRANSACTION_NOTE_MAX_LENGTH = 1000;

module.exports = {
  TRANSACTION_CATEGORY_MAX_LENGTH,
  TRANSACTION_NOTE_MAX_LENGTH,
};
