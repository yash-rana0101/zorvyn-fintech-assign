'use strict';

const { Router } = require('express');
const controller = require('./analytics.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { defaultLimiter } = require('../../middleware/rateLimiter.middleware');
const { authorize } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../../../../packages/utils/constants');

const router = Router();

router.use(authenticate);
router.use(defaultLimiter);

router.get(
  '/summary',
  authorize([ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER]),
  controller.getSummary
);
router.get(
  '/trends',
  authorize([ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER]),
  controller.getTrends
);

module.exports = router;
