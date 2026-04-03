'use strict';

const transactionService = require('../services/transaction.service');
const { setRequestContext } = require('../../../../packages/logger/requestContext');
const { HTTP_STATUS } = require('../../../../packages/utils/constants');

async function createTransaction(req, res, next) {
  try {
    setRequestContext({ user_id: req.body?.user_id || null });
    const result = await transactionService.createTransaction(req.body);

    return res.status(result.created ? HTTP_STATUS.CREATED : HTTP_STATUS.OK).json({
      success: true,
      data: {
        transaction_id: result.transaction_id,
        status: result.status,
        transaction: result.transaction,
      },
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  createTransaction,
};
