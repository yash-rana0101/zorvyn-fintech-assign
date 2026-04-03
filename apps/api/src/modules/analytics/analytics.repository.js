'use strict';

const { cacheManager } = require('../../../../../packages/cache/cacheManager');

function getSnapshotCacheKey(userId) {
  return `analytics:${userId}`;
}

async function getSnapshot(userId) {
  if (!userId) {
    return null;
  }

  return cacheManager.getJSON(getSnapshotCacheKey(userId));
}

async function setSnapshot(userId, snapshot, ttlSeconds) {
  if (!userId || !snapshot) {
    return false;
  }

  return cacheManager.set(getSnapshotCacheKey(userId), snapshot, ttlSeconds);
}

module.exports = {
  getSnapshotCacheKey,
  getSnapshot,
  setSnapshot,
};
