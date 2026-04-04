import { z } from 'zod';
import { AppError } from '../../utils/errors';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT, ROLES, TRANSACTION_TYPES } from '../../utils/constants';
import { getCache, getJSONCache, incrementCache, setJSONCache } from '../../lib/Redis';
import { ServiceActor } from '../../types';
import * as financeRepository from './repository';
import { findById as findUserById } from '../user/repository';
import { emitFinanceTransactionChanged } from '../../events/domainEvents';

const TRANSACTION_LIST_CACHE_TTL_SECONDS = 20;
const TRANSACTION_LIST_VERSION_TTL_SECONDS = 60 * 60;
const MONEY_REGEX = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

function normalizeMoney(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  const normalizedFraction = `${fraction}00`.slice(0, 2);
  return `${whole}.${normalizedFraction}`;
}

const moneySchema = z.coerce
  .string()
  .trim()
  .regex(MONEY_REGEX, 'amount must be a positive decimal with up to 2 decimal places')
  .refine((value) => Number(value) > 0, 'amount must be greater than 0')
  .transform(normalizeMoney);

const transactionIdSchema = z.string().uuid('transaction id must be a valid UUID');

const createSchema = z.object({
  user_id: z.string().uuid().optional(),
  amount: moneySchema,
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
    amount: moneySchema.optional(),
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
    amount: row.amount,
    type: row.type,
    category: row.category,
    note: row.note,
    timestamp: row.timestamp,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function transactionListVersionKey(scope: string): string {
  return `transactions:list:version:${scope}`;
}

async function getTransactionListVersion(scope: string): Promise<number> {
  const raw = await getCache(transactionListVersionKey(scope));
  const parsed = Number.parseInt(raw ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function serializeFilters(filters: {
  user_id?: string;
  type?: 'income' | 'expense';
  category?: string;
  start_date?: Date;
  end_date?: Date;
}) {
  return {
    ...filters,
    start_date: filters.start_date?.toISOString(),
    end_date: filters.end_date?.toISOString(),
  };
}

function buildTransactionListCacheKey(params: {
  scope: string;
  version: number;
  actor: ServiceActor;
  filters: {
    user_id?: string;
    type?: 'income' | 'expense';
    category?: string;
    start_date?: Date;
    end_date?: Date;
  };
  page: number;
  limit: number;
}): string {
  return `transactions:list:${params.scope}:v${params.version}:${JSON.stringify({
    actor_role: params.actor.role,
    actor_user_id: params.actor.user_id,
    filters: serializeFilters(params.filters),
    page: params.page,
    limit: params.limit,
  })}`;
}

async function invalidateTransactionCaches(userId: string): Promise<void> {
  await Promise.all([
    incrementCache(transactionListVersionKey('all'), TRANSACTION_LIST_VERSION_TTL_SECONDS),
    incrementCache(
      transactionListVersionKey(`user:${userId}`),
      TRANSACTION_LIST_VERSION_TTL_SECONDS
    ),
  ]);
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

export async function createTransaction(input: unknown, actor: ServiceActor) {
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

  if (result.created) {
    await invalidateTransactionCaches(targetUserId);
    emitFinanceTransactionChanged({ userId: targetUserId });
  }

  return {
    created: result.created,
    transaction: toPublicTransaction(result.transaction),
  };
}

export async function listTransactions(input: unknown, actor: ServiceActor) {
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

  const scope = filters.user_id ? `user:${filters.user_id}` : 'all';
  const version = await getTransactionListVersion(scope);
  const cacheKey = buildTransactionListCacheKey({
    scope,
    version,
    actor,
    filters,
    page: data.page,
    limit: data.limit,
  });
  const cached = await getJSONCache<{
    data: ReturnType<typeof toPublicTransaction>[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      total_pages: number;
    };
  }>(cacheKey);

  if (cached) {
    return cached;
  }

  const offset = (data.page - 1) * data.limit;

  const [rows, total] = await Promise.all([
    financeRepository.list(filters, { limit: data.limit, offset }),
    financeRepository.count(filters),
  ]);

  const response = {
    data: rows.map(toPublicTransaction),
    pagination: {
      page: data.page,
      limit: data.limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / data.limit)),
    },
  };

  await setJSONCache(cacheKey, response, TRANSACTION_LIST_CACHE_TTL_SECONDS);

  return response;
}

export async function getTransactionById(id: string, actor: ServiceActor) {
  const transactionId = transactionIdSchema.parse(id);
  const transaction = await financeRepository.findById(transactionId);

  if (!transaction) {
    throw new AppError('Transaction not found', 404);
  }

  if (actor.role === 'viewer' && transaction.user_id !== actor.user_id) {
    throw new AppError('Forbidden', 403);
  }

  return toPublicTransaction(transaction);
}

export async function updateTransaction(id: string, input: unknown) {
  const transactionId = transactionIdSchema.parse(id);
  const updates = updateSchema.parse(input);
  const updated = await financeRepository.update(transactionId, {
    amount: updates.amount,
    type: updates.type,
    category: updates.category,
    note: updates.note,
    timestamp: updates.timestamp,
  });

  if (!updated) {
    throw new AppError('Transaction not found', 404);
  }

  await invalidateTransactionCaches(updated.user_id);
  emitFinanceTransactionChanged({ userId: updated.user_id });

  return toPublicTransaction(updated);
}

export async function deleteTransaction(id: string) {
  const transactionId = transactionIdSchema.parse(id);
  const deleted = await financeRepository.deleteById(transactionId);
  if (!deleted) {
    throw new AppError('Transaction not found', 404);
  }

  await invalidateTransactionCaches(deleted.user_id);
  emitFinanceTransactionChanged({ userId: deleted.user_id });

  return toPublicTransaction(deleted);
}
