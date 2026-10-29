-- Agent catalogue metadata is operator-controlled presentation state. It never
-- creates an executor: executable behaviour remains in agents/*.agent.js.
CREATE TABLE IF NOT EXISTS agent_catalog (
  agent_id VARCHAR(80) PRIMARY KEY,
  display_name VARCHAR(120),
  description TEXT,
  identity_mark VARCHAR(40),
  identity_shape VARCHAR(20) CHECK (identity_shape IS NULL OR identity_shape IN ('circle', 'squircle', 'rounded')),
  identity_colors JSONB NOT NULL DEFAULT '{}'::jsonb,
  published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Preserve the visibility of every Agent currently shipped by the code
-- registry. Registry keys added after this migration are inserted unpublished.
INSERT INTO agent_catalog (agent_id, published) VALUES
  ('album-manager', TRUE),
  ('comic-diary', TRUE),
  ('file-preprocessor', TRUE),
  ('media-retrieval', TRUE),
  ('miaoxun-butler', TRUE),
  ('model-3d', TRUE),
  ('site-builder', TRUE),
  ('video-production', TRUE),
  ('virtual-character', TRUE)
ON CONFLICT (agent_id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_agent_catalog_touch_updated_at ON agent_catalog;
CREATE TRIGGER trg_agent_catalog_touch_updated_at
BEFORE UPDATE ON agent_catalog
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
