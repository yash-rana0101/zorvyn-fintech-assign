'use strict';

const { z } = require('zod');
const {
  PAGINATION,
  TRANSACTION_TYPES,
} = require('../../../../../packages/utils/constants');
const {
  TRANSACTION_CATEGORY_MAX_LENGTH,
  TRANSACTION_NOTE_MAX_LENGTH,
} = require('./finance.types');

const typeEnum = z.enum([
  TRANSACTION_TYPES.INCOME,
  TRANSACTION_TYPES.EXPENSE,
]);

const noteSchema = z
  .string()
  .trim()
  .max(TRANSACTION_NOTE_MAX_LENGTH, 'Note is too long')
  .transform((value) => (value.length === 0 ? null : value));

const createTransactionSchema = z
  .object({
    amount: z.coerce.number().positive('Amount must be greater than 0'),
    type: typeEnum,
    category: z
      .string()
      .trim()
      .min(1, 'Category is required')
      .max(TRANSACTION_CATEGORY_MAX_LENGTH, 'Category is too long'),
    note: noteSchema.optional(),
    timestamp: z.coerce.date().optional(),
    idempotency_key: z
      .string()
      .trim()
      .min(1, 'idempotency_key is required')
      .max(255, 'idempotency_key is too long'),
  })
  .strict();

const updateTransactionSchema = z
  .object({
    amount: z.coerce.number().positive('Amount must be greater than 0').optional(),
    type: typeEnum.optional(),
    category: z
      .string()
      .trim()
      .min(1, 'Category is required')
      .max(TRANSACTION_CATEGORY_MAX_LENGTH, 'Category is too long')
      .optional(),
    note: z.union([noteSchema, z.null()]).optional(),
    timestamp: z.coerce.date().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update',
  });

const listTransactionsSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
    type: typeEnum.optional(),
    category: z
      .string()
      .trim()
      .min(1, 'Category is required')
      .max(TRANSACTION_CATEGORY_MAX_LENGTH, 'Category is too long')
      .optional(),
    user_id: z.string().uuid('user_id must be a valid UUID').optional(),
    start_date: z.coerce.date().optional(),
    end_date: z.coerce.date().optional(),
  })
  .strict()
  .refine(
    (data) =>
      !data.start_date ||
      !data.end_date ||
      data.start_date.getTime() <= data.end_date.getTime(),
    {
      message: 'start_date must be before or equal to end_date',
      path: ['start_date'],
    }
  );

module.exports = {
  createTransactionSchema,
  updateTransactionSchema,
  listTransactionsSchema,
};
