CREATE TABLE IF NOT EXISTS ui_preference_previews (
  id UUID PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  input_message_id CHAR(36) REFERENCES chat_messages(id) ON DELETE CASCADE,
  base_revision BIGINT NOT NULL CHECK (base_revision >= 0),
  patch JSONB NOT NULL CHECK (jsonb_typeof(patch) = 'object'),
  preview JSONB NOT NULL CHECK (jsonb_typeof(preview) = 'object'),
  status VARCHAR(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'expired', 'reset')),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  before_preferences JSONB CHECK (before_preferences IS NULL OR jsonb_typeof(before_preferences) = 'object'),
  confirmed_revision BIGINT CHECK (confirmed_revision IS NULL OR confirmed_revision >= 0),
  undone_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ui_preference_preview_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ui_preference_previews_user_status
  ON ui_preference_previews (user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ui_preference_previews_expiry
  ON ui_preference_previews (expires_at) WHERE status = 'pending';

CREATE UNIQUE INDEX IF NOT EXISTS idx_ui_preference_previews_input_message
  ON ui_preference_previews (input_message_id) WHERE input_message_id IS NOT NULL;

ALTER TABLE ui_preference_previews
  ADD COLUMN IF NOT EXISTS before_preferences JSONB
    CHECK (before_preferences IS NULL OR jsonb_typeof(before_preferences) = 'object');
ALTER TABLE ui_preference_previews
  ADD COLUMN IF NOT EXISTS confirmed_revision BIGINT
    CHECK (confirmed_revision IS NULL OR confirmed_revision >= 0);
ALTER TABLE ui_preference_previews
  ADD COLUMN IF NOT EXISTS undone_at TIMESTAMPTZ;
