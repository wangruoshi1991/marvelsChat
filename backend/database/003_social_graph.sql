CREATE TABLE IF NOT EXISTS social_relationships (
  id CHAR(36) PRIMARY KEY,
  follower_user_id CHAR(36) NOT NULL,
  followed_user_id CHAR(36) NOT NULL,
  relation_type VARCHAR(20) NOT NULL DEFAULT 'follow' CHECK (relation_type IN ('follow', 'friend')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_social_relationships_follower FOREIGN KEY (follower_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_relationships_followed FOREIGN KEY (followed_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_social_relationships_self CHECK (follower_user_id <> followed_user_id),
  CONSTRAINT uniq_social_relationship UNIQUE (follower_user_id, followed_user_id, relation_type)
);

CREATE INDEX IF NOT EXISTS idx_social_relationships_follower ON social_relationships (follower_user_id, relation_type, status);
CREATE INDEX IF NOT EXISTS idx_social_relationships_followed ON social_relationships (followed_user_id, relation_type, status);

DROP TRIGGER IF EXISTS trg_social_relationships_touch_updated_at ON social_relationships;
CREATE TRIGGER trg_social_relationships_touch_updated_at
BEFORE UPDATE ON social_relationships
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS social_requests (
  id CHAR(36) PRIMARY KEY,
  requester_user_id CHAR(36) NOT NULL,
  target_user_id CHAR(36) NOT NULL,
  request_type VARCHAR(20) NOT NULL DEFAULT 'friend' CHECK (request_type IN ('friend')),
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled')),
  message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMPTZ,
  CONSTRAINT fk_social_requests_requester FOREIGN KEY (requester_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_social_requests_target FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_social_requests_self CHECK (requester_user_id <> target_user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_friend_request
ON social_requests (requester_user_id, target_user_id, request_type)
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_social_requests_target ON social_requests (target_user_id, status, created_at);

DROP TRIGGER IF EXISTS trg_social_requests_touch_updated_at ON social_requests;
CREATE TRIGGER trg_social_requests_touch_updated_at
BEFORE UPDATE ON social_requests
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS notifications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36),
  kind VARCHAR(40) NOT NULL,
  title VARCHAR(120) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  target_type VARCHAR(80),
  target_id VARCHAR(120),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_notifications_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications (user_id, read_at);

CREATE TABLE IF NOT EXISTS search_history (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  query_text VARCHAR(120) NOT NULL,
  scope VARCHAR(40) NOT NULL DEFAULT 'all',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_search_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_search_history_user_created ON search_history (user_id, created_at DESC);
