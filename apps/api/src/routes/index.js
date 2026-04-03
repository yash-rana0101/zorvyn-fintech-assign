'use strict';

const { Router } = require('express');
const authRoutes = require('../modules/auth/auth.routes');
const userRoutes = require('../modules/user/user.routes');
const financeRoutes = require('../modules/finance/finance.routes');
const analyticsRoutes = require('../modules/analytics/analytics.routes');

const router = Router();

// ─── Module Routes ──────────────────────────────────────────────────────────
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/transactions', financeRoutes);
router.use('/analytics', analyticsRoutes);

// ─── API Info ───────────────────────────────────────────────────────────────
router.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Finance API v1',
    version: '1.0.0',
    docs: '/api/v1/docs',
  });
});

module.exports = router;
