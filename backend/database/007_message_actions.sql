ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS client_message_id CHAR(36),
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS recalled_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_messages_client_message
  ON chat_messages (client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_thread_visible
  ON chat_messages (thread_id, deleted_at, created_at);
