CREATE TABLE IF NOT EXISTS station_posts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  location_label VARCHAR(120) NOT NULL DEFAULT '',
  visibility VARCHAR(20) NOT NULL DEFAULT 'public'
    CHECK (visibility IN ('private', 'friends', 'public')),
  agent_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
  like_count INTEGER NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count INTEGER NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  favorite_count INTEGER NOT NULL DEFAULT 0 CHECK (favorite_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_posts_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE station_posts
  ADD COLUMN IF NOT EXISTS location_label VARCHAR(120) NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_station_posts_user_created
  ON station_posts (user_id, created_at DESC, id DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_posts_touch_updated_at ON station_posts;
CREATE TRIGGER trg_station_posts_touch_updated_at
BEFORE UPDATE ON station_posts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_post_media (
  post_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36) NOT NULL,
  sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 0 AND 8),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (post_id, media_asset_id),
  CONSTRAINT uniq_station_post_media_order UNIQUE (post_id, sort_order),
  CONSTRAINT fk_station_post_media_post
    FOREIGN KEY (post_id) REFERENCES station_posts(id) ON DELETE CASCADE,
  CONSTRAINT fk_station_post_media_asset
    FOREIGN KEY (media_asset_id) REFERENCES station_media_assets(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_station_post_media_asset
  ON station_post_media (media_asset_id);
