'use strict';

const { z } = require('zod');
const { TRANSACTION_TYPES } = require('../../../../packages/utils/constants');

const typeEnum = z.enum([
  TRANSACTION_TYPES.INCOME,
  TRANSACTION_TYPES.EXPENSE,
]);

const noteSchema = z
  .string()
  .trim()
  .max(500, 'Note is too long')
  .transform((value) => (value.length === 0 ? null : value));

const createTransactionSchema = z
  .object({
    user_id: z.string().uuid('user_id must be a valid UUID'),
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    type: typeEnum,
    category: z
      .string()
      .trim()
      .min(1, 'Category is required')
      .max(100, 'Category is too long'),
    note: noteSchema.optional(),
    timestamp: z.coerce.date().optional(),
    idempotency_key: z
      .string()
      .trim()
      .min(1, 'idempotency_key is required')
      .max(255, 'idempotency_key is too long'),
  })
  .strict();

module.exports = {
  createTransactionSchema,
};
