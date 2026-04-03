-- ============================================================
-- Finance DB — Add optional name field to users
-- Migration: 002_add_users_name.sql
-- ============================================================

ALTER TABLE users
ADD COLUMN IF NOT EXISTS name VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_users_name ON users (name);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users (created_at DESC, id DESC);