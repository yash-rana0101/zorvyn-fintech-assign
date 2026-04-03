-- Phase 6 indexing targets
-- Keep these indexes in sync with production migrations.

CREATE INDEX IF NOT EXISTS idx_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_timestamp ON transactions("timestamp");
CREATE INDEX IF NOT EXISTS idx_category ON transactions(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency ON transactions(idempotency_key);
