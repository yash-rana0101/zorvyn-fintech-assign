'use strict';

const logger = require('../../../../packages/logger/logger');

/**
 * Role-Based Access Control (RBAC) middleware factory.
 *
 * Usage:
 *   router.get('/admin-only', authenticate, authorize(['admin']), handler)
 *   router.get('/analysts', authenticate, authorize(['admin', 'analyst']), handler)
 *
 * @param {string[]} allowedRoles - Array of roles permitted to access the route
 * @returns {Function} Express middleware
 */
function authorize(allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error('authorize() requires a non-empty array of roles');
  }

  return (req, res, next) => {
    // authenticate() must run before authorize()
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    const { role, user_id } = req.user;

    if (!allowedRoles.includes(role)) {
      logger.warn('RBAC: access denied', {
        user_id,
        role,
        required: allowedRoles,
        path: req.path,
      });

      return res.status(403).json({
        success: false,
        error: 'Forbidden: insufficient permissions',
        required: allowedRoles,
        current: role,
      });
    }

    logger.debug('RBAC: access granted', { user_id, role, path: req.path });
    return next();
  };
}

module.exports = { authorize };
