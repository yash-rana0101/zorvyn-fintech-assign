'use strict';

const { createHash } = require('crypto');
const { cacheManager } = require('../cache/cacheManager');
const logger = require('../logger/logger');

const SHARD_OVERRIDE_PREFIX = 'shard:override:';
const DEFAULT_OVERRIDE_TTL_SECONDS = 365 * 24 * 60 * 60;

function parseBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseInteger(value, fallback, min = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }

  return parsed;
}

function parseJsonObject(value, fallback) {
  if (!value) {
    return fallback;
  }

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value !== 'string') {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    logger.warn('Invalid shard router JSON config detected', {
      value,
    });
  }

  return fallback;
}

function normalizeVirtualMap(map) {
  const normalized = new Map();

  for (const [virtualShardId, physicalShardId] of Object.entries(map || {})) {
    const virtualParsed = Number.parseInt(virtualShardId, 10);
    const physicalParsed = Number.parseInt(physicalShardId, 10);

    if (!Number.isFinite(virtualParsed) || virtualParsed < 0) {
      continue;
    }

    if (!Number.isFinite(physicalParsed) || physicalParsed < 0) {
      continue;
    }

    normalized.set(virtualParsed, physicalParsed);
  }

  return normalized;
}

function loadRoutingConfig() {
  const enabled = parseBoolean(process.env.SHARD_ROUTING_ENABLED, false);
  const physicalShardCount = parseInteger(process.env.SHARD_COUNT, 1, 1);
  const virtualShardCount = parseInteger(process.env.VIRTUAL_SHARD_COUNT, 64, 1);
  const regionMap = parseJsonObject(process.env.SHARD_REGION_MAP, {});
  const connectionMap = parseJsonObject(process.env.SHARD_CONNECTIONS_JSON, {});
  const virtualMapConfig = parseJsonObject(process.env.VIRTUAL_SHARD_MAP, {});

  return {
    enabled,
    physicalShardCount,
    virtualShardCount,
    defaultRegion: process.env.HOME_REGION || 'primary',
    regionMap,
    connectionMap,
    virtualMap: normalizeVirtualMap(virtualMapConfig),
  };
}

function hashToUInt32(value) {
  const digest = createHash('sha256').update(String(value)).digest('hex');
  return Number.parseInt(digest.slice(0, 8), 16) >>> 0;
}

function toShardId(virtualShardId, config) {
  if (config.virtualMap.has(virtualShardId)) {
    return config.virtualMap.get(virtualShardId);
  }

  return virtualShardId % config.physicalShardCount;
}

function normalizeShardId(shardId, config) {
  const parsed = Number.parseInt(shardId, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }

  return parsed % config.physicalShardCount;
}

function getRegionForShard(shardId, config) {
  const value = config.regionMap[String(shardId)] || config.regionMap[Number(shardId)];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }

  return config.defaultRegion;
}

async function getUserShardOverride(userId, config) {
  if (!config.enabled || !userId) {
    return null;
  }

  try {
    const value = await cacheManager.get(`${SHARD_OVERRIDE_PREFIX}${userId}`);
    if (!value) {
      return null;
    }

    return normalizeShardId(value, config);
  } catch (error) {
    logger.warn('Shard override lookup failed', {
      user_id: userId,
      error: error.message,
    });
    return null;
  }
}

async function resolveShardForUser(userId) {
  const config = loadRoutingConfig();

  if (!config.enabled || !userId) {
    return {
      shard_id: 0,
      virtual_shard_id: 0,
      region: getRegionForShard(0, config),
      source: config.enabled ? 'default' : 'disabled',
    };
  }

  const override = await getUserShardOverride(userId, config);
  if (override !== null) {
    return {
      shard_id: override,
      virtual_shard_id: override,
      region: getRegionForShard(override, config),
      source: 'override',
    };
  }

  const hash = hashToUInt32(userId);
  const virtualShardId = hash % config.virtualShardCount;
  const shardId = normalizeShardId(toShardId(virtualShardId, config), config);

  return {
    shard_id: shardId,
    virtual_shard_id: virtualShardId,
    region: getRegionForShard(shardId, config),
    source: 'hash',
  };
}

function getConnectionOverride(shardId) {
  const config = loadRoutingConfig();
  if (!config.enabled) {
    return null;
  }

  const value = config.connectionMap[String(shardId)] || config.connectionMap[Number(shardId)];
  return value && typeof value === 'object' ? value : null;
}

function describeRouting() {
  const config = loadRoutingConfig();

  return {
    enabled: config.enabled,
    physical_shards: config.physicalShardCount,
    virtual_shards: config.virtualShardCount,
    default_region: config.defaultRegion,
  };
}

async function setUserShardOverride(userId, shardId, options = {}) {
  const config = loadRoutingConfig();
  if (!config.enabled) {
    return false;
  }

  const normalizedShardId = normalizeShardId(shardId, config);
  const ttlSeconds = parseInteger(
    options.ttlSeconds,
    DEFAULT_OVERRIDE_TTL_SECONDS,
    1
  );

  const success = await cacheManager.set(
    `${SHARD_OVERRIDE_PREFIX}${userId}`,
    String(normalizedShardId),
    ttlSeconds
  );

  if (success) {
    logger.info('Shard override updated', {
      user_id: userId,
      shard_id: normalizedShardId,
      ttl_seconds: ttlSeconds,
    });
  }

  return success;
}

async function clearUserShardOverride(userId) {
  const removed = await cacheManager.del(`${SHARD_OVERRIDE_PREFIX}${userId}`);

  if (removed) {
    logger.info('Shard override removed', {
      user_id: userId,
    });
  }

  return removed;
}

module.exports = {
  SHARD_OVERRIDE_PREFIX,
  clearUserShardOverride,
  describeRouting,
  getConnectionOverride,
  resolveShardForUser,
  setUserShardOverride,
};