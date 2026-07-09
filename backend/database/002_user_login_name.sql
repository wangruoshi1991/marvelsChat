ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_name VARCHAR(80) UNIQUE;

CREATE INDEX IF NOT EXISTS idx_users_login_name ON users (login_name);
