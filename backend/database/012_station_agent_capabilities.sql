ALTER TABLE station_media_assets
  ADD COLUMN IF NOT EXISTS tags JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS station_site_drafts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  prompt TEXT NOT NULL,
  draft JSONB NOT NULL,
  source VARCHAR(20) NOT NULL DEFAULT 'fallback' CHECK (source IN ('fallback', 'model')),
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'applied', 'archived')),
  model_provider VARCHAR(120),
  model_missing JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_site_drafts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_station_site_drafts_user_created
  ON station_site_drafts (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_station_site_drafts_user_status
  ON station_site_drafts (user_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_site_drafts_touch_updated_at ON station_site_drafts;
CREATE TRIGGER trg_station_site_drafts_touch_updated_at
BEFORE UPDATE ON station_site_drafts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS generation_jobs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  agent_id VARCHAR(80) NOT NULL,
  kind VARCHAR(40) NOT NULL,
  input_type VARCHAR(20) NOT NULL,
  prompt TEXT NOT NULL,
  source_asset_id CHAR(36),
  provider VARCHAR(40) NOT NULL DEFAULT 'meshy',
  provider_task_id VARCHAR(160),
  status VARCHAR(30) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'provider_submitted', 'processing', 'succeeded', 'failed', 'cancelled', 'blocked')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_generation_jobs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_generation_jobs_source_asset FOREIGN KEY (source_asset_id) REFERENCES station_media_assets(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_generation_jobs_user_created
  ON generation_jobs (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_status
  ON generation_jobs (status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_generation_jobs_provider_task
  ON generation_jobs (provider, provider_task_id)
  WHERE provider_task_id IS NOT NULL AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_generation_jobs_touch_updated_at ON generation_jobs;
CREATE TRIGGER trg_generation_jobs_touch_updated_at
BEFORE UPDATE ON generation_jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_model_assets (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  generation_job_id CHAR(36) NOT NULL UNIQUE,
  title VARCHAR(160) NOT NULL,
  provider VARCHAR(40) NOT NULL DEFAULT 'meshy',
  provider_task_id VARCHAR(160),
  model_files JSONB NOT NULL DEFAULT '{}'::jsonb,
  thumbnail JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'deleted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_model_assets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_station_model_assets_generation_job FOREIGN KEY (generation_job_id) REFERENCES generation_jobs(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_station_model_assets_user_created
  ON station_model_assets (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_model_assets_touch_updated_at ON station_model_assets;
CREATE TRIGGER trg_station_model_assets_touch_updated_at
BEFORE UPDATE ON station_model_assets
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS file_assets (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  original_filename VARCHAR(180) NOT NULL,
  mime_type VARCHAR(160),
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  checksum_sha256 CHAR(64),
  storage_provider VARCHAR(40) NOT NULL DEFAULT 'inline',
  storage_key VARCHAR(512),
  source_kind VARCHAR(40) NOT NULL DEFAULT 'inline_text',
  status VARCHAR(30) NOT NULL DEFAULT 'processed'
    CHECK (status IN ('pending_upload', 'uploaded', 'processed', 'unsupported', 'failed', 'deleted')),
  preprocessing_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_file_assets_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_file_assets_user_created
  ON file_assets (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_file_assets_user_status
  ON file_assets (user_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_file_assets_touch_updated_at ON file_assets;
CREATE TRIGGER trg_file_assets_touch_updated_at
BEFORE UPDATE ON file_assets
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_comic_diaries (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  prompt TEXT NOT NULL,
  style VARCHAR(40) NOT NULL DEFAULT 'slice-of-life'
    CHECK (style IN ('slice-of-life', 'cute', 'manga', 'storyboard')),
  source_diary_entry_id CHAR(36),
  source_media_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  frames JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'archived', 'deleted')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_comic_diaries_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_station_comic_diaries_diary FOREIGN KEY (source_diary_entry_id) REFERENCES station_diary_entries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_station_comic_diaries_user_created
  ON station_comic_diaries (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_station_comic_diaries_user_status
  ON station_comic_diaries (user_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_station_comic_diaries_media_refs
  ON station_comic_diaries USING GIN (source_media_asset_ids)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_comic_diaries_touch_updated_at ON station_comic_diaries;
CREATE TRIGGER trg_station_comic_diaries_touch_updated_at
BEFORE UPDATE ON station_comic_diaries
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_video_drafts (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  prompt TEXT NOT NULL,
  format VARCHAR(40) NOT NULL DEFAULT 'short-clip'
    CHECK (format IN ('short-clip', 'vlog', 'story', 'promo')),
  aspect_ratio VARCHAR(10) NOT NULL DEFAULT '9:16' CHECK (aspect_ratio IN ('9:16', '16:9', '1:1')),
  duration_seconds INTEGER NOT NULL DEFAULT 45 CHECK (duration_seconds >= 10 AND duration_seconds <= 180),
  source_diary_entry_id CHAR(36),
  source_comic_diary_id CHAR(36),
  source_media_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_file_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  script JSONB NOT NULL DEFAULT '{}'::jsonb,
  shots JSONB NOT NULL DEFAULT '[]'::jsonb,
  summary TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'archived', 'deleted')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  CONSTRAINT fk_station_video_drafts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_station_video_drafts_diary FOREIGN KEY (source_diary_entry_id) REFERENCES station_diary_entries(id) ON DELETE SET NULL,
  CONSTRAINT fk_station_video_drafts_comic FOREIGN KEY (source_comic_diary_id) REFERENCES station_comic_diaries(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_station_video_drafts_user_created
  ON station_video_drafts (user_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_station_video_drafts_user_status
  ON station_video_drafts (user_id, status, updated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_station_video_drafts_media_refs
  ON station_video_drafts USING GIN (source_media_asset_ids)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_station_video_drafts_touch_updated_at ON station_video_drafts;
CREATE TRIGGER trg_station_video_drafts_touch_updated_at
BEFORE UPDATE ON station_video_drafts
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
