-- Products are publishable user-facing bundles. Agent releases remain the
-- executable dependency and must be published independently.
CREATE TABLE IF NOT EXISTS products (
  id CHAR(36) PRIMARY KEY,
  product_key VARCHAR(80) NOT NULL UNIQUE,
  display_name VARCHAR(120) NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  identity_snapshot JSONB NOT NULL CHECK (jsonb_typeof(identity_snapshot) = 'object'),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  created_by CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_product_status CHECK (status IN ('draft', 'review', 'published', 'paused', 'retired'))
);

CREATE TABLE IF NOT EXISTS product_versions (
  id CHAR(36) PRIMARY KEY,
  product_id CHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  version VARCHAR(80) NOT NULL,
  supported_platforms JSONB NOT NULL CHECK (jsonb_typeof(supported_platforms) = 'array'),
  status VARCHAR(20) NOT NULL DEFAULT 'draft',
  contract_hash CHAR(64) CHECK (contract_hash IS NULL OR contract_hash ~ '^[a-f0-9]{64}$'),
  created_by CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_product_version UNIQUE (product_id, version),
  CONSTRAINT chk_product_version_status CHECK (status IN ('draft', 'review', 'published', 'paused', 'retired'))
);

CREATE TABLE IF NOT EXISTS product_agent_dependencies (
  id BIGSERIAL PRIMARY KEY,
  product_version_id CHAR(36) NOT NULL REFERENCES product_versions(id) ON DELETE CASCADE,
  agent_key VARCHAR(80) NOT NULL,
  agent_release_id CHAR(36) NOT NULL,
  version VARCHAR(80) NOT NULL,
  required_scopes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(required_scopes) = 'array'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_product_agent_dependency UNIQUE (product_version_id, agent_key),
  CONSTRAINT fk_product_dependency_release_identity
    FOREIGN KEY (agent_release_id, agent_key, version)
    REFERENCES agent_releases(id, agent_key, version) ON DELETE RESTRICT,
  CONSTRAINT fk_product_dependency_registry FOREIGN KEY (agent_key) REFERENCES agent_registry(agent_key) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS product_status_history (
  id BIGSERIAL PRIMARY KEY,
  product_id CHAR(36) NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  product_version_id CHAR(36) REFERENCES product_versions(id) ON DELETE RESTRICT,
  from_status VARCHAR(20),
  to_status VARCHAR(20) NOT NULL,
  actor_user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  request_id VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_product_history_to_status CHECK (to_status IN ('draft', 'review', 'published', 'paused', 'retired')),
  CONSTRAINT chk_product_history_from_status CHECK (from_status IS NULL OR from_status IN ('draft', 'review', 'published', 'paused', 'retired'))
);

CREATE INDEX IF NOT EXISTS idx_products_status ON products (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_versions_status ON product_versions (status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_product_versions_product ON product_versions (product_id, version DESC);
CREATE INDEX IF NOT EXISTS idx_product_dependencies_agent ON product_agent_dependencies (agent_key, product_version_id);
CREATE INDEX IF NOT EXISTS idx_product_status_history_product ON product_status_history (product_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_products_touch_updated_at ON products;
CREATE TRIGGER trg_products_touch_updated_at BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
DROP TRIGGER IF EXISTS trg_product_versions_touch_updated_at ON product_versions;
CREATE TRIGGER trg_product_versions_touch_updated_at BEFORE UPDATE ON product_versions
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
