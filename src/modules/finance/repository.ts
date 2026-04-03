import { PoolClient } from 'pg';
import { query } from '../../db';

export type TransactionRow = {
  id: string;
  user_id: string;
  amount: string;
  type: 'income' | 'expense';
  category: string;
  note: string | null;
  timestamp: string;
  idempotency_key: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS = 'id, user_id, amount, type, category, note, timestamp, idempotency_key, created_at, updated_at';

function executor(client?: PoolClient) {
  if (client) {
    return client.query.bind(client);
  }

  return query;
}

export async function findById(id: string): Promise<TransactionRow | null> {
  const result = await query<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findByIdempotencyKey(key: string, client?: PoolClient): Promise<TransactionRow | null> {
  const runQuery = executor(client);
  const result = await runQuery<TransactionRow>(
    `SELECT ${COLUMNS} FROM transactions WHERE idempotency_key = $1 LIMIT 1`,
    [key]
  );
  return result.rows[0] ?? null;
}

export async function createWithIdempotency(
  input: {
    user_id: string;
    amount: number;
    type: 'income' | 'expense';
    category: string;
    note: string | null;
    timestamp: Date;
    idempotency_key: string;
  },
  client?: PoolClient
): Promise<{ created: boolean; transaction: TransactionRow | null }> {
  const runQuery = executor(client);
  const inserted = await runQuery<TransactionRow>(
    `INSERT INTO transactions (user_id, amount, type, category, note, timestamp, idempotency_key, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING ${COLUMNS}`,
    [
      input.user_id,
      input.amount,
      input.type,
      input.category,
      input.note,
      input.timestamp,
      input.idempotency_key,
    ]
  );

  if (inserted.rows[0]) {
    return { created: true, transaction: inserted.rows[0] };
  }

  const existing = await findByIdempotencyKey(input.idempotency_key, client);
  return { created: false, transaction: existing };
}

function buildWhereClause(filters: {
  user_id?: string;
  type?: 'income' | 'expense';
  category?: string;
  start_date?: Date;
  end_date?: Date;
}) {
  const clauses: string[] = [];
  const values: unknown[] = [];
  let index = 1;

  if (filters.user_id) {
    clauses.push(`user_id = $${index++}`);
    values.push(filters.user_id);
  }

  if (filters.type) {
    clauses.push(`type = $${index++}`);
    values.push(filters.type);
  }

  if (filters.category) {
    clauses.push(`category = $${index++}`);
    values.push(filters.category);
  }

  if (filters.start_date) {
    clauses.push(`timestamp >= $${index++}`);
    values.push(filters.start_date);
  }

  if (filters.end_date) {
    clauses.push(`timestamp <= $${index++}`);
    values.push(filters.end_date);
  }

  return {
    where: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
    nextIndex: index,
  };
}

export async function list(
  filters: {
    user_id?: string;
    type?: 'income' | 'expense';
    category?: string;
    start_date?: Date;
    end_date?: Date;
  },
  pagination: { limit: number; offset: number }
): Promise<TransactionRow[]> {
  const { where, values, nextIndex } = buildWhereClause(filters);

  const result = await query<TransactionRow>(
    `SELECT ${COLUMNS}
     FROM transactions
     ${where}
     ORDER BY timestamp DESC, id DESC
     LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
    [...values, pagination.limit, pagination.offset]
  );

  return result.rows;
}

export async function count(filters: {
  user_id?: string;
  type?: 'income' | 'expense';
  category?: string;
  start_date?: Date;
  end_date?: Date;
}): Promise<number> {
  const { where, values } = buildWhereClause(filters);
  const result = await query<{ total: number }>(
    `SELECT COUNT(*)::int AS total FROM transactions ${where}`,
    values
  );

  return result.rows[0]?.total ?? 0;
}

export async function update(
  id: string,
  updates: Partial<{
    amount: number;
    type: 'income' | 'expense';
    category: string;
    note: string | null;
    timestamp: Date;
  }>
): Promise<TransactionRow | null> {
  const entries = Object.entries(updates).filter(([, value]) => value !== undefined);
  if (entries.length === 0) {
    return findById(id);
  }

  const setClause = entries.map(([key], idx) => `${key} = $${idx + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  values.push(id);

  const result = await query<TransactionRow>(
    `UPDATE transactions
     SET ${setClause}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING ${COLUMNS}`,
    values
  );

  return result.rows[0] ?? null;
}

export async function deleteById(id: string): Promise<TransactionRow | null> {
  const result = await query<TransactionRow>(
    `DELETE FROM transactions WHERE id = $1 RETURNING ${COLUMNS}`,
    [id]
  );

  return result.rows[0] ?? null;
}
