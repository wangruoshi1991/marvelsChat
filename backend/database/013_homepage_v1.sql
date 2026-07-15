ALTER TABLE station_site_drafts
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  ADD COLUMN IF NOT EXISTS selected_media_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS station_site_generation_jobs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  prompt TEXT NOT NULL,
  selected_media_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status VARCHAR(20) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'fallback', 'failed', 'cancelled')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
  site_draft_id CHAR(36),
  source VARCHAR(20) CHECK (source IS NULL OR source IN ('fallback', 'model')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMPTZ,
  CONSTRAINT uniq_homepage_job_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT fk_homepage_job_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_homepage_job_draft FOREIGN KEY (site_draft_id) REFERENCES station_site_drafts(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_homepage_jobs_user_created
  ON station_site_generation_jobs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_homepage_jobs_status_updated
  ON station_site_generation_jobs (status, updated_at ASC);

DROP TRIGGER IF EXISTS trg_homepage_jobs_touch_updated_at ON station_site_generation_jobs;
CREATE TRIGGER trg_homepage_jobs_touch_updated_at
BEFORE UPDATE ON station_site_generation_jobs
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_site_releases (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  draft_id CHAR(36) NOT NULL,
  revision INTEGER NOT NULL CHECK (revision >= 1),
  snapshot JSONB NOT NULL,
  selected_media_asset_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  visibility VARCHAR(20) NOT NULL CHECK (visibility IN ('private', 'link')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_homepage_release_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_homepage_release_draft FOREIGN KEY (draft_id) REFERENCES station_site_drafts(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_homepage_releases_user_created
  ON station_site_releases (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS station_sites (
  user_id CHAR(36) PRIMARY KEY,
  current_draft_id CHAR(36),
  published_release_id CHAR(36),
  visibility VARCHAR(20) NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'link')),
  share_token VARCHAR(128) UNIQUE,
  published_at TIMESTAMPTZ,
  unpublished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_homepage_site_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_homepage_site_draft FOREIGN KEY (current_draft_id) REFERENCES station_site_drafts(id) ON DELETE SET NULL,
  CONSTRAINT fk_homepage_site_release FOREIGN KEY (published_release_id) REFERENCES station_site_releases(id) ON DELETE SET NULL,
  CONSTRAINT homepage_share_token_visibility CHECK (
    (visibility = 'link' AND share_token IS NOT NULL)
    OR (visibility = 'private' AND share_token IS NULL)
  )
);

DROP TRIGGER IF EXISTS trg_homepage_sites_touch_updated_at ON station_sites;
CREATE TRIGGER trg_homepage_sites_touch_updated_at
BEFORE UPDATE ON station_sites
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TABLE IF NOT EXISTS station_site_preview_tokens (
  token_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  draft_id CHAR(36) NOT NULL,
  draft_revision INTEGER NOT NULL CHECK (draft_revision >= 1),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_homepage_preview_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_homepage_preview_draft FOREIGN KEY (draft_id) REFERENCES station_site_drafts(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_homepage_preview_expiry
  ON station_site_preview_tokens (expires_at)
  WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS user_consents (
  user_id CHAR(36) NOT NULL,
  policy_type VARCHAR(32) NOT NULL CHECK (policy_type IN ('privacy', 'terms')),
  policy_version VARCHAR(40) NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (user_id, policy_type, policy_version),
  CONSTRAINT fk_user_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_consents_user_accepted
  ON user_consents (user_id, accepted_at DESC);
