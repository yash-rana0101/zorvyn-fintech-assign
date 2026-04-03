'use strict';

const authService = require('./auth.service');

/**
 * POST /auth/register
 * Register a new user and return JWT.
 */
async function register(req, res, next) {
  try {
    const payload = {
      ...req.body,
      device_id: req.body?.device_id || req.headers['x-device-id'],
    };

    const result = await authService.register(payload);
    return res.status(201).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/login
 * Authenticate user with email+password, return JWT.
 */
async function login(req, res, next) {
  try {
    const payload = {
      ...req.body,
      device_id: req.body?.device_id || req.headers['x-device-id'],
    };

    const result = await authService.login(payload);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/refresh
 * Rotate refresh token and return a new token pair.
 */
async function refresh(req, res, next) {
  try {
    const payload = {
      ...req.body,
      device_id: req.body?.device_id || req.headers['x-device-id'],
    };

    const result = await authService.refresh(payload);
    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * POST /auth/logout
 * Revoke access token + optional refresh session.
 */
async function logout(req, res, next) {
  try {
    const result = await authService.logout({
      ...req.body,
      device_id: req.body?.device_id || req.headers['x-device-id'],
      access_jti: req.user?.jti,
      access_exp: req.user?.exp,
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (err) {
    return next(err);
  }
}

/**
 * GET /auth/me
 * Get authenticated user's profile — requires valid JWT.
 */
async function getMe(req, res, next) {
  try {
    const profile = await authService.getProfile(req.user.user_id);
    return res.status(200).json({
      success: true,
      data: profile,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  register,
  login,
  refresh,
  logout,
  getMe,
};
