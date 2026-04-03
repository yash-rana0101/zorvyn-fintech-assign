'use strict';

const { query } = require('../../config/db');

const PUBLIC_USER_COLUMNS = `
  id,
  name,
  email,
  role,
  status,
  created_at,
  updated_at
`;

const PRIVATE_USER_COLUMNS = `
  ${PUBLIC_USER_COLUMNS},
  password_hash
`;

async function findById(id, options = {}) {
  const columns = options.includePassword
    ? PRIVATE_USER_COLUMNS
    : PUBLIC_USER_COLUMNS;

  const result = await query(
    `SELECT ${columns}
     FROM users
     WHERE id = $1`,
    [id]
  );

  return result.rows[0] || null;
}

async function findByEmail(email, options = {}) {
  const columns = options.includePassword
    ? PRIVATE_USER_COLUMNS
    : PUBLIC_USER_COLUMNS;

  const result = await query(
    `SELECT ${columns}
     FROM users
     WHERE LOWER(email) = LOWER($1)`,
    [email]
  );

  return result.rows[0] || null;
}

async function create(user) {
  const result = await query(
    `INSERT INTO users (id, name, email, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
     RETURNING ${PUBLIC_USER_COLUMNS}`,
    [user.id, user.name, user.email, user.password_hash, user.role, user.status]
  );

  return result.rows[0] || null;
}

async function update(id, updates) {
  const allowedColumns = new Set([
    'name',
    'email',
    'password_hash',
    'role',
    'status',
  ]);

  const updateEntries = Object.entries(updates).filter(
    ([column, value]) => allowedColumns.has(column) && value !== undefined
  );

  if (updateEntries.length === 0) {
    return findById(id);
  }

  const setClauses = updateEntries.map(
    ([column], index) => `${column} = $${index + 1}`
  );
  const params = updateEntries.map(([, value]) => value);
  params.push(id);

  const result = await query(
    `UPDATE users
     SET ${setClauses.join(', ')}, updated_at = NOW()
     WHERE id = $${params.length}
     RETURNING ${PUBLIC_USER_COLUMNS}`,
    params
  );

  return result.rows[0] || null;
}

async function list({ limit, offset }) {
  const result = await query(
    `SELECT ${PUBLIC_USER_COLUMNS}
     FROM users
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows;
}

async function count() {
  const result = await query('SELECT COUNT(*)::int AS total FROM users');
  return parseInt(result.rows[0]?.total || '0', 10);
}

module.exports = {
  findById,
  findByEmail,
  create,
  update,
  list,
  count,
};