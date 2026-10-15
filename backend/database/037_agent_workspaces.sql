-- A workspace is one user goal. Nodes are separately leased execution attempts;
-- a lost lease is never put back on the queue because a model call may be billed.
CREATE TABLE agent_workspaces (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  goal TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 2000),
  status VARCHAR(32) NOT NULL DEFAULT 'queued' CHECK (status IN
    ('queued', 'running', 'waiting_input', 'awaiting_confirmation', 'succeeded', 'failed', 'interrupted', 'cancelling', 'cancelled')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  coordinator_version VARCHAR(80) NOT NULL,
  source JSONB NOT NULL CHECK (jsonb_typeof(source) = 'object'
    AND jsonb_typeof(source->'page') = 'string' AND source->'page' IS NOT NULL
    AND source->'module' IS NOT NULL AND jsonb_typeof(source->'module') IN ('string','null')
    AND (source - ARRAY['page','module']) = '{}'::jsonb),
  context_refs JSONB NOT NULL CHECK (jsonb_typeof(context_refs) = 'array'),
  authority JSONB NOT NULL CHECK (jsonb_typeof(authority) = 'object'),
  input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  followups JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(followups) = 'array'),
  limits JSONB NOT NULL CHECK (jsonb_typeof(limits) = 'object'
    AND limits ? 'deadlineSeconds'
    AND (limits - 'deadlineSeconds') = '{}'::jsonb
    AND jsonb_typeof(limits->'deadlineSeconds') = 'number'
    AND (limits->>'deadlineSeconds')::integer BETWEEN 30 AND 86400),
  usage JSONB NOT NULL DEFAULT '{"modelCalls":0,"coordinatorTurns":0}'::jsonb CHECK (jsonb_typeof(usage) = 'object'
    AND usage ?& ARRAY['modelCalls','coordinatorTurns']
    AND (usage - ARRAY['modelCalls','coordinatorTurns']) = '{}'::jsonb
    AND jsonb_typeof(usage->'modelCalls') = 'number' AND jsonb_typeof(usage->'coordinatorTurns') = 'number'
    AND (usage->>'modelCalls')::integer >= 0 AND (usage->>'coordinatorTurns')::integer >= 0),
  deadline_at TIMESTAMPTZ NOT NULL,
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 2000),
  question TEXT CHECK (question IS NULL OR length(question) BETWEEN 1 AND 2000),
  result JSONB CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  approval JSONB CHECK (approval IS NULL OR jsonb_typeof(approval) = 'object'),
  error JSONB CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  last_operation VARCHAR(16) CHECK (last_operation IN ('cancel', 'confirm', 'reject', 'reply')),
  last_operation_revision INTEGER,
  last_decision_hash CHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uniq_agent_workspace_submission UNIQUE (user_id, idempotency_key),
  CONSTRAINT uniq_agent_workspace_owner UNIQUE (id, user_id),
  CONSTRAINT chk_agent_workspace_approval CHECK (status <> 'awaiting_confirmation' OR approval IS NOT NULL),
  CONSTRAINT chk_agent_workspace_question CHECK (status <> 'waiting_input' OR question IS NOT NULL),
  CONSTRAINT chk_agent_workspace_result CHECK (status <> 'succeeded' OR result IS NOT NULL),
  CONSTRAINT chk_agent_workspace_decision CHECK (
    (last_operation IS NULL AND last_operation_revision IS NULL AND last_decision_hash IS NULL)
    OR (last_operation IS NOT NULL AND last_operation_revision > 0 AND last_decision_hash ~ '^[a-f0-9]{64}$'))
);

CREATE INDEX idx_agent_workspaces_owner_updated ON agent_workspaces (user_id, updated_at DESC, id DESC);
CREATE INDEX idx_agent_workspaces_deadline ON agent_workspaces (deadline_at, id)
  WHERE status IN ('queued', 'running', 'waiting_input', 'cancelling');

CREATE TABLE agent_workspace_nodes (
  id CHAR(36) PRIMARY KEY,
  workspace_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  node_key VARCHAR(80) NOT NULL,
  agent_id VARCHAR(120) NOT NULL,
  agent_version VARCHAR(80) NOT NULL,
  capability VARCHAR(120) NOT NULL,
  goal TEXT NOT NULL CHECK (length(goal) BETWEEN 1 AND 2000),
  dependencies JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(dependencies) = 'array'),
  context_ref_indexes JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(context_ref_indexes) = 'array'),
  status VARCHAR(24) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'interrupted', 'cancelled')),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 2000),
  result JSONB CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  error JSONB CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  model_calls INTEGER NOT NULL DEFAULT 0 CHECK (model_calls >= 0),
  model_receipts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(model_receipts) = 'array'
    AND jsonb_array_length(model_receipts) = model_calls),
  claim_token CHAR(36),
  lease_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT fk_agent_workspace_node_owner FOREIGN KEY (workspace_id, user_id)
    REFERENCES agent_workspaces (id, user_id) ON DELETE CASCADE,
  CONSTRAINT uniq_agent_workspace_node_key UNIQUE (workspace_id, node_key),
  CONSTRAINT chk_agent_workspace_node_lease CHECK (
    (status = 'running' AND claim_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'running' AND claim_token IS NULL AND lease_until IS NULL))
);

CREATE INDEX idx_agent_workspace_nodes_queue ON agent_workspace_nodes (workspace_id, created_at, id) WHERE status = 'queued';
CREATE INDEX idx_agent_workspace_nodes_expired ON agent_workspace_nodes (lease_until, workspace_id) WHERE status = 'running';
