-- Operator-uploaded brand images are immutable, normalized assets. They are
-- private to administrators until referenced by a published release/product.
CREATE TABLE IF NOT EXISTS agent_avatar_assets (
  id CHAR(36) PRIMARY KEY,
  sha256 CHAR(64) NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  input_sha256 CHAR(64) NOT NULL CHECK (input_sha256 ~ '^[a-f0-9]{64}$'),
  mime_type VARCHAR(40) NOT NULL CHECK (mime_type = 'image/webp'),
  width INTEGER NOT NULL CHECK (width = 512),
  height INTEGER NOT NULL CHECK (height = 512),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2097152),
  uploaded_by CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  request_id VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_agent_avatar_upload UNIQUE (uploaded_by, request_id)
);
ALTER TABLE agent_catalog ADD COLUMN IF NOT EXISTS identity_avatar JSONB;
ALTER TABLE agent_catalog DROP CONSTRAINT IF EXISTS chk_agent_catalog_avatar;
ALTER TABLE agent_catalog ADD CONSTRAINT chk_agent_catalog_avatar
  CHECK (identity_avatar IS NULL OR jsonb_typeof(identity_avatar) = 'object');
CREATE INDEX IF NOT EXISTS idx_agent_avatar_assets_created ON agent_avatar_assets (created_at DESC);
