ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS avatar_config JSONB NOT NULL DEFAULT '{}'::jsonb;
