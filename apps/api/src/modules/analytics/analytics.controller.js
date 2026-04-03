'use strict';

const analyticsService = require('./analytics.service');
const { HTTP_STATUS } = require('../../../../../packages/utils/constants');

async function getSummary(req, res, next) {
  try {
    const summary = await analyticsService.getSummary(req.user, req.query);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: summary,
    });
  } catch (err) {
    return next(err);
  }
}

async function getTrends(req, res, next) {
  try {
    const trends = await analyticsService.getTrends(req.user, req.query);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: trends,
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  getSummary,
  getTrends,
};
