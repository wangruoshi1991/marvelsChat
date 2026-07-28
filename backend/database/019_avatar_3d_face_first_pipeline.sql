ALTER TABLE avatar_3d_jobs
  ADD COLUMN IF NOT EXISTS generation_mode VARCHAR(40) NOT NULL DEFAULT 'legacy_photo_3d',
  ADD COLUMN IF NOT EXISTS model_provider VARCHAR(40) NOT NULL DEFAULT 'tripo',
  ADD COLUMN IF NOT EXISTS prompt TEXT,
  ADD COLUMN IF NOT EXISTS prompt_plan JSONB,
  ADD COLUMN IF NOT EXISTS prompt_plan_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS source_photo_id CHAR(36),
  ADD COLUMN IF NOT EXISTS enhanced_photo_id CHAR(36),
  ADD COLUMN IF NOT EXISTS reference_set_id CHAR(36),
  ADD COLUMN IF NOT EXISTS current_attempt_id CHAR(36),
  ADD COLUMN IF NOT EXISTS technical_retry_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_quality_attempts INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quality_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS quality_reason_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS quality_metrics JSONB,
  ADD COLUMN IF NOT EXISTS accepted_face_comparison BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS accepted_adult_subject BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consent_version VARCHAR(40);

ALTER TABLE avatar_3d_jobs
  ALTER COLUMN max_quality_attempts SET DEFAULT 1;

ALTER TABLE avatar_3d_jobs
  DROP CONSTRAINT IF EXISTS avatar_3d_jobs_max_quality_attempts_check;

UPDATE avatar_3d_jobs
SET max_quality_attempts = 1
WHERE max_quality_attempts IS DISTINCT FROM 1;

ALTER TABLE avatar_3d_jobs
  ALTER COLUMN max_quality_attempts SET NOT NULL,
  ADD CONSTRAINT avatar_3d_jobs_max_quality_attempts_check
  CHECK (max_quality_attempts = 1);

ALTER TABLE avatar_3d_job_photos
  ADD COLUMN IF NOT EXISTS purpose VARCHAR(40) NOT NULL DEFAULT 'reference',
  ADD COLUMN IF NOT EXISTS enhanced_storage_key VARCHAR(512),
  ADD COLUMN IF NOT EXISTS quality_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS quality_metadata JSONB,
  ADD COLUMN IF NOT EXISTS enhancement_provider_task_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS enhancement_request_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS retention_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS retain_for_regeneration BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE avatar_3d_models
  ADD COLUMN IF NOT EXISTS model_provider VARCHAR(40) NOT NULL DEFAULT 'tripo',
  ADD COLUMN IF NOT EXISTS quality_status VARCHAR(40),
  ADD COLUMN IF NOT EXISTS quality_metrics JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_job_photos_id_user
  ON avatar_3d_job_photos (id, user_id);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_job_photos_job_user
  ON avatar_3d_job_photos (job_id, user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_jobs_id_user
  ON avatar_3d_jobs (id, user_id);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_source_photo
  ON avatar_3d_jobs (source_photo_id)
  WHERE source_photo_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_enhanced_photo
  ON avatar_3d_jobs (enhanced_photo_id)
  WHERE enhanced_photo_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_avatar_3d_photo_job_owner'
  ) THEN
    ALTER TABLE avatar_3d_job_photos
      ADD CONSTRAINT fk_avatar_3d_photo_job_owner
      FOREIGN KEY (job_id, user_id)
      REFERENCES avatar_3d_jobs (id, user_id) ON DELETE CASCADE;
  END IF;
END $$;

ALTER TABLE avatar_3d_job_photos
  DROP CONSTRAINT IF EXISTS avatar_3d_job_photos_status_check;

ALTER TABLE avatar_3d_job_photos
  ADD CONSTRAINT avatar_3d_job_photos_status_check
  CHECK (status IN (
    'uploading', 'uploaded', 'ready', 'failed', 'deleted',
    'quality_checking', 'enhancing', 'enhanced', 'needs_reference'
  ));

ALTER TABLE avatar_3d_jobs
  DROP CONSTRAINT IF EXISTS avatar_3d_jobs_status_check;

ALTER TABLE avatar_3d_jobs
  ADD CONSTRAINT avatar_3d_jobs_status_check
  CHECK (status IN (
    'queued_style', 'processing_style', 'awaiting_style_confirmation',
    'queued_references', 'submitting_references', 'processing_references',
    'persisting_references', 'awaiting_reference_confirmation',
    'queued_3d', 'submitting_3d', 'processing_3d', 'persisting',
    'queued_generation', 'submitting_generation', 'processing_generation',
    'persisting_assets', 'quality_checking',
    'succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown'
  ));

