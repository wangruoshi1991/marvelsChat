ALTER TABLE users
  ADD COLUMN IF NOT EXISTS presence_mode VARCHAR(20) NOT NULL DEFAULT 'online'
  CHECK (presence_mode IN ('online', 'offline', 'hidden'));

CREATE INDEX IF NOT EXISTS idx_users_presence_mode ON users (presence_mode);
