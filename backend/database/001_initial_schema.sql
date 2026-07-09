CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE SEQUENCE IF NOT EXISTS users_ai_id_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 999999
  NO CYCLE;

CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  login_name VARCHAR(80) UNIQUE,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone_number VARCHAR(32) UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  ai_id VARCHAR(40) NOT NULL UNIQUE,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  admin_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_login_name ON users (login_name);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_users_display_name_lower ON users (lower(display_name));
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);
CREATE INDEX IF NOT EXISTS idx_users_last_login_at ON users (last_login_at);

DROP TRIGGER IF EXISTS trg_users_touch_updated_at ON users;
CREATE TRIGGER trg_users_touch_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id CHAR(36) PRIMARY KEY,
  nickname VARCHAR(80) NOT NULL,
  avatar_text VARCHAR(8) NOT NULL,
  bio TEXT,
  community VARCHAR(120),
  activity_area VARCHAR(120),
  miao_points INTEGER NOT NULL DEFAULT 0 CHECK (miao_points >= 0),
  following_count INTEGER NOT NULL DEFAULT 0 CHECK (following_count >= 0),
  followers_count INTEGER NOT NULL DEFAULT 0 CHECK (followers_count >= 0),
  collections_count INTEGER NOT NULL DEFAULT 0 CHECK (collections_count >= 0),
  avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  station_config JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

DROP TRIGGER IF EXISTS trg_user_profiles_touch_updated_at ON user_profiles;
CREATE TRIGGER trg_user_profiles_touch_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS auth_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON auth_sessions (expires_at);

CREATE TABLE IF NOT EXISTS user_agents (
  id BIGSERIAL PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  agent_id VARCHAR(80) NOT NULL,
  alias VARCHAR(80),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  granted_scopes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_user_agent UNIQUE (user_id, agent_id),
  CONSTRAINT fk_user_agents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_agents_agent ON user_agents (agent_id);

DROP TRIGGER IF EXISTS trg_user_agents_touch_updated_at ON user_agents;
CREATE TRIGGER trg_user_agents_touch_updated_at
BEFORE UPDATE ON user_agents
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS chat_threads (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(120) NOT NULL,
  status_text VARCHAR(120) NOT NULL DEFAULT '',
  avatar_text VARCHAR(8) NOT NULL DEFAULT '妙',
  agent_id VARCHAR(80),
  kind VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'agent', 'system')),
  pinned BOOLEAN NOT NULL DEFAULT FALSE,
  unread_count INTEGER NOT NULL DEFAULT 0 CHECK (unread_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_threads_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_threads_user_updated ON chat_threads (user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_threads_agent ON chat_threads (agent_id);

DROP TRIGGER IF EXISTS trg_chat_threads_touch_updated_at ON chat_threads;
CREATE TRIGGER trg_chat_threads_touch_updated_at
BEFORE UPDATE ON chat_threads
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS chat_messages (
  id CHAR(36) PRIMARY KEY,
  thread_id CHAR(36) NOT NULL,
  user_id CHAR(36),
  sender_type VARCHAR(20) NOT NULL CHECK (sender_type IN ('user', 'agent', 'system')),
  sender_name VARCHAR(80) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_messages_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_thread_created ON chat_messages (thread_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON chat_messages (user_id, created_at);

CREATE TABLE IF NOT EXISTS usage_events (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36),
  event_type VARCHAR(80) NOT NULL,
  target_type VARCHAR(80),
  target_id VARCHAR(120),
  payload JSONB,
  ip_hash VARCHAR(64),
  user_agent VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_events_user_created ON usage_events (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_type_created ON usage_events (event_type, created_at);

CREATE TABLE IF NOT EXISTS agent_runs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36),
  agent_id VARCHAR(80) NOT NULL,
  thread_id CHAR(36),
  input_message_id CHAR(36),
  output_message_id CHAR(36),
  status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error')),
  provider VARCHAR(60) NOT NULL DEFAULT 'local',
  latency_ms INTEGER CHECK (latency_ms IS NULL OR latency_ms >= 0),
  token_prompt INTEGER CHECK (token_prompt IS NULL OR token_prompt >= 0),
  token_completion INTEGER CHECK (token_completion IS NULL OR token_completion >= 0),
  token_total INTEGER CHECK (token_total IS NULL OR token_total >= 0),
  cost_cents DECIMAL(10, 4),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  CONSTRAINT fk_runs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_input_message FOREIGN KEY (input_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_output_message FOREIGN KEY (output_message_id) REFERENCES chat_messages(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_runs_user_created ON agent_runs (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_runs_agent_created ON agent_runs (agent_id, created_at);
