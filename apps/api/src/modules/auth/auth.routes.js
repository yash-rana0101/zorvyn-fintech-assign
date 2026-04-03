'use strict';

const { Router } = require('express');
const controller = require('./auth.controller');
const { authenticate } = require('../../middleware/auth.middleware');
const { authLimiter } = require('../../middleware/rateLimiter.middleware');

const router = Router();

/**
 * Auth Module Routes
 *
 * POST   /auth/register   → Register new user (rate limited)
 * POST   /auth/login      → Login, receive JWT (rate limited)
 * POST   /auth/refresh    → Rotate refresh token
 * POST   /auth/logout     → Revoke active auth tokens
 * GET    /auth/me         → Get current user profile (requires JWT)
 */

// Apply strict rate limiting to auth endpoints
router.use(authLimiter);

router.post('/register', controller.register);
router.post('/login', controller.login);
router.post('/refresh', controller.refresh);
router.post('/logout', authenticate, controller.logout);
router.get('/me', authenticate, controller.getMe);

module.exports = router;
