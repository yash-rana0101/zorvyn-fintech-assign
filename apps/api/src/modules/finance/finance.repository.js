'use strict';

const { query } = require('../../config/db');

const PUBLIC_TRANSACTION_COLUMNS = `
  id,
  user_id,
  amount,
  type,
  category,
  note,
  "timestamp",
  created_at,
  updated_at
`;

async function execute(text, params, client) {
  if (client) {
    return client.query(text, params);
  }

  return query(text, params);
}

function buildFilterClause(filters = {}, startIndex = 1) {
  const clauses = [];
  const params = [];
  let index = startIndex;

  if (filters.user_id) {
    clauses.push(`user_id = $${index}`);
    params.push(filters.user_id);
    index += 1;
  }

  if (filters.type) {
    clauses.push(`type = $${index}`);
    params.push(filters.type);
    index += 1;
  }

  if (filters.category) {
    clauses.push(`category = $${index}`);
    params.push(filters.category);
    index += 1;
  }

  if (filters.start_date) {
    clauses.push(`"timestamp" >= $${index}`);
    params.push(filters.start_date);
    index += 1;
  }

  if (filters.end_date) {
    clauses.push(`"timestamp" <= $${index}`);
    params.push(filters.end_date);
    index += 1;
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
    nextIndex: index,
  };
}

async function findById(id, client) {
  const result = await execute(
    `SELECT ${PUBLIC_TRANSACTION_COLUMNS}
     FROM transactions
     WHERE id = $1`,
    [id],
    client
  );

  return result.rows[0] || null;
}

async function findByIdempotencyKey(key, client) {
  const result = await execute(
    `SELECT ${PUBLIC_TRANSACTION_COLUMNS}
     FROM transactions
     WHERE idempotency_key = $1`,
    [key],
    client
  );

  return result.rows[0] || null;
}

async function createWithIdempotency(client, transaction) {
  const insertResult = await execute(
    `INSERT INTO transactions (
      id,
      user_id,
      amount,
      type,
      category,
      note,
      "timestamp",
      idempotency_key,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING ${PUBLIC_TRANSACTION_COLUMNS}`,
    [
      transaction.id,
      transaction.user_id,
      transaction.amount,
      transaction.type,
      transaction.category,
      transaction.note,
      transaction.timestamp,
      transaction.idempotency_key,
    ],
    client
  );

  if (insertResult.rows[0]) {
    return {
      transaction: insertResult.rows[0],
      created: true,
    };
  }

  const existing = await findByIdempotencyKey(transaction.idempotency_key, client);

  return {
    transaction: existing,
    created: false,
  };
}

async function list(filters, { limit, offset }) {
  const { whereClause, params, nextIndex } = buildFilterClause(filters);

  params.push(limit);
  params.push(offset);

  const result = await query(
    `SELECT ${PUBLIC_TRANSACTION_COLUMNS}
     FROM transactions
     ${whereClause}
     ORDER BY "timestamp" DESC, id DESC
     LIMIT $${nextIndex} OFFSET $${nextIndex + 1}`,
    params
  );

  return result.rows;
}

async function count(filters) {
  const { whereClause, params } = buildFilterClause(filters);

  const result = await query(
    `SELECT COUNT(*)::int AS total
     FROM transactions
     ${whereClause}`,
    params
  );

  return parseInt(result.rows[0]?.total || '0', 10);
}

async function update(id, updates) {
  const allowedColumns = new Map([
    ['amount', 'amount'],
    ['type', 'type'],
    ['category', 'category'],
    ['note', 'note'],
    ['timestamp', '"timestamp"'],
  ]);

  const updateEntries = Object.entries(updates).filter(
    ([column, value]) => allowedColumns.has(column) && value !== undefined
  );

  if (updateEntries.length === 0) {
    return findById(id);
  }

  const setClauses = updateEntries.map(
    ([column], index) => `${allowedColumns.get(column)} = $${index + 1}`
  );
  const params = updateEntries.map(([, value]) => value);
  params.push(id);

  const result = await query(
    `UPDATE transactions
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING ${PUBLIC_TRANSACTION_COLUMNS}`,
    params
  );

  return result.rows[0] || null;
}

async function deleteById(id) {
  const result = await query(
    `DELETE FROM transactions
     WHERE id = $1
     RETURNING ${PUBLIC_TRANSACTION_COLUMNS}`,
    [id]
  );

  return result.rows[0] || null;
}

module.exports = {
  createWithIdempotency,
  findById,
  findByIdempotencyKey,
  list,
  count,
  update,
  deleteById,
};
