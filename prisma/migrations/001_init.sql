-- ============================================================
-- Finance DB — Initial Schema
-- Migration: 001_init.sql
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─────────────────────────────────────────────────────────────
-- Users Table
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- ─────────────────────────────────────────────────────────────
-- Transactions Table (Phase 3+)
-- Sharded by user_id for horizontal scalability
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
    id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id          UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type             VARCHAR(20) NOT NULL CHECK (type IN ('income', 'expense')),
    amount           NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    category         VARCHAR(100) NOT NULL,
    description      TEXT,
    idempotency_key  VARCHAR(255) UNIQUE,      -- Phase 10: prevent duplicates
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_id    ON transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_type       ON transactions (type);
CREATE INDEX IF NOT EXISTS idx_transactions_category   ON transactions (category);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- Auto-update updated_at trigger
-- ─────────────────────────────────────────────────────────────
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

-- ─────────────────────────────────────────────────────────────
-- Seed: default admin user (password: Admin@123)
-- Hash generated with bcrypt rounds=12
-- ─────────────────────────────────────────────────────────────
-- INSERT INTO users (id, email, password_hash, role, status)
-- VALUES (
--   uuid_generate_v4(),
--   'admin@finance.com',
--   '$2a$12$...',    -- Replace with actual bcrypt hash
--   'admin',
--   'active'
-- ) ON CONFLICT (email) DO NOTHING;
