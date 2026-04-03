-- ============================================================
-- Finance DB — Infrastructure Bootstrap SQL
-- Mirrors packages/database/migrations/001_init.sql
-- Run automatically by Docker on first start
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── Users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name          VARCHAR(255),
    email         VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT         NOT NULL,
    role          VARCHAR(20)  NOT NULL DEFAULT 'viewer'
                               CHECK (role IN ('admin', 'analyst', 'viewer')),
    status        VARCHAR(20)  NOT NULL DEFAULT 'active'
                               CHECK (status IN ('active', 'inactive')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email  ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role   ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_status ON users (status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC, id DESC);

-- ─── Transactions ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id               UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type             VARCHAR(20)   NOT NULL CHECK (type IN ('income', 'expense')),
    amount           NUMERIC(15,2) NOT NULL CHECK (amount > 0),
    category         VARCHAR(100)  NOT NULL,
    note             TEXT,
    timestamp        TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    idempotency_key  VARCHAR(255)  UNIQUE,
    created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id    ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_category   ON transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp  ON transactions (timestamp DESC);

-- ─── Auto-update trigger ──────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE 'plpgsql';

DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_transactions_updated_at ON transactions;
CREATE TRIGGER update_transactions_updated_at
    BEFORE UPDATE ON transactions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ─── Phase 10: Shard Overrides ─────────────────────────────
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

-- ─── Phase 10: Reconciliation Metadata ─────────────────────
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
