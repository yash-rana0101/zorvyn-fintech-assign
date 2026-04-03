'use strict';

/**
 * Auth module middleware re-exports.
 * Provides a clean import surface for other modules:
 *   const { authenticate } = require('../auth/auth.middleware');
 */

const { authenticate } = require('../../middleware/auth.middleware');
const { authorize } = require('../../middleware/rbac.middleware');

module.exports = { authenticate, authorize };
