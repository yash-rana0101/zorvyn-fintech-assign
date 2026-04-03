'use strict';

const { z } = require('zod');
const {
  ROLES,
  USER_STATUS,
  PAGINATION,
} = require('../../../../../packages/utils/constants');

const roleEnum = z.enum([ROLES.ADMIN, ROLES.ANALYST, ROLES.VIEWER]);
const statusEnum = z.enum([USER_STATUS.ACTIVE, USER_STATUS.INACTIVE]);

const createUserSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long'),
    email: z.string().trim().email('Invalid email format'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    role: roleEnum.default(ROLES.VIEWER),
  })
  .strict();

const adminUpdateUserSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long').optional(),
    email: z.string().trim().email('Invalid email format').optional(),
    password: z.string().min(8, 'Password must be at least 8 characters').optional(),
    role: roleEnum.optional(),
    status: statusEnum.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required for update',
  });

const selfUpdateUserSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(255, 'Name is too long'),
  })
  .strict();

const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

module.exports = {
  createUserSchema,
  adminUpdateUserSchema,
  selfUpdateUserSchema,
  listUsersSchema,
};