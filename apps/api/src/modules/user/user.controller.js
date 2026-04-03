'use strict';

const userService = require('./user.service');
const {
  ROLES,
  HTTP_STATUS,
} = require('../../../../../packages/utils/constants');

function canAccessUser(requestUser, targetUserId) {
  return (
    requestUser?.role === ROLES.ADMIN || requestUser?.user_id === targetUserId
  );
}

function forbiddenError() {
  const err = new Error('Forbidden: insufficient permissions');
  err.statusCode = HTTP_STATUS.FORBIDDEN;
  return err;
}

async function createUser(req, res, next) {
  try {
    const user = await userService.createUser(req.body);

    return res.status(HTTP_STATUS.CREATED).json({
      success: true,
      data: user,
    });
  } catch (err) {
    return next(err);
  }
}

async function getUserById(req, res, next) {
  try {
    if (!canAccessUser(req.user, req.params.id)) {
      return next(forbiddenError());
    }

    const user = await userService.getUserById(req.params.id);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: user,
    });
  } catch (err) {
    return next(err);
  }
}

async function updateUser(req, res, next) {
  try {
    if (!canAccessUser(req.user, req.params.id)) {
      return next(forbiddenError());
    }

    const user = await userService.updateUser(req.params.id, req.body, req.user);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: user,
    });
  } catch (err) {
    return next(err);
  }
}

async function deactivateUser(req, res, next) {
  try {
    const user = await userService.deactivateUser(req.params.id);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: user,
    });
  } catch (err) {
    return next(err);
  }
}

async function listUsers(req, res, next) {
  try {
    const result = await userService.listUsers(req.query);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createUser,
  getUserById,
  updateUser,
  deactivateUser,
  listUsers,
};