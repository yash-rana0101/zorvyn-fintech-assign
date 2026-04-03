'use strict';

const { query } = require('../db/connection');

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

async function findByIdempotencyKey(idempotencyKey, client) {
  const result = await execute(
    `SELECT ${PUBLIC_TRANSACTION_COLUMNS}
     FROM transactions
     WHERE idempotency_key = $1`,
    [idempotencyKey],
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
      created: true,
      transaction: insertResult.rows[0],
    };
  }

  const existing = await findByIdempotencyKey(transaction.idempotency_key, client);

  return {
    created: false,
    transaction: existing,
  };
}

module.exports = {
  createWithIdempotency,
  findByIdempotencyKey,
};
