-- User consent is a first-class record. It never gets inferred from product
-- publication and can require re-consent after a release contract changes.
CREATE TABLE IF NOT EXISTS user_entitlements (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id CHAR(36) NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  product_version_id CHAR(36) NOT NULL REFERENCES product_versions(id) ON DELETE RESTRICT,
  status VARCHAR(24) NOT NULL DEFAULT 'enabled',
  granted_scopes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(granted_scopes) = 'array'),
  contract_hash CHAR(64) CHECK (contract_hash IS NULL OR contract_hash ~ '^[a-f0-9]{64}$'),
  consent_version VARCHAR(80),
  idempotency_key VARCHAR(160),
  unavailable_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_user_product_version_entitlement UNIQUE (user_id, product_version_id),
  CONSTRAINT uniq_user_entitlement_idempotency UNIQUE (user_id, idempotency_key),
  CONSTRAINT chk_entitlement_status CHECK (status IN ('enabled', 'disabled', 'unavailable', 'reconsent_required')),
  CONSTRAINT chk_entitlement_contract CHECK (status IN ('reconsent_required', 'unavailable') OR contract_hash IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS entitlement_status_history (
  id BIGSERIAL PRIMARY KEY,
  entitlement_id CHAR(36) NOT NULL REFERENCES user_entitlements(id) ON DELETE RESTRICT,
  from_status VARCHAR(24),
  to_status VARCHAR(24) NOT NULL,
  actor_user_id CHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  request_id VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_entitlement_history_to_status CHECK (to_status IN ('enabled', 'disabled', 'unavailable', 'reconsent_required')),
  CONSTRAINT chk_entitlement_history_from_status CHECK (from_status IS NULL OR from_status IN ('enabled', 'disabled', 'unavailable', 'reconsent_required'))
);

CREATE INDEX IF NOT EXISTS idx_user_entitlements_user_status ON user_entitlements (user_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_product_status ON user_entitlements (product_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_entitlements_version ON user_entitlements (product_version_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_entitlement_status_history_entitlement ON entitlement_status_history (entitlement_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_user_entitlements_touch_updated_at ON user_entitlements;
CREATE TRIGGER trg_user_entitlements_touch_updated_at BEFORE UPDATE ON user_entitlements
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
