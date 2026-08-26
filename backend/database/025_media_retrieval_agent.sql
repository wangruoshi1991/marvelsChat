-- Media Retrieval Agent is additive and forward-only. Do not use this migration as a rollback mechanism.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE agent_runs
  ADD COLUMN IF NOT EXISTS run_type VARCHAR(40) NOT NULL DEFAULT 'chat',
  ADD COLUMN IF NOT EXISTS lifecycle_status VARCHAR(30) NOT NULL DEFAULT 'succeeded',
  ADD COLUMN IF NOT EXISTS trace_id CHAR(32),
  ADD COLUMN IF NOT EXISTS attempt INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confirmation JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS provider_action_counted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS failure_code VARCHAR(100),
  ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(160);

ALTER TABLE agent_runs
  DROP CONSTRAINT IF EXISTS agent_runs_status_check;

ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('success', 'error', 'pending'));

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_agent_runs_lifecycle_status'
  ) THEN
    ALTER TABLE agent_runs
      ADD CONSTRAINT chk_agent_runs_lifecycle_status
      CHECK (lifecycle_status IN ('accepted', 'queued', 'running', 'awaiting_user', 'purging', 'succeeded', 'failed', 'cancelled', 'blocked'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_agent_runs_attempt'
  ) THEN
    ALTER TABLE agent_runs
      ADD CONSTRAINT chk_agent_runs_attempt
      CHECK (attempt >= 1);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_media_retrieval_runs_have_owner'
  ) THEN
    ALTER TABLE agent_runs
      ADD CONSTRAINT chk_media_retrieval_runs_have_owner
      CHECK (agent_id <> 'media-retrieval' OR user_id IS NOT NULL);
  END IF;
END $$;

UPDATE agent_runs
SET lifecycle_status = CASE
  WHEN status = 'success' THEN 'succeeded'
  WHEN status = 'error' THEN 'failed'
  ELSE lifecycle_status
