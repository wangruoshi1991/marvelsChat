-- Media Retrieval lifecycle hardening is additive and forward-only.
-- It invalidates stale work by epoch, retains leases for worker recovery, and
-- removes derived artifacts rather than retaining a soft-purged copy.

ALTER TABLE media_retrieval_profiles
  ADD COLUMN IF NOT EXISTS index_epoch BIGINT NOT NULL DEFAULT 1;

ALTER TABLE media_retrieval_jobs
  ADD COLUMN IF NOT EXISTS profile_epoch BIGINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS lease_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ;

ALTER TABLE media_retrieval_operator_controls
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_control_user_daily_request_limit_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_control_user_monthly_budget_fen_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_control_global_daily_budget_fen_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_control_caption_reserve_fen_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_control_embedding_reserve_fen_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_controls_user_daily_request_limit_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_controls_user_monthly_budget_fen_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_controls_global_daily_budget_fen_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_controls_caption_reserve_fen_check,
  DROP CONSTRAINT IF EXISTS media_retrieval_operator_controls_embedding_reserve_fen_check,
  DROP CONSTRAINT IF EXISTS chk_media_retrieval_controls_user_daily_request_limit,
  DROP CONSTRAINT IF EXISTS chk_media_retrieval_controls_user_monthly_budget,
  DROP CONSTRAINT IF EXISTS chk_media_retrieval_controls_global_daily_budget,
  DROP CONSTRAINT IF EXISTS chk_media_retrieval_controls_caption_reserve,
  DROP CONSTRAINT IF EXISTS chk_media_retrieval_controls_embedding_reserve;

ALTER TABLE media_retrieval_operator_controls
  ADD CONSTRAINT chk_media_retrieval_controls_user_daily_request_limit
    CHECK (user_daily_request_limit BETWEEN 0 AND 1000),
  ADD CONSTRAINT chk_media_retrieval_controls_user_monthly_budget
    CHECK (user_monthly_budget_fen BETWEEN 0 AND 1000000),
  ADD CONSTRAINT chk_media_retrieval_controls_global_daily_budget
    CHECK (global_daily_budget_fen BETWEEN 0 AND 10000000),
  ADD CONSTRAINT chk_media_retrieval_controls_caption_reserve
    CHECK (caption_reserve_fen BETWEEN 0 AND 1000000),
  ADD CONSTRAINT chk_media_retrieval_controls_embedding_reserve
    CHECK (embedding_reserve_fen BETWEEN 0 AND 1000000);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_jobs_expired_lease
  ON media_retrieval_jobs (lease_expires_at, claimed_at)
  WHERE status = 'running';

-- Existing installations may contain duplicate ready rows from a reindex.
-- Preserve the newest as active before installing the database invariant.
WITH ranked_ready_segments AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id, media_asset_id, segment_index
      ORDER BY created_at DESC, id DESC
    ) AS row_number
  FROM media_retrieval_segments
  WHERE state = 'ready'
)
UPDATE media_retrieval_segments AS segment
SET state = 'superseded'
FROM ranked_ready_segments AS ranked
WHERE segment.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_retrieval_ready_segment
  ON media_retrieval_segments (user_id, media_asset_id, segment_index)
  WHERE state = 'ready';

CREATE TABLE IF NOT EXISTS media_retrieval_temporary_cleanup_tasks (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  job_id CHAR(36),
  object_key TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_by VARCHAR(120),
  claimed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_media_retrieval_temporary_cleanup_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_temporary_cleanup_job
    FOREIGN KEY (job_id) REFERENCES media_retrieval_jobs(id) ON DELETE SET NULL,
  CONSTRAINT chk_media_retrieval_temporary_cleanup_status
    CHECK (status IN ('queued', 'claimed', 'completed')),
  CONSTRAINT chk_media_retrieval_temporary_cleanup_attempts
    CHECK (attempts >= 0),
  CONSTRAINT chk_media_retrieval_temporary_cleanup_key
    CHECK (object_key LIKE ('users/' || user_id || '/media-retrieval-tmp/%')),
  CONSTRAINT uniq_media_retrieval_temporary_cleanup_key UNIQUE (object_key)
);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_temporary_cleanup_claimable
  ON media_retrieval_temporary_cleanup_tasks (status, next_attempt_at, created_at)
  WHERE status = 'queued';

