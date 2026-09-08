-- Persist model-space facts beside every derived artifact. Existing rows stay
-- readable for purge, but new application writes require verified provenance.

ALTER TABLE media_retrieval_segments
  ADD COLUMN IF NOT EXISTS descriptor_provenance JSONB,
  ADD COLUMN IF NOT EXISTS embedding_provenance JSONB;

ALTER TABLE media_retrieval_segment_staging
  ADD COLUMN IF NOT EXISTS descriptor_provenance JSONB,
  ADD COLUMN IF NOT EXISTS embedding_provenance JSONB;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_media_retrieval_segments_descriptor_provenance_json'
  ) THEN
    ALTER TABLE media_retrieval_segments
      ADD CONSTRAINT chk_media_retrieval_segments_descriptor_provenance_json
      CHECK (descriptor_provenance IS NULL OR jsonb_typeof(descriptor_provenance) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_media_retrieval_segments_embedding_provenance_json'
  ) THEN
    ALTER TABLE media_retrieval_segments
      ADD CONSTRAINT chk_media_retrieval_segments_embedding_provenance_json
      CHECK (embedding_provenance IS NULL OR jsonb_typeof(embedding_provenance) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_media_retrieval_staging_descriptor_provenance_json'
  ) THEN
    ALTER TABLE media_retrieval_segment_staging
      ADD CONSTRAINT chk_media_retrieval_staging_descriptor_provenance_json
      CHECK (descriptor_provenance IS NULL OR jsonb_typeof(descriptor_provenance) = 'object');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_media_retrieval_staging_embedding_provenance_json'
  ) THEN
    ALTER TABLE media_retrieval_segment_staging
      ADD CONSTRAINT chk_media_retrieval_staging_embedding_provenance_json
      CHECK (embedding_provenance IS NULL OR jsonb_typeof(embedding_provenance) = 'object');
  END IF;
END $$;
