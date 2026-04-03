'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../../../../packages/logger/logger');
const { HTTP_STATUS } = require('../../../../packages/utils/constants');
const transactionRepository = require('../repositories/transaction.repository');
const { createTransactionSchema } = require('../validators/transaction.validator');
const { getClient, getClientForUser } = require('../db/connection');
const { publishTransactionCreated } = require('../redis/publisher');

function buildError(message, statusCode) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toPublicTransaction(transaction) {
  return {
    id: transaction.id,
    user_id: transaction.user_id,
    amount:
      typeof transaction.amount === 'string'
        ? Number(transaction.amount)
        : transaction.amount,
    type: transaction.type,
    category: transaction.category,
    note: transaction.note ?? null,
    timestamp: transaction.timestamp,
    created_at: transaction.created_at,
    updated_at: transaction.updated_at,
  };
}

async function createTransaction(input) {
  const data = createTransactionSchema.parse(input || {});

  const client = typeof getClientForUser === 'function'
    ? await getClientForUser(data.user_id)
    : await getClient();

  try {
    await client.query('BEGIN');

    const result = await transactionRepository.createWithIdempotency(client, {
      id: uuidv4(),
      user_id: data.user_id,
      amount: data.amount,
      type: data.type,
      category: data.category,
      note: data.note ?? null,
      timestamp: data.timestamp || new Date(),
      idempotency_key: data.idempotency_key,
    });

    await client.query('COMMIT');

    if (!result.transaction) {
      throw buildError('Unable to process transaction', HTTP_STATUS.CONFLICT);
    }

    const transaction = toPublicTransaction(result.transaction);

    if (result.created) {
      try {
        await publishTransactionCreated(transaction);
      } catch (eventError) {
        logger.error('Finance write event publish failed after DB commit', {
          transaction_id: transaction.id,
          error: eventError.message,
        });
      }
    }

    return {
      created: result.created,
      status: result.created ? 'created' : 'existing',
      transaction_id: transaction.id,
      transaction,
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.warn('Finance write transaction rollback failed', {
        error: rollbackError.message,
      });
    }

    if (error.code === '23505') {
      const existing = await transactionRepository.findByIdempotencyKey(
        data.idempotency_key,
        client
      );

      if (existing) {
        const existingTransaction = toPublicTransaction(existing);
        return {
          created: false,
          status: 'existing',
          transaction_id: existingTransaction.id,
          transaction: existingTransaction,
        };
      }
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createTransaction,
};