DROP INDEX IF EXISTS idx_avatar_3d_one_active_job;
CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_one_active_job
  ON avatar_3d_jobs (user_id)
  WHERE status IN (
    'queued_style', 'processing_style', 'awaiting_style_confirmation',
    'queued_references', 'submitting_references', 'processing_references',
    'persisting_references', 'awaiting_reference_confirmation',
    'queued_3d', 'submitting_3d', 'processing_3d', 'persisting',
    'queued_generation', 'submitting_generation', 'processing_generation',
    'persisting_assets', 'quality_checking'
  ) AND deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_avatar_3d_job_source_photo_owner'
  ) THEN
    ALTER TABLE avatar_3d_jobs
      ADD CONSTRAINT fk_avatar_3d_job_source_photo_owner
      FOREIGN KEY (source_photo_id, user_id)
      REFERENCES avatar_3d_job_photos (id, user_id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_avatar_3d_job_enhanced_photo_owner'
  ) THEN
    ALTER TABLE avatar_3d_jobs
      ADD CONSTRAINT fk_avatar_3d_job_enhanced_photo_owner
      FOREIGN KEY (enhanced_photo_id, user_id)
      REFERENCES avatar_3d_job_photos (id, user_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS avatar_3d_reference_sets (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  job_id CHAR(36) NOT NULL UNIQUE,
  source_photo_id CHAR(36) NOT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'wan_multiview'
    CHECK (provider = 'wan_multiview'),
  provider_task_id VARCHAR(160),
  provider_request_id VARCHAR(160),
  provider_status VARCHAR(80),
  status VARCHAR(40) NOT NULL DEFAULT 'queued' CHECK (status IN (
    'queued', 'submitting', 'processing', 'persisting',
    'awaiting_confirmation', 'accepted', 'rejected', 'failed', 'deleted'
  )),
  prompt_plan JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_plan_version VARCHAR(40) NOT NULL,
  expected_image_count INTEGER NOT NULL DEFAULT 4 CHECK (expected_image_count = 4),
  actual_image_count INTEGER NOT NULL DEFAULT 0
    CHECK (actual_image_count >= 0 AND actual_image_count <= 4),
  usage_image_count INTEGER NOT NULL DEFAULT 0 CHECK (usage_image_count >= 0),
  cost_version VARCHAR(40) NOT NULL,
  estimated_cost_fen INTEGER NOT NULL CHECK (estimated_cost_fen >= 0),
  confirmed_at TIMESTAMPTZ,
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_avatar_3d_reference_set_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_avatar_3d_reference_set_job_owner
    FOREIGN KEY (job_id, user_id)
    REFERENCES avatar_3d_jobs (id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_avatar_3d_reference_set_source_photo
    FOREIGN KEY (source_photo_id, user_id)
    REFERENCES avatar_3d_job_photos (id, user_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_reference_sets_id_job_user
  ON avatar_3d_reference_sets (id, job_id, user_id);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_reference_sets_source_photo
  ON avatar_3d_reference_sets (source_photo_id, user_id);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_reference_sets_retention
  ON avatar_3d_reference_sets (retention_until)
  WHERE retention_until IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_avatar_3d_reference_sets_touch_updated_at
  ON avatar_3d_reference_sets;
CREATE TRIGGER trg_avatar_3d_reference_sets_touch_updated_at
BEFORE UPDATE ON avatar_3d_reference_sets
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS avatar_3d_reference_images (
  id CHAR(36) PRIMARY KEY,
  reference_set_id CHAR(36) NOT NULL,
  job_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  view VARCHAR(20) NOT NULL CHECK (view IN ('front', 'left', 'back', 'right')),
  sequence_index INTEGER NOT NULL CHECK (sequence_index >= 0 AND sequence_index <= 3),
  storage_key VARCHAR(512) NOT NULL,
  mime_type VARCHAR(80) NOT NULL,
  byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
  width INTEGER NOT NULL CHECK (width > 0),
  height INTEGER NOT NULL CHECK (height > 0),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  retention_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_avatar_3d_reference_image_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_avatar_3d_reference_image_set_owner
    FOREIGN KEY (reference_set_id, job_id, user_id)
    REFERENCES avatar_3d_reference_sets (id, job_id, user_id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_reference_image_view
  ON avatar_3d_reference_images (reference_set_id, view);

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_reference_image_sequence
  ON avatar_3d_reference_images (reference_set_id, sequence_index);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_reference_images_retention
  ON avatar_3d_reference_images (retention_until)
  WHERE retention_until IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_avatar_3d_reference_images_touch_updated_at
  ON avatar_3d_reference_images;
CREATE TRIGGER trg_avatar_3d_reference_images_touch_updated_at
BEFORE UPDATE ON avatar_3d_reference_images
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_avatar_3d_job_reference_set_owner'
  ) THEN
    ALTER TABLE avatar_3d_jobs
      ADD CONSTRAINT fk_avatar_3d_job_reference_set_owner
      FOREIGN KEY (reference_set_id, id, user_id)
      REFERENCES avatar_3d_reference_sets (id, job_id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS avatar_3d_generation_attempts (
  id CHAR(36) PRIMARY KEY,
  job_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
  kind VARCHAR(40) NOT NULL CHECK (kind IN ('initial', 'technical_replacement')),
  model_provider VARCHAR(40) NOT NULL DEFAULT 'tripo' CHECK (model_provider = 'tripo'),
  provider_task_id VARCHAR(160),
  provider_request_id VARCHAR(160),
  source_photo_id CHAR(36),
  status VARCHAR(40) NOT NULL DEFAULT 'queued_generation' CHECK (status IN (
    'queued_generation', 'submitting_generation', 'processing_generation',
    'persisting_assets', 'quality_checking', 'succeeded', 'quality_failed',
    'failed', 'cancelled', 'submission_unknown'
  )),
  artifact_manifest JSONB,
  quality_status VARCHAR(40),
  quality_reason_code VARCHAR(80),
  quality_metrics JSONB,
  billing_disposition VARCHAR(40),
  raw_error TEXT,
  submitted_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_avatar_3d_generation_attempt_number UNIQUE (job_id, attempt_number),
  CONSTRAINT avatar_3d_generation_attempts_billing_disposition_check
    CHECK (
      billing_disposition IS NULL
      OR billing_disposition IN ('charged', 'uncharged', 'unknown')
    ),
  CONSTRAINT avatar_3d_generation_attempts_quality_status_check
    CHECK (quality_status IS NULL OR quality_status IN ('passed', 'failed')),
  CONSTRAINT fk_avatar_3d_generation_attempt_job
    FOREIGN KEY (job_id, user_id) REFERENCES avatar_3d_jobs(id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_avatar_3d_generation_attempt_source_photo_owner
    FOREIGN KEY (source_photo_id, user_id) REFERENCES avatar_3d_job_photos(id, user_id)
);

ALTER TABLE avatar_3d_generation_attempts
  ADD COLUMN IF NOT EXISTS provider_request_id VARCHAR(160),
  ADD COLUMN IF NOT EXISTS billing_disposition VARCHAR(40),
  ADD COLUMN IF NOT EXISTS raw_error TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'avatar_3d_generation_attempts_billing_disposition_check'
      AND conrelid = 'avatar_3d_generation_attempts'::regclass
  ) THEN
    ALTER TABLE avatar_3d_generation_attempts
      ADD CONSTRAINT avatar_3d_generation_attempts_billing_disposition_check
      CHECK (
        billing_disposition IS NULL
        OR billing_disposition IN ('charged', 'uncharged', 'unknown')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'avatar_3d_generation_attempts_quality_status_check'
      AND conrelid = 'avatar_3d_generation_attempts'::regclass
  ) THEN
    ALTER TABLE avatar_3d_generation_attempts
      ADD CONSTRAINT avatar_3d_generation_attempts_quality_status_check
      CHECK (quality_status IS NULL OR quality_status IN ('passed', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_avatar_3d_generation_attempts_job
  ON avatar_3d_generation_attempts (job_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_generation_attempts_source_photo
  ON avatar_3d_generation_attempts (source_photo_id)
  WHERE source_photo_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_avatar_3d_generation_attempts_id_job
  ON avatar_3d_generation_attempts (id, job_id);

CREATE INDEX IF NOT EXISTS idx_avatar_3d_jobs_current_attempt
  ON avatar_3d_jobs (current_attempt_id)
  WHERE current_attempt_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_avatar_3d_generation_attempts_touch_updated_at
  ON avatar_3d_generation_attempts;
CREATE TRIGGER trg_avatar_3d_generation_attempts_touch_updated_at
BEFORE UPDATE ON avatar_3d_generation_attempts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_avatar_3d_job_current_attempt'
  ) THEN
    ALTER TABLE avatar_3d_jobs
      ADD CONSTRAINT fk_avatar_3d_job_current_attempt
      FOREIGN KEY (current_attempt_id) REFERENCES avatar_3d_generation_attempts(id)
      ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_avatar_3d_job_current_attempt_job'
  ) THEN
    ALTER TABLE avatar_3d_jobs
      ADD CONSTRAINT fk_avatar_3d_job_current_attempt_job
      FOREIGN KEY (current_attempt_id, id)
      REFERENCES avatar_3d_generation_attempts (id, job_id);
  END IF;
END $$;
