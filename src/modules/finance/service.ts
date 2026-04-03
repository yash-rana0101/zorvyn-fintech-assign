import { z } from 'zod';
import { AppError } from '../../utils/errors';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT, ROLES, TRANSACTION_TYPES } from '../../utils/constants';
import * as financeRepository from './repository';
import { findById as findUserById } from '../user/repository';

type Actor = {
  user_id: string;
  role: (typeof ROLES)[number];
};

const createSchema = z.object({
  user_id: z.string().uuid().optional(),
  amount: z.coerce.number().positive(),
  type: z.enum(TRANSACTION_TYPES),
  category: z.string().trim().min(1).max(100),
  note: z.string().trim().max(1000).optional(),
  timestamp: z.coerce.date().optional(),
  idempotency_key: z.string().trim().min(1).max(255),
});

const listSchema = z
  .object({
    page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
    limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
    user_id: z.string().uuid().optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    start_date: z.coerce.date().optional(),
    end_date: z.coerce.date().optional(),
  })
  .refine(
    (data) => !data.start_date || !data.end_date || data.start_date.getTime() <= data.end_date.getTime(),
    {
      message: 'start_date must be before or equal to end_date',
      path: ['start_date'],
    }
  );

const updateSchema = z
  .object({
    amount: z.coerce.number().positive().optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    category: z.string().trim().min(1).max(100).optional(),
    note: z.string().trim().max(1000).nullable().optional(),
    timestamp: z.coerce.date().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field is required');

function toPublicTransaction(row: financeRepository.TransactionRow) {
  return {
    id: row.id,
    user_id: row.user_id,
    amount: Number(row.amount),
    type: row.type,
    category: row.category,
    note: row.note,
    timestamp: row.timestamp,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function assertActiveUser(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  if (user.status !== 'active') {
    throw new AppError('Inactive users cannot perform this action', 403);
  }
}

export async function createTransaction(input: unknown, actor: Actor) {
  const data = createSchema.parse(input);

  const targetUserId =
    actor.role === 'viewer'
      ? actor.user_id
      : data.user_id ?? actor.user_id;

  if (actor.role === 'viewer' && data.user_id && data.user_id !== actor.user_id) {
    throw new AppError('Forbidden', 403);
  }

  await assertActiveUser(targetUserId);

  const result = await financeRepository.createWithIdempotency({
    user_id: targetUserId,
    amount: data.amount,
    type: data.type,
    category: data.category,
    note: data.note ?? null,
    timestamp: data.timestamp ?? new Date(),
    idempotency_key: data.idempotency_key,
  });

  if (!result.transaction) {
    throw new AppError('Unable to process transaction', 409);
  }

  return {
    created: result.created,
    transaction: toPublicTransaction(result.transaction),
  };
}

export async function listTransactions(input: unknown, actor: Actor) {
  const data = listSchema.parse(input ?? {});

  const filters: {
    user_id?: string;
    type?: 'income' | 'expense';
    category?: string;
    start_date?: Date;
    end_date?: Date;
  } = {};

  if (actor.role === 'viewer') {
    filters.user_id = actor.user_id;
  } else if (data.user_id) {
    filters.user_id = data.user_id;
  }

  if (data.type) filters.type = data.type;
  if (data.category) filters.category = data.category;
  if (data.start_date) filters.start_date = data.start_date;
  if (data.end_date) filters.end_date = data.end_date;

  const offset = (data.page - 1) * data.limit;

  const [rows, total] = await Promise.all([
    financeRepository.list(filters, { limit: data.limit, offset }),
    financeRepository.count(filters),
  ]);

  return {
    data: rows.map(toPublicTransaction),
    pagination: {
      page: data.page,
      limit: data.limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / data.limit)),
    },
  };
}

export async function updateTransaction(id: string, input: unknown) {
  const updates = updateSchema.parse(input);
  const updated = await financeRepository.update(id, {
    amount: updates.amount,
    type: updates.type,
    category: updates.category,
    note: updates.note,
    timestamp: updates.timestamp,
  });

  if (!updated) {
    throw new AppError('Transaction not found', 404);
  }

  return toPublicTransaction(updated);
}

export async function deleteTransaction(id: string) {
  const deleted = await financeRepository.deleteById(id);
  if (!deleted) {
    throw new AppError('Transaction not found', 404);
  }

  return toPublicTransaction(deleted);
}
