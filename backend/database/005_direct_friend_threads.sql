ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS peer_user_id CHAR(36);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_threads_peer_user'
  ) THEN
    ALTER TABLE chat_threads
      ADD CONSTRAINT fk_threads_peer_user
      FOREIGN KEY (peer_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_threads_peer_user ON chat_threads (peer_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_threads_direct_peer
  ON chat_threads (user_id, peer_user_id)
  WHERE peer_user_id IS NOT NULL;
