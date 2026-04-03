'use strict';

const { Router } = require('express');
const controller = require('./finance.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { defaultLimiter } = require('../../middleware/rateLimiter.middleware');
const { authorize } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../../../../packages/utils/constants');

const router = Router();

router.use(authenticate);
router.use(defaultLimiter);

router.post('/', authorize([ROLES.ADMIN, ROLES.ANALYST]), controller.createTransaction);
router.get('/', authorize([ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER]), controller.listTransactions);
router.put('/:id', authorize([ROLES.ADMIN]), controller.updateTransaction);
router.delete('/:id', authorize([ROLES.ADMIN]), controller.deleteTransaction);

module.exports = router;
