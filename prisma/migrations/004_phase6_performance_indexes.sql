-- ============================================================
-- Finance DB — Phase 6 performance indexing
-- Migration: 004_phase6_performance_indexes.sql
-- ============================================================

-- Additional indexes required for Phase 6 read/query performance.
DO $$
BEGIN
	IF to_regclass('public.idx_user_id') IS NULL THEN
		IF to_regclass('public.idx_transactions_user_id') IS NOT NULL THEN
			EXECUTE 'ALTER INDEX idx_transactions_user_id RENAME TO idx_user_id';
		ELSE
			EXECUTE 'CREATE INDEX idx_user_id ON transactions(user_id)';
		END IF;
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('public.idx_timestamp') IS NULL THEN
		IF to_regclass('public.idx_transactions_timestamp') IS NOT NULL THEN
			EXECUTE 'ALTER INDEX idx_transactions_timestamp RENAME TO idx_timestamp';
		ELSE
			EXECUTE 'CREATE INDEX idx_timestamp ON transactions("timestamp")';
		END IF;
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('public.idx_category') IS NULL THEN
		IF to_regclass('public.idx_transactions_category') IS NOT NULL THEN
			EXECUTE 'ALTER INDEX idx_transactions_category RENAME TO idx_category';
		ELSE
			EXECUTE 'CREATE INDEX idx_category ON transactions(category)';
		END IF;
	END IF;
END $$;

DO $$
BEGIN
	IF to_regclass('public.idx_idempotency') IS NULL THEN
		IF EXISTS (
			SELECT 1
			FROM pg_constraint
			WHERE conname = 'transactions_idempotency_key_key'
			  AND conrelid = 'transactions'::regclass
		) THEN
			EXECUTE 'ALTER TABLE transactions RENAME CONSTRAINT transactions_idempotency_key_key TO idx_idempotency';
		ELSE
			EXECUTE 'CREATE UNIQUE INDEX idx_idempotency ON transactions(idempotency_key)';
		END IF;
	END IF;
END $$;
