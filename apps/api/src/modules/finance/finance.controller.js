'use strict';

const financeService = require('./finance.service');
const { HTTP_STATUS } = require('../../../../../packages/utils/constants');

async function createTransaction(req, res, next) {
  try {
    const result = await financeService.createTransaction(
      req.body,
      req.user.user_id
    );

    return res.status(result.created ? HTTP_STATUS.CREATED : HTTP_STATUS.OK).json({
      success: true,
      data: {
        id: result.transaction.id,
        status: result.created ? 'created' : 'existing',
        transaction: result.transaction,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function listTransactions(req, res, next) {
  try {
    const result = await financeService.getTransactions(req.query, req.user);

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (err) {
    return next(err);
  }
}

async function updateTransaction(req, res, next) {
  try {
    const transaction = await financeService.updateTransaction(
      req.params.id,
      req.body,
      req.user.user_id
    );

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: transaction,
    });
  } catch (err) {
    return next(err);
  }
}

async function deleteTransaction(req, res, next) {
  try {
    const transaction = await financeService.deleteTransaction(
      req.params.id,
      req.user.user_id
    );

    return res.status(HTTP_STATUS.OK).json({
      success: true,
      data: {
        id: transaction.id,
        status: 'deleted',
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  createTransaction,
  listTransactions,
  updateTransaction,
  deleteTransaction,
};
