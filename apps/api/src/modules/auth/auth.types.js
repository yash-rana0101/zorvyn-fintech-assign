'use strict';

/**
 * @typedef {Object} TokenPayload
 * @property {string} user_id - UUID of the user
 * @property {string} email - User's email address
 * @property {'admin'|'analyst'|'viewer'} role - User's assigned role
 * @property {number} iat - Issued at (Unix timestamp)
 * @property {number} exp - Expiry (Unix timestamp)
 */

/**
 * @typedef {Object} User
 * @property {string} id - UUID primary key
 * @property {string} email - Unique email address
 * @property {string} password_hash - bcrypt-hashed password
 * @property {'admin'|'analyst'|'viewer'} role - RBAC role
 * @property {'active'|'inactive'} status - Account status
 * @property {Date} created_at
 * @property {Date} updated_at
 */

/**
 * @typedef {Object} LoginInput
 * @property {string} email
 * @property {string} password
 */

/**
 * @typedef {Object} RegisterInput
 * @property {string} email
 * @property {string} password
 * @property {'admin'|'analyst'|'viewer'} [role]
 */

/**
 * @typedef {Object} AuthResponse
 * @property {boolean} success
 * @property {string} access_token
 * @property {Object} user
 * @property {string} user.id
 * @property {string} user.email
 * @property {string} user.role
 */

/** Valid RBAC roles */
const ROLES = Object.freeze({
  ADMIN: 'admin',
  ANALYST: 'analyst',
  VIEWER: 'viewer',
});

module.exports = { ROLES };
