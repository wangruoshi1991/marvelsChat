ALTER TABLE avatar_3d_jobs
  ADD COLUMN IF NOT EXISTS claim_token CHAR(36),
  ADD COLUMN IF NOT EXISTS claim_lease_until TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_jobs_claim_token
  ON avatar_3d_jobs (claim_token)
  WHERE claim_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_claim_lease
  ON avatar_3d_jobs (claim_lease_until, updated_at)
  WHERE deleted_at IS NULL;

CREATE TABLE avatar_3d_private_asset_cleanup_retries (
  asset_kind VARCHAR(24) NOT NULL CHECK (asset_kind IN ('photo_source', 'photo_normalized', 'reference_image')),
  asset_id CHAR(36) NOT NULL,
  storage_key VARCHAR(512) NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts > 0),
  retry_at TIMESTAMPTZ NOT NULL,
  error_code VARCHAR(80) NOT NULL,
  PRIMARY KEY (asset_kind, asset_id, storage_key)
);