DROP TRIGGER IF EXISTS trg_media_retrieval_temporary_cleanup_touch_updated_at
  ON media_retrieval_temporary_cleanup_tasks;
CREATE TRIGGER trg_media_retrieval_temporary_cleanup_touch_updated_at
BEFORE UPDATE ON media_retrieval_temporary_cleanup_tasks
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- Frames are durable before their checkpoint advances, but this table is never
-- read by product retrieval. Only the final index commit moves a complete job
-- into queryable media_retrieval_segments.
CREATE TABLE IF NOT EXISTS media_retrieval_segment_staging (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  agent_run_id CHAR(36),
  job_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36) NOT NULL,
  profile_epoch BIGINT NOT NULL,
  segment_index INTEGER NOT NULL CHECK (segment_index >= 0),
  source_kind VARCHAR(20) NOT NULL,
  frame_timestamp_ms INTEGER,
  descriptor JSONB NOT NULL,
  embedding vector(1024) NOT NULL,
  processing_version VARCHAR(40) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_media_retrieval_staging_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_staging_run_owner
    FOREIGN KEY (agent_run_id) REFERENCES agent_runs(id) ON DELETE SET NULL,
  CONSTRAINT fk_media_retrieval_staging_job
    FOREIGN KEY (job_id) REFERENCES media_retrieval_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_staging_asset_owner
    FOREIGN KEY (media_asset_id, user_id) REFERENCES station_media_assets(id, user_id) ON DELETE CASCADE,
  CONSTRAINT chk_media_retrieval_staging_source
    CHECK ((source_kind = 'image' AND frame_timestamp_ms IS NULL)
      OR (source_kind = 'video-frame' AND frame_timestamp_ms IS NOT NULL AND frame_timestamp_ms >= 0)),
  CONSTRAINT chk_media_retrieval_staging_embedding
    CHECK (vector_dims(embedding) = 1024),
  CONSTRAINT uniq_media_retrieval_staging_job_segment UNIQUE (job_id, segment_index)
);

ALTER TABLE media_retrieval_segment_staging
  DROP CONSTRAINT IF EXISTS fk_media_retrieval_staging_run_owner;

ALTER TABLE media_retrieval_segment_staging
  ADD CONSTRAINT fk_media_retrieval_staging_run_owner
  FOREIGN KEY (agent_run_id)
  REFERENCES agent_runs (id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_media_retrieval_staging_job
  ON media_retrieval_segment_staging (job_id, segment_index);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_staging_run
  ON media_retrieval_segment_staging (agent_run_id)
  WHERE agent_run_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_media_retrieval_staging_assert_run_owner
  ON media_retrieval_segment_staging;
CREATE TRIGGER trg_media_retrieval_staging_assert_run_owner
BEFORE INSERT OR UPDATE OF agent_run_id, user_id
ON media_retrieval_segment_staging
FOR EACH ROW EXECUTE FUNCTION media_retrieval_assert_run_owner();

DROP TRIGGER IF EXISTS trg_media_retrieval_staging_touch_updated_at
  ON media_retrieval_segment_staging;
CREATE TRIGGER trg_media_retrieval_staging_touch_updated_at
BEFORE UPDATE ON media_retrieval_segment_staging
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION media_retrieval_enqueue_asset_purge()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status <> 'uploaded' THEN
    -- Product-derived descriptors and embeddings become physically absent in
    -- the same transaction that makes the source asset unavailable.
    DELETE FROM media_retrieval_segments
    WHERE user_id = NEW.user_id
      AND media_asset_id = NEW.id;

    DELETE FROM media_retrieval_segment_staging
    WHERE user_id = NEW.user_id
      AND media_asset_id = NEW.id;

    UPDATE media_retrieval_jobs
    SET status = 'cancelled',
        failure_code = 'retrieval_purge_requested',
        finished_at = CURRENT_TIMESTAMP
    WHERE user_id = NEW.user_id
      AND media_asset_id = NEW.id
      AND job_type = 'index'
      AND status = 'queued';

    INSERT INTO media_retrieval_lifecycle_outbox (
      id,
      user_id,
      media_asset_id,
      event_type,
      dedupe_key,
      status
    )
    VALUES (
      NEW.id,
      NEW.user_id,
      NEW.id,
      'asset-purge',
      CONCAT('asset-purge:', NEW.id),
      'queued'
    )
    ON CONFLICT (dedupe_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