END
WHERE status IN ('success', 'error');

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_runs_user_agent_idempotency
  ON agent_runs (user_id, agent_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_agent_runs_id_user
  ON agent_runs (id, user_id);

CREATE INDEX IF NOT EXISTS idx_agent_runs_media_retrieval_terminal
  ON agent_runs (agent_id, lifecycle_status, finished_at)
  WHERE agent_id = 'media-retrieval'
    AND lifecycle_status IN ('succeeded', 'failed', 'cancelled', 'blocked');

CREATE TABLE IF NOT EXISTS agent_run_events (
  id CHAR(36) PRIMARY KEY,
  agent_run_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  lifecycle_status VARCHAR(30) NOT NULL,
  event_type VARCHAR(80) NOT NULL,
  visibility VARCHAR(20) NOT NULL DEFAULT 'client' CHECK (visibility IN ('client', 'operator')),
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  delivery_key VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_run_events_run_owner
    FOREIGN KEY (agent_run_id, user_id)
    REFERENCES agent_runs (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_agent_run_events_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_agent_run_events_lifecycle_status
    CHECK (lifecycle_status IN ('accepted', 'queued', 'running', 'awaiting_user', 'purging', 'succeeded', 'failed', 'cancelled', 'blocked')),
  CONSTRAINT uniq_agent_run_events_sequence UNIQUE (agent_run_id, sequence),
  CONSTRAINT uniq_agent_run_events_delivery_key UNIQUE (delivery_key)
);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_user_run_sequence
  ON agent_run_events (user_id, agent_run_id, sequence);

CREATE INDEX IF NOT EXISTS idx_agent_run_events_created_at
  ON agent_run_events (created_at);

CREATE TABLE IF NOT EXISTS media_retrieval_profiles (
  user_id CHAR(36) PRIMARY KEY,
  consent_version VARCHAR(80),
  consent_granted_at TIMESTAMPTZ,
  index_state VARCHAR(20) NOT NULL DEFAULT 'disabled',
  indexed_at TIMESTAMPTZ,
  disabled_at TIMESTAMPTZ,
  purge_requested_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_media_retrieval_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_media_retrieval_profiles_state
    CHECK (index_state IN ('disabled', 'enabled', 'purging', 'purged')),
  CONSTRAINT chk_media_retrieval_profiles_consent
    CHECK (
      index_state <> 'enabled'
      OR (consent_version = 'media-retrieval-consent-v1' AND consent_granted_at IS NOT NULL)
    )
);

DROP TRIGGER IF EXISTS trg_media_retrieval_profiles_touch_updated_at ON media_retrieval_profiles;
CREATE TRIGGER trg_media_retrieval_profiles_touch_updated_at
BEFORE UPDATE ON media_retrieval_profiles
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS media_retrieval_operator_controls (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
  agent_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  provider_calls_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  index_requests_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  lifecycle VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (lifecycle IN ('draft', 'review', 'sandbox', 'limited_release', 'available', 'suspended', 'deprecated', 'removed')),
  user_daily_request_limit INTEGER NOT NULL DEFAULT 0 CHECK (user_daily_request_limit BETWEEN 0 AND 3),
  user_monthly_budget_fen INTEGER NOT NULL DEFAULT 0 CHECK (user_monthly_budget_fen BETWEEN 0 AND 3000),
  global_daily_budget_fen INTEGER NOT NULL DEFAULT 0 CHECK (global_daily_budget_fen BETWEEN 0 AND 1000),
  caption_reserve_fen INTEGER NOT NULL DEFAULT 0 CHECK (caption_reserve_fen BETWEEN 0 AND 1000),
  embedding_reserve_fen INTEGER NOT NULL DEFAULT 0 CHECK (embedding_reserve_fen BETWEEN 0 AND 1000),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO media_retrieval_operator_controls (
  id,
  agent_enabled,
  provider_calls_enabled,
  index_requests_enabled,
  lifecycle,
  user_daily_request_limit,
  user_monthly_budget_fen,
  global_daily_budget_fen,
  caption_reserve_fen,
  embedding_reserve_fen
)
VALUES (TRUE, FALSE, FALSE, FALSE, 'draft', 0, 0, 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS media_retrieval_worker_heartbeats (
  worker_id VARCHAR(120) PRIMARY KEY,
  state VARCHAR(20) NOT NULL DEFAULT 'starting' CHECK (state IN ('starting', 'ready', 'draining', 'stopped')),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_worker_heartbeats_seen
  ON media_retrieval_worker_heartbeats (last_seen_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_station_media_assets_id_user
  ON station_media_assets (id, user_id);

CREATE TABLE IF NOT EXISTS media_retrieval_jobs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  agent_run_id CHAR(36),
  media_asset_id CHAR(36),
  job_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  source VARCHAR(40) NOT NULL DEFAULT 'user',
  content_fingerprint CHAR(64),
  processing_version VARCHAR(40) NOT NULL DEFAULT 'v1',
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt >= 1),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claimed_at TIMESTAMPTZ,
  claimed_by VARCHAR(120),
  finished_at TIMESTAMPTZ,
  failure_code VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_media_retrieval_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_jobs_run_owner
    FOREIGN KEY (agent_run_id, user_id)
    REFERENCES agent_runs (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_jobs_asset_owner
    FOREIGN KEY (media_asset_id, user_id)
    REFERENCES station_media_assets (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_media_retrieval_jobs_type
    CHECK (job_type IN ('index', 'purge-asset', 'purge-user')),
  CONSTRAINT chk_media_retrieval_jobs_status
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'blocked')),
  CONSTRAINT chk_media_retrieval_jobs_subject
    CHECK (
      (job_type = 'index' AND media_asset_id IS NOT NULL AND content_fingerprint IS NOT NULL)
      OR (job_type = 'purge-asset' AND media_asset_id IS NOT NULL)
      OR (job_type = 'purge-user' AND media_asset_id IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_jobs_claimable
  ON media_retrieval_jobs (status, available_at, created_at)
  WHERE status = 'queued';

CREATE INDEX IF NOT EXISTS idx_media_retrieval_jobs_user_created
  ON media_retrieval_jobs (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_retrieval_active_index_job
  ON media_retrieval_jobs (user_id, media_asset_id, content_fingerprint, processing_version)
  WHERE job_type = 'index'
    AND status IN ('queued', 'running');

DROP TRIGGER IF EXISTS trg_media_retrieval_jobs_touch_updated_at ON media_retrieval_jobs;
CREATE TRIGGER trg_media_retrieval_jobs_touch_updated_at
BEFORE UPDATE ON media_retrieval_jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS media_retrieval_lifecycle_outbox (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36),
  event_type VARCHAR(40) NOT NULL,
  dedupe_key VARCHAR(160) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  claimed_at TIMESTAMPTZ,
  claimed_by VARCHAR(120),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_media_retrieval_outbox_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_outbox_asset_owner
    FOREIGN KEY (media_asset_id, user_id)
    REFERENCES station_media_assets (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT chk_media_retrieval_outbox_type
    CHECK (event_type IN ('asset-purge', 'user-purge')),
  CONSTRAINT chk_media_retrieval_outbox_status
    CHECK (status IN ('queued', 'claimed', 'completed')),
  CONSTRAINT chk_media_retrieval_outbox_subject
    CHECK (
      (event_type = 'asset-purge' AND media_asset_id IS NOT NULL)
      OR (event_type = 'user-purge' AND media_asset_id IS NULL)
    ),
  CONSTRAINT uniq_media_retrieval_outbox_dedupe UNIQUE (dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_outbox_claimable
  ON media_retrieval_lifecycle_outbox (status, created_at)
  WHERE status = 'queued';

DROP TRIGGER IF EXISTS trg_media_retrieval_outbox_touch_updated_at ON media_retrieval_lifecycle_outbox;
CREATE TRIGGER trg_media_retrieval_outbox_touch_updated_at
BEFORE UPDATE ON media_retrieval_lifecycle_outbox
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS media_retrieval_segments (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  media_asset_id CHAR(36) NOT NULL,
  agent_run_id CHAR(36),
  job_id CHAR(36),
  segment_index INTEGER NOT NULL CHECK (segment_index >= 0),
  source_kind VARCHAR(20) NOT NULL,
  frame_timestamp_ms INTEGER,
  descriptor JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding vector(1024),
  state VARCHAR(20) NOT NULL DEFAULT 'ready',
  processing_version VARCHAR(40) NOT NULL,
  content_fingerprint CHAR(64) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  purged_at TIMESTAMPTZ,
  CONSTRAINT fk_media_retrieval_segments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_segments_asset_owner
    FOREIGN KEY (media_asset_id, user_id)
    REFERENCES station_media_assets (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_segments_run_owner
    FOREIGN KEY (agent_run_id, user_id)
    REFERENCES agent_runs (id, user_id)
    ON DELETE SET NULL (agent_run_id),
  CONSTRAINT fk_media_retrieval_segments_job FOREIGN KEY (job_id) REFERENCES media_retrieval_jobs(id) ON DELETE SET NULL,
  CONSTRAINT chk_media_retrieval_segments_source
    CHECK (
      (source_kind = 'image' AND frame_timestamp_ms IS NULL)
      OR (source_kind = 'video-frame' AND frame_timestamp_ms IS NOT NULL AND frame_timestamp_ms >= 0)
    ),
  CONSTRAINT chk_media_retrieval_segments_state
    CHECK (state IN ('ready', 'superseded', 'purged')),
  CONSTRAINT chk_media_retrieval_segments_vector_dimension
    CHECK (embedding IS NULL OR vector_dims(embedding) = 1024)
);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_segments_user_state
  ON media_retrieval_segments (user_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_segments_asset_state
  ON media_retrieval_segments (media_asset_id, state);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_segments_embedding_cosine
  ON media_retrieval_segments USING hnsw (embedding vector_cosine_ops)
  WHERE state = 'ready' AND embedding IS NOT NULL;

DROP TRIGGER IF EXISTS trg_media_retrieval_segments_touch_updated_at ON media_retrieval_segments;
CREATE TRIGGER trg_media_retrieval_segments_touch_updated_at
BEFORE UPDATE ON media_retrieval_segments
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS media_retrieval_cost_ledger (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  agent_run_id CHAR(36) NOT NULL,
  job_id CHAR(36),
  operation VARCHAR(40) NOT NULL,
  disposition VARCHAR(20) NOT NULL,
  amount_fen INTEGER NOT NULL CHECK (amount_fen >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  settled_at TIMESTAMPTZ,
  CONSTRAINT fk_media_retrieval_cost_ledger_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_cost_ledger_run_owner
    FOREIGN KEY (agent_run_id, user_id)
    REFERENCES agent_runs (id, user_id)
    ON DELETE CASCADE,
  CONSTRAINT fk_media_retrieval_cost_ledger_job FOREIGN KEY (job_id) REFERENCES media_retrieval_jobs(id) ON DELETE SET NULL,
  CONSTRAINT chk_media_retrieval_cost_ledger_operation
    CHECK (operation IN ('query-parse', 'query-embedding', 'image-description', 'image-embedding')),
  CONSTRAINT chk_media_retrieval_cost_ledger_disposition
    CHECK (disposition IN ('reserved', 'estimated', 'unknown', 'released'))
);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_cost_ledger_user_created
  ON media_retrieval_cost_ledger (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_media_retrieval_cost_ledger_created
  ON media_retrieval_cost_ledger (created_at);

CREATE TABLE IF NOT EXISTS media_retrieval_cost_daily_rollups (
  id BIGSERIAL PRIMARY KEY,
  utc_day DATE NOT NULL,
  scope VARCHAR(20) NOT NULL,
  user_id CHAR(36),
  action_count INTEGER NOT NULL DEFAULT 0 CHECK (action_count >= 0),
  reserved_fen INTEGER NOT NULL DEFAULT 0 CHECK (reserved_fen >= 0),
  estimated_fen INTEGER NOT NULL DEFAULT 0 CHECK (estimated_fen >= 0),
  unknown_fen INTEGER NOT NULL DEFAULT 0 CHECK (unknown_fen >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_media_retrieval_rollups_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_media_retrieval_rollups_scope
    CHECK (
      (scope = 'user' AND user_id IS NOT NULL)
      OR (scope = 'global' AND user_id IS NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_retrieval_rollups_user_day
  ON media_retrieval_cost_daily_rollups (utc_day, user_id)
  WHERE scope = 'user';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_media_retrieval_rollups_global_day
  ON media_retrieval_cost_daily_rollups (utc_day)
  WHERE scope = 'global';

CREATE INDEX IF NOT EXISTS idx_media_retrieval_rollups_retention
  ON media_retrieval_cost_daily_rollups (utc_day);

DROP TRIGGER IF EXISTS trg_media_retrieval_rollups_touch_updated_at ON media_retrieval_cost_daily_rollups;
CREATE TRIGGER trg_media_retrieval_rollups_touch_updated_at
BEFORE UPDATE ON media_retrieval_cost_daily_rollups
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE OR REPLACE FUNCTION media_retrieval_enqueue_asset_purge()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL OR NEW.status <> 'uploaded' THEN
    UPDATE media_retrieval_segments
    SET state = 'purged', purged_at = CURRENT_TIMESTAMP
    WHERE media_asset_id = NEW.id
      AND state IN ('ready', 'superseded');

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

DROP TRIGGER IF EXISTS trg_station_media_assets_media_retrieval_purge ON station_media_assets;
CREATE TRIGGER trg_station_media_assets_media_retrieval_purge
AFTER UPDATE OF status, deleted_at ON station_media_assets
FOR EACH ROW EXECUTE FUNCTION media_retrieval_enqueue_asset_purge();
