CREATE TABLE IF NOT EXISTS chat_groups (
  id CHAR(36) PRIMARY KEY,
  creator_user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  title VARCHAR(80) NOT NULL CHECK (length(trim(title)) > 0),
  idempotency_key UUID NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (creator_user_id, idempotency_key)
);

ALTER TABLE chat_threads ADD COLUMN IF NOT EXISTS group_id CHAR(36) REFERENCES chat_groups(id) ON DELETE CASCADE;
ALTER TABLE chat_threads DROP CONSTRAINT IF EXISTS chat_threads_kind_check;
ALTER TABLE chat_threads ADD CONSTRAINT chat_threads_kind_check CHECK (kind IN ('direct', 'agent', 'system', 'group'));
CREATE UNIQUE INDEX IF NOT EXISTS uniq_threads_user_group ON chat_threads(user_id, group_id) WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_group_members (
  group_id CHAR(36) NOT NULL REFERENCES chat_groups(id) ON DELETE CASCADE,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMPTZ,
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_group_members_user ON chat_group_members(user_id, group_id);
