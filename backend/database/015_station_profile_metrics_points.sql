ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS likes_count INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_user_profiles_likes_count'
  ) THEN
    ALTER TABLE user_profiles
      ADD CONSTRAINT chk_user_profiles_likes_count
      CHECK (likes_count >= 0);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS miao_point_ledger (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  balance_after INTEGER CHECK (balance_after IS NULL OR balance_after >= 0),
  title VARCHAR(120) NOT NULL,
  description VARCHAR(300) NOT NULL DEFAULT '',
  event_type VARCHAR(80) NOT NULL,
  source_type VARCHAR(80) NOT NULL DEFAULT '',
  source_id VARCHAR(120),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_miao_point_ledger_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

UPDATE miao_point_ledger
SET source_type = ''
WHERE source_type IS NULL;

ALTER TABLE miao_point_ledger
  ALTER COLUMN source_type SET DEFAULT '',
  ALTER COLUMN source_type SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_miao_point_ledger_user_created
  ON miao_point_ledger (user_id, created_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_miao_point_ledger_source
  ON miao_point_ledger (user_id, event_type, source_type, source_id)
  WHERE source_id IS NOT NULL;
