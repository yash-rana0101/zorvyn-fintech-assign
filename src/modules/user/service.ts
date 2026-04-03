import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '../../utils/errors';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT, ROLES, USER_STATUSES } from '../../utils/constants';
import * as userRepository from './repository';

type Actor = {
  user_id: string;
  role: (typeof ROLES)[number];
};

const createSchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: z.string().trim().email(),
  password: z.string().min(8),
  role: z.enum(ROLES).default('viewer'),
});

const adminUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    email: z.string().trim().email().optional(),
    password: z.string().min(8).optional(),
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field is required');

const selfUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(255),
  })
  .refine((data) => Object.keys(data).length > 0, 'At least one field is required');

const listSchema = z.object({
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
});

function ensureSelfOrAdmin(actor: Actor, targetUserId: string): void {
  if (actor.role !== 'admin' && actor.user_id !== targetUserId) {
    throw new AppError('Forbidden', 403);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function createUser(input: unknown) {
  const data = createSchema.parse(input);
  const email = normalizeEmail(data.email);

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const password_hash = await bcrypt.hash(data.password, 10);
  return userRepository.create({
    name: data.name,
    email,
    password_hash,
    role: data.role,
    status: 'active',
  });
}

export async function getUserById(userId: string, actor: Actor) {
  ensureSelfOrAdmin(actor, userId);

  const user = await userRepository.findById(userId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  return user;
}

export async function updateUser(userId: string, input: unknown, actor: Actor) {
  ensureSelfOrAdmin(actor, userId);

  const existing = await userRepository.findById(userId, true);
  if (!existing) {
    throw new AppError('User not found', 404);
  }

  const updates: {
    name?: string;
    email?: string;
    password_hash?: string;
    role?: (typeof ROLES)[number];
    status?: (typeof USER_STATUSES)[number];
  } = {};

  if (actor.role === 'admin') {
    const data = adminUpdateSchema.parse(input);

    if (data.name !== undefined) {
      updates.name = data.name;
    }

    if (data.email !== undefined) {
      const email = normalizeEmail(data.email);
      const owner = await userRepository.findByEmail(email);
      if (owner && owner.id !== userId) {
        throw new AppError('Email already registered', 409);
      }
      updates.email = email;
    }

    if (data.password !== undefined) {
      updates.password_hash = await bcrypt.hash(data.password, 10);
    }

    if (data.role !== undefined) {
      updates.role = data.role;
    }

    if (data.status !== undefined) {
      updates.status = data.status;
    }
  } else {
    const data = selfUpdateSchema.parse(input);
    updates.name = data.name;
  }

  const updated = await userRepository.update(userId, updates);
  if (!updated) {
    throw new AppError('User not found', 404);
  }

  return updated;
}

export async function deactivateUser(userId: string) {
  const updated = await userRepository.update(userId, { status: 'inactive' });
  if (!updated) {
    throw new AppError('User not found', 404);
  }

  return updated;
}

export async function listUsers(input: unknown) {
  const params = listSchema.parse(input ?? {});
  const offset = (params.page - 1) * params.limit;

  const [data, total] = await Promise.all([
    userRepository.list(params.limit, offset),
    userRepository.count(),
  ]);

  return {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / params.limit)),
    },
  };
}
