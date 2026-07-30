ALTER TABLE avatar_3d_models
  ADD COLUMN IF NOT EXISTS mobile_glb_storage_key VARCHAR(512),
  ADD COLUMN IF NOT EXISTS mobile_glb_mime_type VARCHAR(80),
  ADD COLUMN IF NOT EXISTS mobile_glb_byte_size INTEGER;

ALTER TABLE avatar_3d_models
  DROP CONSTRAINT IF EXISTS avatar_3d_models_mobile_glb_byte_size_check,
  DROP CONSTRAINT IF EXISTS avatar_3d_models_mobile_glb_complete_check;

ALTER TABLE avatar_3d_models
  ADD CONSTRAINT avatar_3d_models_mobile_glb_byte_size_check
    CHECK (mobile_glb_byte_size IS NULL OR mobile_glb_byte_size >= 0),
  ADD CONSTRAINT avatar_3d_models_mobile_glb_complete_check
    CHECK (
      (mobile_glb_storage_key IS NULL
        AND mobile_glb_mime_type IS NULL
        AND mobile_glb_byte_size IS NULL)
      OR
      (mobile_glb_storage_key IS NOT NULL
        AND mobile_glb_mime_type IS NOT NULL
        AND mobile_glb_byte_size IS NOT NULL)
    );
