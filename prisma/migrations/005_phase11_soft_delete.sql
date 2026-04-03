-- ============================================================
-- Finance DB — Phase 11 soft delete support for transactions
-- Migration: 005_phase11_soft_delete.sql
-- ============================================================

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_transactions_deleted_at
ON transactions (deleted_at);

CREATE INDEX IF NOT EXISTS idx_transactions_active_timestamp
ON transactions ("timestamp" DESC)
WHERE deleted_at IS NULL;
