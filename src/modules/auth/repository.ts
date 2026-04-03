import { query } from '../../db';
import { Role, UserStatus } from '../../utils/constants';

export type AuthUserRow = {
  id: string;
  name: string | null;
  email: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
  created_at: string;
  updated_at: string;
};

export async function findUserByEmail(email: string): Promise<AuthUserRow | null> {
  const result = await query<AuthUserRow>(
    `SELECT id, name, email, password_hash, role, status, created_at, updated_at
     FROM users
     WHERE LOWER(email) = LOWER($1)
     LIMIT 1`,
    [email]
  );

  return result.rows[0] ?? null;
}

export async function findUserById(id: string): Promise<AuthUserRow | null> {
  const result = await query<AuthUserRow>(
    `SELECT id, name, email, password_hash, role, status, created_at, updated_at
     FROM users
     WHERE id = $1
     LIMIT 1`,
    [id]
  );

  return result.rows[0] ?? null;
}

export async function createUser(input: {
  name: string | null;
  email: string;
  password_hash: string;
  role: Role;
  status: UserStatus;
}): Promise<Omit<AuthUserRow, 'password_hash'>> {
  const result = await query<Omit<AuthUserRow, 'password_hash'>>(
    `INSERT INTO users (name, email, password_hash, role, status, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
     RETURNING id, name, email, role, status, created_at, updated_at`,
    [input.name, input.email, input.password_hash, input.role, input.status]
  );

  return result.rows[0];
}
