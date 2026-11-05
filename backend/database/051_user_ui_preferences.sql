CREATE TABLE IF NOT EXISTS user_ui_preferences (
  user_id CHAR(36) PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  version SMALLINT NOT NULL CHECK (version = 1),
  revision INTEGER NOT NULL CHECK (revision > 0),
  preferences JSONB NOT NULL CHECK (
    jsonb_typeof(preferences) = 'object'
    AND preferences -> 'version' = to_jsonb(version)
    AND jsonb_typeof(preferences -> 'global') = 'object'
  ),
  source VARCHAR(32) NOT NULL CHECK (source IN ('user_confirmed', 'ai_confirmed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
