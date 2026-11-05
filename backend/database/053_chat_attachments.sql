-- Chat attachments are account-owned and copied into message metadata only after
-- the message service verifies ownership and the destination conversation.
CREATE TABLE IF NOT EXISTS chat_attachments (
  id UUID PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id CHAR(36) NOT NULL REFERENCES chat_threads(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  request_hash CHAR(64) NOT NULL,
  kind VARCHAR(20) NOT NULL CHECK (kind IN ('image','audio','file','location','contact','task')),
  filename VARCHAR(180) NOT NULL,
  title VARCHAR(200) NOT NULL,
  mime_type VARCHAR(100),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 0 AND 8388608),
  duration_ms INTEGER CHECK (duration_ms BETWEEN 1 AND 61000),
  checksum_sha256 CHAR(64),
  content BYTEA,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, idempotency_key),
  CHECK ((content IS NULL AND byte_size = 0 AND kind IN ('location','contact','task')) OR
    (content IS NOT NULL AND octet_length(content) = byte_size AND kind IN ('image','audio','file')))
);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_user_created ON chat_attachments(user_id, created_at);
