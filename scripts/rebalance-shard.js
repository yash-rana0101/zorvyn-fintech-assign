'use strict';

require('dotenv').config();

const { query } = require('../apps/api/src/config/db');
const { setUserShardOverride } = require('../packages/database/shardRouter');

async function main() {
  const [, , userId, shardIdRaw, reason = 'manual-rebalance'] = process.argv;

  if (!userId || !shardIdRaw) {
    throw new Error('Usage: node scripts/rebalance-shard.js <user_id> <shard_id> [reason]');
  }

  const shardId = Number.parseInt(shardIdRaw, 10);
  if (!Number.isFinite(shardId) || shardId < 0) {
    throw new Error('shard_id must be a non-negative integer');
  }

  await query(
    `INSERT INTO shard_user_overrides (user_id, shard_id, reason, updated_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT (user_id)
     DO UPDATE SET
       shard_id = EXCLUDED.shard_id,
       reason = EXCLUDED.reason,
       updated_by = EXCLUDED.updated_by,
       updated_at = NOW()`,
    [userId, shardId, reason, 'rebalance-script']
  );

  await setUserShardOverride(userId, shardId, {
    ttlSeconds: Number.parseInt(process.env.SHARD_OVERRIDE_TTL_SECONDS || '604800', 10),
  });

  process.stdout.write(`Rebalanced user ${userId} to shard ${shardId}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});
