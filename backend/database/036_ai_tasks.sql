-- Durable, owner-scoped AI tasks. Existing media runs and their cost ledger
-- remain independent; tasks never cause unknown provider calls to be replayed.
CREATE TABLE ai_tasks (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contract_version INTEGER NOT NULL DEFAULT 1 CHECK (contract_version = 1),
  kind VARCHAR(24) NOT NULL CHECK (kind IN ('agent_message', 'site_draft')),
  agent_id VARCHAR(120) NOT NULL,
  agent_version VARCHAR(80) NOT NULL,
  thread_id CHAR(36) REFERENCES chat_threads(id) ON DELETE CASCADE,
  input_message_id CHAR(36) REFERENCES chat_messages(id) ON DELETE CASCADE,
  status VARCHAR(32) NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'awaiting_confirmation', 'succeeded', 'failed', 'cancelled', 'interrupted')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  phase VARCHAR(100) NOT NULL DEFAULT 'queued' CHECK (phase IN
    ('queued', 'validating', 'generating', 'searching', 'awaiting_confirmation', 'completed', 'failed', 'cancelled', 'interrupted')),
  input JSONB NOT NULL CHECK (jsonb_typeof(input) = 'object'),
  context_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(context_refs) = 'array'),
  artifacts JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(artifacts) = 'array'),
  approval JSONB CHECK (approval IS NULL OR jsonb_typeof(approval) = 'object'),
  error JSONB CHECK (error IS NULL OR jsonb_typeof(error) = 'object'),
  idempotency_key VARCHAR(160) NOT NULL,
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  claim_token CHAR(36),
  lease_until TIMESTAMPTZ,
  last_operation VARCHAR(16) CHECK (last_operation IN ('cancel', 'confirm', 'reject')),
  last_operation_revision INTEGER,
  last_approval_id CHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT uniq_ai_task_submission UNIQUE (user_id, kind, agent_id, idempotency_key),
  CONSTRAINT uniq_ai_task_owner UNIQUE (id, user_id),
  CONSTRAINT chk_ai_task_source CHECK (
    (kind = 'agent_message' AND thread_id IS NOT NULL AND input_message_id IS NOT NULL)
    OR (kind = 'site_draft' AND thread_id IS NULL AND input_message_id IS NULL)
  ),
  CONSTRAINT chk_ai_task_lease CHECK (
    (status = 'running' AND claim_token IS NOT NULL AND lease_until IS NOT NULL)
    OR (status <> 'running' AND claim_token IS NULL AND lease_until IS NULL)
  ),
  CONSTRAINT chk_ai_task_confirmation CHECK (status <> 'awaiting_confirmation' OR approval IS NOT NULL),
  CONSTRAINT chk_ai_task_decision CHECK (
    (last_operation IS NULL AND last_operation_revision IS NULL AND last_approval_id IS NULL)
    OR (last_operation IS NOT NULL AND last_operation_revision > 0
      AND (last_operation <> 'confirm' OR last_approval_id IS NOT NULL))
  )
);

CREATE INDEX idx_ai_tasks_queue ON ai_tasks (created_at, id) WHERE status = 'queued';
CREATE INDEX idx_ai_tasks_expired_lease ON ai_tasks (lease_until, id) WHERE status = 'running';
CREATE INDEX idx_ai_tasks_owner_updated ON ai_tasks
  (user_id, (CASE WHEN status IN ('queued', 'running', 'awaiting_confirmation') THEN 0 ELSE 1 END), updated_at DESC, id DESC);
CREATE INDEX idx_ai_tasks_owner_thread ON ai_tasks
  (user_id, thread_id, (CASE WHEN status IN ('queued', 'running', 'awaiting_confirmation') THEN 0 ELSE 1 END), updated_at DESC, id DESC);

CREATE TABLE ai_task_events (
  task_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  sequence INTEGER NOT NULL CHECK (sequence > 0),
  payload JSONB NOT NULL CHECK (
    jsonb_typeof(payload) = 'object'
    AND payload ?& ARRAY['status', 'phase']
    AND (payload - ARRAY['status', 'phase', 'errorCode']) = '{}'::jsonb
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (task_id, sequence),
  CONSTRAINT fk_ai_task_event_owner FOREIGN KEY (task_id, user_id)
    REFERENCES ai_tasks (id, user_id) ON DELETE CASCADE
);
CREATE INDEX idx_ai_task_events_owner ON ai_task_events (user_id, task_id, sequence);
