import { query } from '../../db';
import { Role, UserStatus } from '../../utils/constants';

export type UserRow = {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

const PUBLIC_COLUMNS = 'id, name, email, role, status, created_at, updated_at';
const PRIVATE_COLUMNS = `${PUBLIC_COLUMNS}, password_hash`;

export async function findById(id: string, includePassword = false): Promise<UserRow | null> {
  const columns = includePassword ? PRIVATE_COLUMNS : PUBLIC_COLUMNS;
  const result = await query<UserRow>(
    `SELECT ${columns} FROM users WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function findByEmail(email: string): Promise<UserRow | null> {
  const result = await query<UserRow>(
    `SELECT ${PRIVATE_COLUMNS} FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [email]
  );
  return result.rows[0] ?? null;
}

export async function create(input: {
  name: string | null;
  email: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
}): Promise<Omit<UserRow, 'password_hash'>> {
  const result = await query<Omit<UserRow, 'password_hash'>>(
    `INSERT INTO users (name, email, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING ${PUBLIC_COLUMNS}`,
    [input.name, input.email, input.password_hash, input.role, input.status]
  );

  return result.rows[0];
}

export async function update(
  id: string,
  updates: Partial<{
    name: string | null;
    email: string;
    password_hash: string;
    role: Role;
    status: UserStatus;
  }>
): Promise<Omit<UserRow, 'password_hash'> | null> {
  const allowed = new Set(['name', 'email', 'password_hash', 'role', 'status']);
  const entries = Object.entries(updates).filter(
    ([key, value]) => allowed.has(key) && value !== undefined
  );

  if (entries.length === 0) {
    return findById(id) as Promise<Omit<UserRow, 'password_hash'> | null>;
  }

  const setClause = entries.map(([key], idx) => `${key} = $${idx + 1}`).join(', ');
  const values = entries.map(([, value]) => value);
  values.push(id);

  const result = await query<Omit<UserRow, 'password_hash'>>(
    `UPDATE users
     SET ${setClause}, updated_at = NOW()
     WHERE id = $${values.length}
     RETURNING ${PUBLIC_COLUMNS}`,
    values
  );

  return result.rows[0] ?? null;
}

export async function list(limit: number, offset: number): Promise<Array<Omit<UserRow, 'password_hash'>>> {
  const result = await query<Omit<UserRow, 'password_hash'>>(
    `SELECT ${PUBLIC_COLUMNS}
     FROM users
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  return result.rows;
}

export async function count(): Promise<number> {
  const result = await query<{ total: number }>('SELECT COUNT(*)::int AS total FROM users');
  return result.rows[0]?.total ?? 0;
}
