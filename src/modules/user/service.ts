import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { AppError } from '../../utils/errors';
import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT, ROLES, USER_STATUSES } from '../../utils/constants';
import { deleteCache, getCache, getJSONCache, incrementCache, setJSONCache } from '../../lib/Redis';
import * as userRepository from './repository';

type Actor = {
  user_id: string;
  role: (typeof ROLES)[number];
};

const USER_CACHE_TTL_SECONDS = 120;
const USER_LIST_CACHE_TTL_SECONDS = 60;
const USER_LIST_VERSION_TTL_SECONDS = 60 * 60;
const USER_LIST_VERSION_KEY = 'users:list:version';

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

const userIdSchema = z.string().uuid('user id must be a valid UUID');

function ensureSelfOrAdmin(actor: Actor, targetUserId: string): void {
  if (actor.role !== 'admin' && actor.user_id !== targetUserId) {
    throw new AppError('Forbidden', 403);
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function userByIdCacheKey(userId: string): string {
  return `users:by-id:${userId}`;
}

function authMeCacheKey(userId: string): string {
  return `auth:me:user:${userId}`;
}

async function getUserListVersion(): Promise<number> {
  const raw = await getCache(USER_LIST_VERSION_KEY);
  const parsed = Number.parseInt(raw ?? '', 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }

  return parsed;
}

function userListCacheKey(version: number, page: number, limit: number): string {
  return `users:list:v${version}:page:${page}:limit:${limit}`;
}

async function invalidateUserCaches(userId?: string): Promise<void> {
  await incrementCache(USER_LIST_VERSION_KEY, USER_LIST_VERSION_TTL_SECONDS);
  if (userId) {
    await deleteCache(userByIdCacheKey(userId), authMeCacheKey(userId));
  }
}

export async function createUser(input: unknown) {
  const data = createSchema.parse(input);
  const email = normalizeEmail(data.email);

  const existing = await userRepository.findByEmail(email);
  if (existing) {
    throw new AppError('Email already registered', 409);
  }

  const password_hash = await bcrypt.hash(data.password, 10);
  const created = await userRepository.create({
    name: data.name,
    email,
    password_hash,
    role: data.role,
    status: 'active',
  });

  await Promise.all([
    incrementCache(USER_LIST_VERSION_KEY, USER_LIST_VERSION_TTL_SECONDS),
    setJSONCache(userByIdCacheKey(created.id), created, USER_CACHE_TTL_SECONDS),
  ]);

  return created;
}

export async function getUserById(userId: string, actor: Actor) {
  const targetUserId = userIdSchema.parse(userId);
  ensureSelfOrAdmin(actor, targetUserId);

  const cacheKey = userByIdCacheKey(targetUserId);
  const cached = await getJSONCache<Omit<userRepository.UserRow, 'password_hash'>>(cacheKey);
  if (cached) {
    return cached;
  }

  const user = await userRepository.findById(targetUserId);
  if (!user) {
    throw new AppError('User not found', 404);
  }

  await setJSONCache(cacheKey, user, USER_CACHE_TTL_SECONDS);

  return user;
}

export async function updateUser(userId: string, input: unknown, actor: Actor) {
  const targetUserId = userIdSchema.parse(userId);
  ensureSelfOrAdmin(actor, targetUserId);

  const existing = await userRepository.findById(targetUserId, true);
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
      if (owner && owner.id !== targetUserId) {
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

  const updated = await userRepository.update(targetUserId, updates);
  if (!updated) {
    throw new AppError('User not found', 404);
  }

  await invalidateUserCaches(targetUserId);
  await setJSONCache(userByIdCacheKey(targetUserId), updated, USER_CACHE_TTL_SECONDS);

  return updated;
}

export async function deactivateUser(userId: string) {
  const targetUserId = userIdSchema.parse(userId);
  const updated = await userRepository.update(targetUserId, { status: 'inactive' });
  if (!updated) {
    throw new AppError('User not found', 404);
  }

  await invalidateUserCaches(targetUserId);
  await setJSONCache(userByIdCacheKey(targetUserId), updated, USER_CACHE_TTL_SECONDS);

  return updated;
}

export async function listUsers(input: unknown) {
  const params = listSchema.parse(input ?? {});
  const version = await getUserListVersion();
  const cacheKey = userListCacheKey(version, params.page, params.limit);
  const cached = await getJSONCache<{
    data: Array<Omit<userRepository.UserRow, 'password_hash'>>;
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

  const offset = (params.page - 1) * params.limit;

  const [data, total] = await Promise.all([
    userRepository.list(params.limit, offset),
    userRepository.count(),
  ]);

  const response = {
    data,
    pagination: {
      page: params.page,
      limit: params.limit,
      total,
      total_pages: Math.max(1, Math.ceil(total / params.limit)),
    },
  };

  await setJSONCache(cacheKey, response, USER_LIST_CACHE_TTL_SECONDS);

  return response;
}
