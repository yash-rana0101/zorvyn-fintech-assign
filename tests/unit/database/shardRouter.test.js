'use strict';

jest.mock('../../../packages/cache/cacheManager', () => ({
  cacheManager: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
  },
}));

jest.mock('../../../packages/logger/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

const { cacheManager } = require('../../../packages/cache/cacheManager');
const {
  clearUserShardOverride,
  resolveShardForUser,
  setUserShardOverride,
} = require('../../../packages/database/shardRouter');

describe('shardRouter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SHARD_ROUTING_ENABLED = 'true';
    process.env.SHARD_COUNT = '4';
    process.env.VIRTUAL_SHARD_COUNT = '64';
    process.env.SHARD_CONNECTIONS_JSON = '{}';
    process.env.VIRTUAL_SHARD_MAP = '{}';
  });

  it('returns deterministic shard for same user', async () => {
    cacheManager.get.mockResolvedValue(null);

    const first = await resolveShardForUser('550e8400-e29b-41d4-a716-446655440010');
    const second = await resolveShardForUser('550e8400-e29b-41d4-a716-446655440010');

    expect(first.shard_id).toBe(second.shard_id);
    expect(first.virtual_shard_id).toBe(second.virtual_shard_id);
    expect(first.source).toBe('hash');
  });

  it('uses user override when present', async () => {
    cacheManager.get.mockResolvedValueOnce('3');

    const resolved = await resolveShardForUser('550e8400-e29b-41d4-a716-446655440011');

    expect(resolved.shard_id).toBe(3);
    expect(resolved.source).toBe('override');
  });

  it('stores and clears user overrides', async () => {
    cacheManager.set.mockResolvedValueOnce(true);
    cacheManager.del.mockResolvedValueOnce(true);

    const setResult = await setUserShardOverride(
      '550e8400-e29b-41d4-a716-446655440012',
      2,
      { ttlSeconds: 60 }
    );

    const clearResult = await clearUserShardOverride(
      '550e8400-e29b-41d4-a716-446655440012'
    );

    expect(setResult).toBe(true);
    expect(clearResult).toBe(true);
  });

  it('falls back to default shard when routing disabled', async () => {
    process.env.SHARD_ROUTING_ENABLED = 'false';

    const resolved = await resolveShardForUser('550e8400-e29b-41d4-a716-446655440013');

    expect(resolved.shard_id).toBe(0);
    expect(resolved.source).toBe('disabled');
  });
});
