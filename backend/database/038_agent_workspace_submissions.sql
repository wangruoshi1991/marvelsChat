-- A submission key has one permanent accepted or rejected outcome. Keep only
-- the request digest and fixed rejection code, never another copy of its goal.
CREATE TABLE agent_workspace_submissions (
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key VARCHAR(160) NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  outcome VARCHAR(16) NOT NULL CHECK (outcome IN ('accepted', 'rejected')),
  workspace_id CHAR(36),
  rejection_code VARCHAR(100),
  rejection_status INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (user_id, idempotency_key),
  UNIQUE (workspace_id),
  CONSTRAINT fk_workspace_submission_owner FOREIGN KEY (workspace_id, user_id)
    REFERENCES agent_workspaces (id, user_id) ON DELETE NO ACTION DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT chk_workspace_submission_outcome CHECK (
    (outcome = 'accepted' AND workspace_id IS NOT NULL AND rejection_code IS NULL AND rejection_status IS NULL)
    OR (outcome = 'rejected' AND workspace_id IS NULL
      AND rejection_code IS NOT NULL AND rejection_code ~ '^[A-Z][A-Z0-9_]{0,99}$'
      AND rejection_status IS NOT NULL AND rejection_status IN (400, 403, 404, 409)))
);

-- Mandatory one-time import: runtime lookup never guesses an older outcome.
INSERT INTO agent_workspace_submissions
  (user_id, idempotency_key, request_hash, outcome, workspace_id, created_at)
SELECT user_id, idempotency_key, request_hash, 'accepted', id, created_at
FROM agent_workspaces;
