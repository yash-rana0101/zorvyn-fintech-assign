'use strict';

const { v4: uuidv4 } = require('uuid');
const financeRepository = require('./finance.repository');
const userRepository = require('../user/user.repository');
const {
	createTransactionSchema,
	listTransactionsSchema,
	updateTransactionSchema,
} = require('./finance.validator');
const { cacheManager } = require('../../shared/cache/cacheManager');
const { getClient, getClientForUser } = require('../../config/db');
const { eventBus } = require('../../../../../packages/event-bus/eventBus');
const { TOPICS } = require('../../../../../packages/event-bus/topics');
const logger = require('../../../../../packages/logger/logger');
const {
	CACHE_TTL,
	HTTP_STATUS,
	ROLES,
	USER_STATUS,
} = require('../../../../../packages/utils/constants');
const {
	getPagination,
	paginatedResponse,
} = require('../../../../../packages/utils/helpers');

const TRANSACTIONS_CACHE_MIN_TTL = 10;
const TRANSACTIONS_CACHE_MAX_TTL = 30;
const USER_CACHE_MIN_TTL = 300;
const USER_CACHE_MAX_TTL = 600;

function clampTtl(configured, min, max, fallback) {
	const parsed = Number.parseInt(configured, 10);

	if (Number.isFinite(parsed)) {
		return Math.min(max, Math.max(min, parsed));
	}

	return fallback;
}

const TRANSACTIONS_CACHE_TTL_SECONDS = clampTtl(
	process.env.TRANSACTIONS_CACHE_TTL,
	TRANSACTIONS_CACHE_MIN_TTL,
	TRANSACTIONS_CACHE_MAX_TTL,
	20
);

const USER_DATA_CACHE_TTL_SECONDS = clampTtl(
	process.env.USER_CACHE_TTL || `${CACHE_TTL.RBAC_ROLE}`,
	USER_CACHE_MIN_TTL,
	USER_CACHE_MAX_TTL,
	CACHE_TTL.RBAC_ROLE
);

const CACHE_VERSION_TTL_SECONDS = 60 * 60;

function userCacheKey(userId) {
	return `user:${userId}`;
}

function transactionListVersionKey(scope) {
	return `transactions:version:${scope}`;
}

function toCacheDateValue(value) {
	if (!value) {
		return null;
	}

	if (value instanceof Date) {
		return value.toISOString();
	}

	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return String(value);
	}

	return parsed.toISOString();
}

function serializeTransactionFilters(filters) {
	return {
		user_id: filters.user_id || null,
		type: filters.type || null,
		category: filters.category || null,
		start_date: toCacheDateValue(filters.start_date),
		end_date: toCacheDateValue(filters.end_date),
	};
}

async function getTransactionListVersion(scope) {
	const rawVersion = await cacheManager.getRaw(transactionListVersionKey(scope));
	const parsed = Number.parseInt(rawVersion, 10);

	if (Number.isFinite(parsed) && parsed > 0) {
		return parsed;
	}

	return 1;
}

async function bumpTransactionListVersion(scope) {
	if (!scope) {
		return;
	}

	await cacheManager.increment(transactionListVersionKey(scope), CACHE_VERSION_TTL_SECONDS);
}

async function invalidateTransactionListCache(userId) {
	await Promise.all([
		bumpTransactionListVersion('all'),
		bumpTransactionListVersion(userId),
	]);
}

async function buildTransactionListCacheKey(actor, filters, pagination) {
	const scope = filters.user_id || 'all';
	const version = await getTransactionListVersion(scope);

	return `transactions:list:v${version}:${scope}:${actor.role}:` +
		JSON.stringify({
			filters: serializeTransactionFilters(filters),
			page: pagination.page,
			limit: pagination.limit,
		});
}

function buildError(message, statusCode) {
	const err = new Error(message);
	err.statusCode = statusCode;
	return err;
}

function toPublicTransaction(transaction) {
	if (!transaction || typeof transaction !== 'object') {
		return null;
	}

	return {
		id: transaction.id,
		user_id: transaction.user_id,
		amount:
			typeof transaction.amount === 'string'
				? Number(transaction.amount)
				: transaction.amount,
		type: transaction.type,
		category: transaction.category,
		note: transaction.note ?? null,
		timestamp: transaction.timestamp,
		created_at: transaction.created_at,
		updated_at: transaction.updated_at,
	};
}

function toEventTimestamp(value) {
	const parsed = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return new Date().toISOString();
	}

	return parsed.toISOString();
}

async function assertUserExists(userId) {
	const cached = await cacheManager.get(userCacheKey(userId));
	if (cached && typeof cached === 'object' && cached.id) {
		return cached;
	}

	const user = await userRepository.findById(userId);
	if (!user) {
		throw buildError('User not found', HTTP_STATUS.NOT_FOUND);
	}

	await cacheManager.set(
		userCacheKey(user.id),
		{
			id: user.id,
			role: user.role,
			status: user.status,
		},
		USER_DATA_CACHE_TTL_SECONDS
	);

	return user;
}

async function assertActiveUser(userId) {
	const user = await assertUserExists(userId);
	if (user.status !== USER_STATUS.ACTIVE) {
		throw buildError('Inactive users cannot perform this action', HTTP_STATUS.FORBIDDEN);
	}

	return user;
}

function publishEvent(topic, payload) {
	try {
		eventBus.publish(topic, payload);
	} catch (err) {
		logger.error('Event publish failed', {
			topic,
			error: err.message,
		});
	}
}

