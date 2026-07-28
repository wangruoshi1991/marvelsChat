CREATE TABLE IF NOT EXISTS avatar_3d_jobs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  idempotency_key_hash CHAR(64) NOT NULL,
  style VARCHAR(20) NOT NULL CHECK (style IN ('realistic', 'cartoon')),
  status VARCHAR(40) NOT NULL CHECK (status IN (
    'queued_style', 'processing_style', 'awaiting_style_confirmation',
    'queued_3d', 'submitting_3d', 'processing_3d', 'persisting',
    'succeeded', 'failed', 'cancelled', 'submission_unknown'
  )),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  photo_count INTEGER NOT NULL CHECK (photo_count >= 1 AND photo_count <= 4),
  accepted_cost_version VARCHAR(40) NOT NULL,
  estimated_cost_fen INTEGER NOT NULL CHECK (estimated_cost_fen >= 0),
  style_provider_task_id VARCHAR(160),
  model_provider_task_id VARCHAR(160),
  provider_status VARCHAR(80),
  safe_error_code VARCHAR(80),
  style_preview_id CHAR(36),
  model_id CHAR(36),
  claimed_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT uniq_avatar_3d_job_idempotency UNIQUE (user_id, idempotency_key_hash),
  CONSTRAINT fk_avatar_3d_job_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_one_active_job
  ON avatar_3d_jobs (user_id)
  WHERE status IN (
    'queued_style', 'processing_style', 'awaiting_style_confirmation',
    'queued_3d', 'submitting_3d', 'processing_3d', 'persisting'
  ) AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_user_created
  ON avatar_3d_jobs (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_runnable
  ON avatar_3d_jobs (status, claimed_at, updated_at)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_avatar_3d_jobs_touch_updated_at ON avatar_3d_jobs;
CREATE TRIGGER trg_avatar_3d_jobs_touch_updated_at
BEFORE UPDATE ON avatar_3d_jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS avatar_3d_job_photos (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  job_id CHAR(36),
  view VARCHAR(20) CHECK (view IS NULL OR view IN ('front', 'left', 'back', 'right')),
  original_filename VARCHAR(180) NOT NULL,
  source_mime_type VARCHAR(80) NOT NULL,
  source_byte_size INTEGER NOT NULL CHECK (source_byte_size >= 0),
  source_storage_key VARCHAR(512) NOT NULL,
  normalized_storage_key VARCHAR(512),
  normalized_mime_type VARCHAR(80),
  normalized_byte_size INTEGER CHECK (normalized_byte_size IS NULL OR normalized_byte_size >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  status VARCHAR(24) NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading', 'uploaded', 'ready', 'failed', 'deleted')),
  safe_error_code VARCHAR(80),
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_avatar_3d_photo_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_avatar_3d_photo_job FOREIGN KEY (job_id) REFERENCES avatar_3d_jobs(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_job_photo_view
  ON avatar_3d_job_photos (job_id, view)
  WHERE job_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avatar_3d_photos_user_created
  ON avatar_3d_job_photos (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_avatar_3d_photos_retention
  ON avatar_3d_job_photos (retention_until)
  WHERE retention_until IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_avatar_3d_photos_touch_updated_at ON avatar_3d_job_photos;
CREATE TRIGGER trg_avatar_3d_photos_touch_updated_at
BEFORE UPDATE ON avatar_3d_job_photos
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS avatar_3d_style_previews (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  job_id CHAR(36) NOT NULL UNIQUE,
  provider_task_id VARCHAR(160),
  storage_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER CHECK (width IS NULL OR width > 0),
  height INTEGER CHECK (height IS NULL OR height > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'discarded', 'deleted')),
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_avatar_3d_preview_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_avatar_3d_preview_job FOREIGN KEY (job_id) REFERENCES avatar_3d_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_previews_retention
  ON avatar_3d_style_previews (retention_until)
  WHERE retention_until IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_avatar_3d_previews_touch_updated_at ON avatar_3d_style_previews;
CREATE TRIGGER trg_avatar_3d_previews_touch_updated_at
BEFORE UPDATE ON avatar_3d_style_previews
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS avatar_3d_models (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  job_id CHAR(36) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  provider_task_id VARCHAR(160),
  glb_storage_key VARCHAR(512) NOT NULL,
  glb_mime_type VARCHAR(80) NOT NULL DEFAULT 'model/gltf-binary',
  glb_byte_size INTEGER NOT NULL CHECK (glb_byte_size >= 0),
  thumbnail_storage_key VARCHAR(512),
  thumbnail_mime_type VARCHAR(80),
  thumbnail_byte_size INTEGER CHECK (thumbnail_byte_size IS NULL OR thumbnail_byte_size >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_avatar_3d_model_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_avatar_3d_model_job FOREIGN KEY (job_id) REFERENCES avatar_3d_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_models_user_created
  ON avatar_3d_models (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_avatar_3d_models_touch_updated_at ON avatar_3d_models;
CREATE TRIGGER trg_avatar_3d_models_touch_updated_at
BEFORE UPDATE ON avatar_3d_models
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
