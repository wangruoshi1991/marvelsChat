ALTER TABLE avatar_3d_jobs
  ADD COLUMN IF NOT EXISTS quality_preset VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS geometry_quality VARCHAR(20) NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS texture_quality VARCHAR(20) NOT NULL DEFAULT 'standard';

ALTER TABLE avatar_3d_jobs
  DROP CONSTRAINT IF EXISTS avatar_3d_jobs_quality_preset_check,
  DROP CONSTRAINT IF EXISTS avatar_3d_jobs_geometry_quality_check,
  DROP CONSTRAINT IF EXISTS avatar_3d_jobs_texture_quality_check;

ALTER TABLE avatar_3d_jobs
  ADD CONSTRAINT avatar_3d_jobs_quality_preset_check
    CHECK (quality_preset IN ('standard', 'detailed', 'ultra')),
  ADD CONSTRAINT avatar_3d_jobs_geometry_quality_check
    CHECK (geometry_quality IN ('standard', 'ultra')),
  ADD CONSTRAINT avatar_3d_jobs_texture_quality_check
    CHECK (texture_quality IN ('standard', 'detailed'));

ALTER TABLE avatar_3d_models
  ALTER COLUMN glb_storage_key DROP NOT NULL,
  ALTER COLUMN glb_mime_type DROP NOT NULL,
  ALTER COLUMN glb_byte_size DROP NOT NULL;

ALTER TABLE avatar_3d_models
  DROP CONSTRAINT IF EXISTS avatar_3d_models_status_check;

ALTER TABLE avatar_3d_models
  ADD CONSTRAINT avatar_3d_models_status_check
    CHECK (status IN ('preparing', 'active', 'deleted'));