async function createTransactionLocally(data, userId) {
	const client = typeof getClientForUser === 'function'
		? await getClientForUser(userId)
		: await getClient();
	try {
		await client.query('BEGIN');

		const result = await financeRepository.createWithIdempotency(client, {
			id: uuidv4(),
			user_id: userId,
			amount: data.amount,
			type: data.type,
			category: data.category,
			note: data.note ?? null,
			timestamp: data.timestamp || new Date(),
			idempotency_key: data.idempotency_key,
		});

		await client.query('COMMIT');

		if (!result.transaction) {
			throw buildError('Unable to process transaction', HTTP_STATUS.CONFLICT);
		}

		const transaction = toPublicTransaction(result.transaction);

		if (result.created) {
			await invalidateTransactionListCache(transaction.user_id);
		}

		if (result.created) {
			publishEvent(TOPICS.TRANSACTION_CREATED, {
				transaction_id: transaction.id,
				user_id: transaction.user_id,
				amount: transaction.amount,
				type: transaction.type,
				category: transaction.category,
				timestamp: toEventTimestamp(transaction.timestamp),
			});
		}

		return {
			created: result.created,
			transaction,
		};
	} catch (err) {
		try {
			await client.query('ROLLBACK');
		} catch (rollbackErr) {
			logger.warn('Finance transaction rollback failed', {
				error: rollbackErr.message,
			});
		}

		if (err.code === '23505') {
			const existing = await financeRepository.findByIdempotencyKey(data.idempotency_key);
			if (existing) {
				return {
					created: false,
					transaction: toPublicTransaction(existing),
				};
			}
		}

		throw err;
	} finally {
		client.release();
	}
}

async function createTransaction(input, userId) {
	const data = createTransactionSchema.parse(input || {});
	await assertActiveUser(userId);

	return createTransactionLocally(data, userId);
}

async function getTransactions(queryParams, actor) {
	const params = listTransactionsSchema.parse(queryParams || {});
	await assertActiveUser(actor.user_id);

	const filters = {};

	if (params.type) filters.type = params.type;
	if (params.category) filters.category = params.category;
	if (params.start_date) filters.start_date = params.start_date;
	if (params.end_date) filters.end_date = params.end_date;

	if (actor.role === ROLES.VIEWER) {
		filters.user_id = actor.user_id;
	} else if (params.user_id) {
		await assertUserExists(params.user_id);
		filters.user_id = params.user_id;
	}

	const pagination = getPagination(params.page, params.limit);
	const cacheKey = await buildTransactionListCacheKey(actor, filters, pagination);

	const computeTransactionList = async () => {
		const [transactions, total] = await Promise.all([
			financeRepository.list(filters, {
				limit: pagination.limit,
				offset: pagination.offset,
			}),
			financeRepository.count(filters),
		]);

		return paginatedResponse(
			transactions.map((transaction) => toPublicTransaction(transaction)),
			total,
			pagination.page,
			pagination.limit
		);
	};

	if (typeof cacheManager.getOrCompute === 'function') {
		return cacheManager.getOrCompute(cacheKey, computeTransactionList, {
			ttlSeconds: TRANSACTIONS_CACHE_TTL_SECONDS,
			lockTtlSeconds: 3,
			waitTimeoutMs: 1200,
			staleTtlSeconds: Math.max(60, TRANSACTIONS_CACHE_TTL_SECONDS * 3),
		});
	}

	const cachedResult = await cacheManager.get(cacheKey);

	if (cachedResult && typeof cachedResult === 'object' && Array.isArray(cachedResult.data)) {
		return cachedResult;
	}

	const response = await computeTransactionList();
	await cacheManager.set(cacheKey, response, TRANSACTIONS_CACHE_TTL_SECONDS);
	return response;
}

async function updateTransaction(transactionId, input, actorUserId) {
	await assertActiveUser(actorUserId);

	const updates = updateTransactionSchema.parse(input || {});
	const existing = await financeRepository.findById(transactionId);

	if (!existing) {
		throw buildError('Transaction not found', HTTP_STATUS.NOT_FOUND);
	}

	const updated = await financeRepository.update(transactionId, {
		amount: updates.amount,
		type: updates.type,
		category: updates.category,
		note: updates.note,
		timestamp: updates.timestamp,
	});

	if (!updated) {
		throw buildError('Transaction not found', HTTP_STATUS.NOT_FOUND);
	}

	const transaction = toPublicTransaction(updated);
	await invalidateTransactionListCache(transaction.user_id);

	publishEvent(TOPICS.TRANSACTION_UPDATED, {
		transaction_id: transaction.id,
		user_id: transaction.user_id,
		amount: transaction.amount,
		type: transaction.type,
		category: transaction.category,
		timestamp: toEventTimestamp(transaction.timestamp),
	});

	return transaction;
}

async function deleteTransaction(transactionId, actorUserId) {
	await assertActiveUser(actorUserId);

	const deleted = await financeRepository.deleteById(transactionId);

	if (!deleted) {
		throw buildError('Transaction not found', HTTP_STATUS.NOT_FOUND);
	}

	const transaction = toPublicTransaction(deleted);
	await invalidateTransactionListCache(transaction.user_id);

	publishEvent(TOPICS.TRANSACTION_DELETED, {
		transaction_id: transaction.id,
		user_id: transaction.user_id,
		amount: transaction.amount,
		type: transaction.type,
		category: transaction.category,
		timestamp: toEventTimestamp(transaction.timestamp),
	});

	return transaction;
}

module.exports = {
	createTransaction,
	getTransactions,
	updateTransaction,
	deleteTransaction,
};
