-- Code registration and deployed release snapshots are independent from the
-- operator-controlled catalog and from product publication.
CREATE TABLE IF NOT EXISTS agent_registry (
  agent_key VARCHAR(80) PRIMARY KEY,
  version VARCHAR(80) NOT NULL,
  contract_hash CHAR(64) NOT NULL CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
  declared_scopes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(declared_scopes) = 'array'),
  readiness JSONB NOT NULL DEFAULT '{"ready":false,"missing":["unverified"]}'::jsonb CHECK (jsonb_typeof(readiness) = 'object'),
  registration_status VARCHAR(20) NOT NULL DEFAULT 'registered',
  source VARCHAR(80) NOT NULL DEFAULT 'registry',
  registered_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  removed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_agent_registry_status CHECK (registration_status IN ('registered', 'removed')),
  CONSTRAINT chk_agent_registry_removed_at CHECK ((registration_status = 'removed') = (removed_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS agent_releases (
  id CHAR(36) PRIMARY KEY,
  agent_key VARCHAR(80) NOT NULL,
  version VARCHAR(80) NOT NULL,
  contract_hash CHAR(64) NOT NULL CHECK (contract_hash ~ '^[a-f0-9]{64}$'),
  declared_scopes JSONB NOT NULL CHECK (jsonb_typeof(declared_scopes) = 'array'),
  readiness JSONB NOT NULL CHECK (jsonb_typeof(readiness) = 'object'),
  identity_snapshot JSONB CHECK (identity_snapshot IS NULL OR jsonb_typeof(identity_snapshot) = 'object'),
  catalog_status VARCHAR(20) NOT NULL DEFAULT 'draft',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_agent_release_registry FOREIGN KEY (agent_key) REFERENCES agent_registry(agent_key) ON DELETE RESTRICT,
  CONSTRAINT uniq_agent_release_contract UNIQUE (agent_key, version, contract_hash),
  CONSTRAINT chk_agent_release_status CHECK (catalog_status IN ('draft', 'review', 'published', 'unpublished', 'archived')),
  CONSTRAINT chk_agent_release_published_at CHECK ((catalog_status = 'published') = (published_at IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS agent_release_status_history (
  id BIGSERIAL PRIMARY KEY,
  release_id CHAR(36) NOT NULL REFERENCES agent_releases(id) ON DELETE CASCADE,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  actor_user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  request_id VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_agent_release_history_to_status CHECK (to_status IN ('draft', 'review', 'published', 'unpublished', 'archived')),
  CONSTRAINT chk_agent_release_history_from_status CHECK (from_status IS NULL OR from_status IN ('draft', 'review', 'published', 'unpublished', 'archived'))
);

ALTER TABLE agent_catalog ADD COLUMN IF NOT EXISTS release_version VARCHAR(80);
ALTER TABLE agent_catalog ADD COLUMN IF NOT EXISTS contract_hash CHAR(64);
ALTER TABLE agent_catalog ADD COLUMN IF NOT EXISTS source VARCHAR(80) NOT NULL DEFAULT 'registry';
ALTER TABLE agent_catalog ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'unpublished';
ALTER TABLE agent_catalog DROP CONSTRAINT IF EXISTS chk_agent_catalog_status;
ALTER TABLE agent_catalog ADD CONSTRAINT chk_agent_catalog_status CHECK (status IN ('draft', 'review', 'published', 'unpublished', 'archived'));
UPDATE agent_catalog SET status = CASE WHEN published THEN 'published' ELSE 'unpublished' END;

-- Preserve the deployed keys from migration 044 as historical registration
-- facts. New registry syncs insert real versions and hashes as unreviewed rows.
INSERT INTO agent_registry (agent_key, version, contract_hash, declared_scopes, readiness, registration_status, source)
SELECT agent_id, '0.0.0', repeat('0', 64), '[]'::jsonb,
       '{"ready":false,"missing":["legacy_registry_contract"]}'::jsonb,
       'registered', 'migration-044'
  FROM agent_catalog
ON CONFLICT (agent_key) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_agent_registry_status ON agent_registry (registration_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_registry_contract ON agent_registry (agent_key, version, contract_hash);
CREATE INDEX IF NOT EXISTS idx_agent_releases_status ON agent_releases (catalog_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_releases_agent ON agent_releases (agent_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_release_history_release ON agent_release_status_history (release_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_agent_registry_touch_updated_at ON agent_registry;
CREATE TRIGGER trg_agent_registry_touch_updated_at BEFORE UPDATE ON agent_registry
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_agent_releases_touch_updated_at ON agent_releases;
CREATE TRIGGER trg_agent_releases_touch_updated_at BEFORE UPDATE ON agent_releases
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
