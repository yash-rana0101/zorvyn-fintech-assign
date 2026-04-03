import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { signAccessToken } from '../../config/jwt';
import { AppError } from '../../utils/errors';
import { ROLES } from '../../utils/constants';
import { createUser, findUserByEmail, findUserById } from './repository';

const registerSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(ROLES).optional(),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

function toSafeUser(user: {
  id: string;
  name: string | null;
  email: string;
  role: (typeof ROLES)[number];
  status: string;
  created_at: string;
  updated_at: string;
}) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    status: user.status,
    created_at: user.created_at,
    updated_at: user.updated_at,
  };
}

export async function register(input: unknown) {
  const data = registerSchema.parse(input);
  const email = data.email.toLowerCase();

  const existing = await findUserByEmail(email);
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const password_hash = await bcrypt.hash(data.password, 10);

  const created = await createUser({
    name: data.name ?? null,
    email,
    password_hash,
    role: data.role ?? 'viewer',
    status: 'active',
  });

  const access_token = signAccessToken({
    user_id: created.id,
    email: created.email,
    role: created.role,
  });

  return {
    access_token,
    token_type: 'Bearer',
    user: toSafeUser(created),
  };
}

export async function login(input: unknown) {
  const data = loginSchema.parse(input);
  const user = await findUserByEmail(data.email.toLowerCase());

  if (!user) {
    throw new AppError('Invalid email or password', 401);
  }

  if (user.status !== 'active') {
    throw new AppError('Account is inactive', 403);
  }

  const ok = await bcrypt.compare(data.password, user.password_hash);
  if (!ok) {
    throw new AppError('Invalid email or password', 401);
  }

  const access_token = signAccessToken({
    user_id: user.id,
    email: user.email,
    role: user.role,
  });

  return {
    access_token,
    token_type: 'Bearer',
    user: toSafeUser(user),
  };
}

export async function getMe(userId: string) {
  const user = await findUserById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  return toSafeUser(user);
}
