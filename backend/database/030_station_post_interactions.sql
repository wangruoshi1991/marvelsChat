CREATE TABLE IF NOT EXISTS station_post_interactions (
  post_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  interaction_type VARCHAR(20) NOT NULL CHECK (interaction_type IN ('like', 'favorite')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, user_id, interaction_type),
  FOREIGN KEY (post_id) REFERENCES station_posts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_station_post_interactions_user ON station_post_interactions (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_station_post_interactions_post_type ON station_post_interactions (post_id, interaction_type);
UPDATE station_posts p
SET like_count = COALESCE((SELECT COUNT(*)::integer FROM station_post_interactions i WHERE i.post_id = p.id AND i.interaction_type = 'like'), 0),
    favorite_count = COALESCE((SELECT COUNT(*)::integer FROM station_post_interactions i WHERE i.post_id = p.id AND i.interaction_type = 'favorite'), 0);
