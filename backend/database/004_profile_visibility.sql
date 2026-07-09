CREATE TABLE IF NOT EXISTS profile_visibility (
  user_id CHAR(36) PRIMARY KEY,
  show_bio BOOLEAN NOT NULL DEFAULT TRUE,
  show_ai_id BOOLEAN NOT NULL DEFAULT TRUE,
  show_counts BOOLEAN NOT NULL DEFAULT TRUE,
  show_community BOOLEAN NOT NULL DEFAULT TRUE,
  show_activity_area BOOLEAN NOT NULL DEFAULT TRUE,
  show_collections BOOLEAN NOT NULL DEFAULT TRUE,
  show_posts BOOLEAN NOT NULL DEFAULT TRUE,
  show_album BOOLEAN NOT NULL DEFAULT TRUE,
  show_diary BOOLEAN NOT NULL DEFAULT TRUE,
  show_music BOOLEAN NOT NULL DEFAULT TRUE,
  show_files BOOLEAN NOT NULL DEFAULT FALSE,
  show_following_list BOOLEAN NOT NULL DEFAULT FALSE,
  show_followers_list BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_profile_visibility_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

ALTER TABLE profile_visibility
  ADD COLUMN IF NOT EXISTS show_following_list BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS show_followers_list BOOLEAN NOT NULL DEFAULT FALSE;

INSERT INTO profile_visibility (user_id)
SELECT user_id FROM user_profiles
ON CONFLICT (user_id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_profile_visibility_touch_updated_at ON profile_visibility;
CREATE TRIGGER trg_profile_visibility_touch_updated_at
BEFORE UPDATE ON profile_visibility
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
