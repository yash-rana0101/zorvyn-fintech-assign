'use strict';

const { v4: uuidv4 } = require('uuid');
const userRepository = require('./user.repository');
const {
	createUserSchema,
	adminUpdateUserSchema,
	selfUpdateUserSchema,
	listUsersSchema,
} = require('./user.types');
const { hashPassword } = require('../../../../../packages/security/passwordHasher');
const { cacheManager } = require('../../../../../packages/cache/cacheManager');
const { invalidateRole } = require('../../../../../packages/security/tokenManager');
const { eventBus } = require('../../../../../packages/event-bus/eventBus');
const { TOPICS } = require('../../../../../packages/event-bus/topics');
const logger = require('../../../../../packages/logger/logger');
const {
	CACHE_TTL,
	ROLES,
	USER_STATUS,
	HTTP_STATUS,
} = require('../../../../../packages/utils/constants');
const { paginatedResponse } = require('../../../../../packages/utils/helpers');

const USER_CACHE_TTL = parseInt(
	process.env.USER_CACHE_TTL ||
		process.env.RBAC_CACHE_TTL ||
		`${CACHE_TTL.RBAC_ROLE}`,
	10
);

const userCacheKey = (userId) => `user:${userId}`;
const roleCacheKey = (userId) => `user:${userId}:role`;

function buildError(message, statusCode) {
	const err = new Error(message);
	err.statusCode = statusCode;
	return err;
}

function normalizeEmail(email) {
	return String(email).trim().toLowerCase();
}

function publishUserEvent(topic, payload) {
	try {
		eventBus.publish(topic, payload);
	} catch (err) {
		logger.error('User event publish failed', {
			topic,
			error: err.message,
		});
	}
}

function toPublicUser(user) {
	if (!user || typeof user !== 'object') return null;

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

async function cacheUser(user) {
	const safeUser = toPublicUser(user);
	if (!safeUser) return;

	await cacheManager.set(userCacheKey(safeUser.id), safeUser, USER_CACHE_TTL);
	await cacheManager.set(roleCacheKey(safeUser.id), safeUser.role, USER_CACHE_TTL);
}

async function invalidateUserCache(userId) {
	await cacheManager.del(userCacheKey(userId), roleCacheKey(userId));
	await invalidateRole(userId);
}

async function createUser(input) {
	const data = createUserSchema.parse(input);
	const email = normalizeEmail(data.email);

	const existing = await userRepository.findByEmail(email);
	if (existing) {
		throw buildError('Email already registered', HTTP_STATUS.CONFLICT);
	}

	const userToCreate = {
		id: uuidv4(),
		name: data.name,
		email,
		password_hash: await hashPassword(data.password),
		role: data.role,
		status: USER_STATUS.ACTIVE,
	};

	const created = await userRepository.create(userToCreate);
	await cacheUser(created);

	logger.info('User created', {
		user_id: created.id,
		role: created.role,
	});

	return toPublicUser(created);
}

async function getUserById(userId) {
	const cached = await cacheManager.getJSON(userCacheKey(userId));

	if (cached && typeof cached === 'object' && cached.id) {
		return toPublicUser(cached);
	}

	const user = await userRepository.findById(userId);
	if (!user) {
		throw buildError('User not found', HTTP_STATUS.NOT_FOUND);
	}

	await cacheUser(user);
	return toPublicUser(user);
}

async function updateUser(userId, input, actor) {
	const existing = await userRepository.findById(userId);
	if (!existing) {
		throw buildError('User not found', HTTP_STATUS.NOT_FOUND);
	}

	const isAdmin = actor?.role === ROLES.ADMIN;
	const isSelf = actor?.user_id === userId;

	if (!isAdmin && !isSelf) {
		throw buildError(
			'Forbidden: insufficient permissions',
			HTTP_STATUS.FORBIDDEN
		);
	}

	if (!isAdmin && existing.status !== USER_STATUS.ACTIVE) {
		throw buildError('Inactive users cannot update profile', HTTP_STATUS.FORBIDDEN);
	}

	let updates = {};

	if (isAdmin) {
		const parsed = adminUpdateUserSchema.parse(input);

		if (Object.prototype.hasOwnProperty.call(parsed, 'name')) {
			updates.name = parsed.name;
		}

		if (Object.prototype.hasOwnProperty.call(parsed, 'email')) {
			const email = normalizeEmail(parsed.email);
			if (email !== normalizeEmail(existing.email)) {
				const emailOwner = await userRepository.findByEmail(email);
				if (emailOwner && emailOwner.id !== userId) {
					throw buildError('Email already registered', HTTP_STATUS.CONFLICT);
				}
			}
			updates.email = email;
		}

		if (Object.prototype.hasOwnProperty.call(parsed, 'password')) {
			updates.password_hash = await hashPassword(parsed.password);
		}

		if (Object.prototype.hasOwnProperty.call(parsed, 'role')) {
			updates.role = parsed.role;
		}

		if (Object.prototype.hasOwnProperty.call(parsed, 'status')) {
			updates.status = parsed.status;
		}
	} else {
		const parsed = selfUpdateUserSchema.parse(input);
		updates = { name: parsed.name };
	}

	const updated = await userRepository.update(userId, updates);
	if (!updated) {
		throw buildError('User not found', HTTP_STATUS.NOT_FOUND);
	}

	await invalidateUserCache(userId);
	await cacheUser(updated);

	const changedFields = Object.keys(updates);
	publishUserEvent(TOPICS.USER_UPDATED, {
		user_id: userId,
		actor_user_id: actor?.user_id,
		changed_fields: changedFields,
	});

	if (existing.role !== updated.role) {
		publishUserEvent(TOPICS.USER_ROLE_CHANGED, {
			user_id: userId,
			old_role: existing.role,
			new_role: updated.role,
			actor_user_id: actor?.user_id,
		});
	}

	logger.info('User updated', {
		target_user_id: userId,
		actor_user_id: actor?.user_id,
		actor_role: actor?.role,
	});

	return toPublicUser(updated);
}

async function deactivateUser(userId) {
	const existing = await userRepository.findById(userId);
	if (!existing) {
		throw buildError('User not found', HTTP_STATUS.NOT_FOUND);
	}

	if (existing.status === USER_STATUS.INACTIVE) {
		await invalidateUserCache(userId);
		await cacheUser(existing);
		return toPublicUser(existing);
	}

	const updated = await userRepository.update(userId, {
		status: USER_STATUS.INACTIVE,
	});

	await invalidateUserCache(userId);
	await cacheUser(updated);
	publishUserEvent(TOPICS.USER_DEACTIVATED, {
		user_id: userId,
		status: USER_STATUS.INACTIVE,
	});

	logger.info('User deactivated', { user_id: userId });

	return toPublicUser(updated);
}

async function listUsers(queryParams) {
	const params = listUsersSchema.parse(queryParams || {});
	const offset = (params.page - 1) * params.limit;

	const [users, total] = await Promise.all([
		userRepository.list({ limit: params.limit, offset }),
		userRepository.count(),
	]);

	return paginatedResponse(
		users.map((user) => toPublicUser(user)),
		total,
		params.page,
		params.limit
	);
}

module.exports = {
	createUser,
	getUserById,
	updateUser,
	deactivateUser,
	listUsers,
};
