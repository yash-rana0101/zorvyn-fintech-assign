'use strict';

const { Router } = require('express');
const controller = require('./user.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { defaultLimiter } = require('../../middleware/rateLimiter.middleware');
const { authorize } = require('../../middleware/rbac.middleware');
const { ROLES } = require('../../../../../packages/utils/constants');

const router = Router();

router.use(authenticate);
router.use(defaultLimiter);

router.post('/', authorize([ROLES.ADMIN]), controller.createUser);
router.get('/', authorize([ROLES.ADMIN]), controller.listUsers);
router.get('/:id', authorize([ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER]), controller.getUserById);
router.put('/:id', authorize([ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER]), controller.updateUser);
router.delete('/:id', authorize([ROLES.ADMIN]), controller.deactivateUser);

module.exports = router;