-- ============================================================
-- Finance DB — Phase 3 transaction schema alignment
-- Migration: 003_phase3_transactions_schema.sql
-- ============================================================

-- Add API-facing note field while preserving legacy description data.
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS note TEXT;

UPDATE transactions
SET note = description
WHERE note IS NULL
  AND description IS NOT NULL;

-- Add explicit business timestamp column required by Phase 3.
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS "timestamp" TIMESTAMPTZ;

UPDATE transactions
SET "timestamp" = created_at
WHERE "timestamp" IS NULL;

ALTER TABLE transactions
ALTER COLUMN "timestamp" SET DEFAULT NOW();

ALTER TABLE transactions
ALTER COLUMN "timestamp" SET NOT NULL;

-- Required index for filtered date range reads.
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp
ON transactions ("timestamp" DESC);
