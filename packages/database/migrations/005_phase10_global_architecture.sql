-- ============================================================
-- Finance DB — Phase 10 global architecture metadata
-- Migration: 005_phase10_global_architecture.sql
-- ============================================================

-- User-level shard override mapping for controlled rebalancing.
CREATE TABLE IF NOT EXISTS shard_user_overrides (
    user_id        UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    shard_id       INTEGER     NOT NULL CHECK (shard_id >= 0),
    reason         TEXT,
    updated_by     VARCHAR(128),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shard_user_overrides_shard_id
ON shard_user_overrides (shard_id);

DROP TRIGGER IF EXISTS update_shard_user_overrides_updated_at ON shard_user_overrides;
CREATE TRIGGER update_shard_user_overrides_updated_at
    BEFORE UPDATE ON shard_user_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Reconciliation metadata for eventual consistency verification.
CREATE TABLE IF NOT EXISTS reconciliation_runs (
    id             UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    status         VARCHAR(20) NOT NULL CHECK (status IN ('success', 'failed')),
    checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    users_checked  INTEGER     NOT NULL DEFAULT 0,
    mismatches     INTEGER     NOT NULL DEFAULT 0,
    details        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_checked_at
ON reconciliation_runs (checked_at DESC);
