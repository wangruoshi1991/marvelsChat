-- One workspace keeps its original goal and authorization across explicit
-- owner-requested revisions. The aggregate is the current round's live state;
-- earlier rounds are frozen in the same transaction that opens a new round.
ALTER TABLE agent_workspaces ADD COLUMN current_round INTEGER NOT NULL DEFAULT 1 CHECK (current_round > 0);
ALTER TABLE agent_workspace_nodes ADD COLUMN round_number INTEGER NOT NULL DEFAULT 1 CHECK (round_number > 0);
ALTER TABLE agent_workspace_nodes ADD CONSTRAINT uniq_agent_workspace_node_round_owner
  UNIQUE (id, workspace_id, user_id);

CREATE TABLE agent_workspace_rounds (
  workspace_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  round_number INTEGER NOT NULL CHECK (round_number > 0),
  instruction TEXT NOT NULL CHECK (length(instruction) BETWEEN 1 AND 2000),
  base_result_node_id CHAR(36),
  result_node_id CHAR(36),
  status VARCHAR(32) NOT NULL CHECK (status IN
    ('queued', 'running', 'waiting_input', 'awaiting_confirmation', 'succeeded', 'failed', 'interrupted', 'cancelling', 'cancelled')),
  summary TEXT NOT NULL DEFAULT '' CHECK (length(summary) <= 2000),
  result JSONB CHECK (result IS NULL OR jsonb_typeof(result) = 'object'),
  approval JSONB CHECK (approval IS NULL OR jsonb_typeof(approval) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (workspace_id, round_number),
  CONSTRAINT uniq_agent_workspace_round_owner UNIQUE (workspace_id, round_number, user_id),
  CONSTRAINT fk_agent_workspace_round_owner FOREIGN KEY (workspace_id, user_id)
    REFERENCES agent_workspaces (id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_agent_workspace_round_base FOREIGN KEY (base_result_node_id, workspace_id, user_id)
    REFERENCES agent_workspace_nodes (id, workspace_id, user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT fk_agent_workspace_round_result FOREIGN KEY (result_node_id, workspace_id, user_id)
    REFERENCES agent_workspace_nodes (id, workspace_id, user_id) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT chk_agent_workspace_round_base CHECK ((round_number = 1 AND base_result_node_id IS NULL)
    OR (round_number > 1 AND base_result_node_id IS NOT NULL))
);

-- A legacy final delivery must name the actual successful originating node.
-- Never infer lineage from a matching title or a client-visible page id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM agent_workspaces workspace
    WHERE workspace.result IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM agent_workspace_nodes node
      WHERE node.workspace_id = workspace.id AND node.user_id = workspace.user_id
        AND node.node_key = workspace.result->>'resultKey' AND node.status = 'succeeded'
        AND node.capability <> 'workspace.coordinate'
        AND node.result->'artifact' = workspace.result->'artifact'
    )
  ) THEN RAISE EXCEPTION 'WORKSPACE_ROUND_RESULT_LINEAGE_INVALID'; END IF;
END $$;

INSERT INTO agent_workspace_rounds
  (workspace_id, user_id, round_number, instruction, result_node_id, status, summary, result, approval, created_at, completed_at)
SELECT workspace.id, workspace.user_id, 1, workspace.goal, node.id, workspace.status, workspace.summary,
  workspace.result, workspace.approval, workspace.created_at,
  CASE WHEN workspace.status IN ('succeeded','failed','interrupted','cancelled') THEN workspace.updated_at END
FROM agent_workspaces workspace
LEFT JOIN agent_workspace_nodes node ON node.workspace_id = workspace.id AND node.user_id = workspace.user_id
  AND node.node_key = workspace.result->>'resultKey';

ALTER TABLE agent_workspace_nodes ADD CONSTRAINT fk_agent_workspace_node_round
  FOREIGN KEY (workspace_id, round_number, user_id)
  REFERENCES agent_workspace_rounds (workspace_id, round_number, user_id) DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE agent_workspaces ADD CONSTRAINT fk_agent_workspace_current_round
  FOREIGN KEY (id, current_round, user_id)
  REFERENCES agent_workspace_rounds (workspace_id, round_number, user_id) DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE agent_workspace_continuations (
  workspace_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  idempotency_key VARCHAR(160) NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  round_number INTEGER NOT NULL CHECK (round_number > 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (workspace_id, idempotency_key),
  CONSTRAINT uniq_agent_workspace_continuation_round UNIQUE (workspace_id, round_number),
  CONSTRAINT fk_agent_workspace_continuation_round FOREIGN KEY (workspace_id, round_number, user_id)
    REFERENCES agent_workspace_rounds (workspace_id, round_number, user_id) ON DELETE CASCADE
);

ALTER TABLE agent_workspaces DROP CONSTRAINT agent_workspaces_last_operation_check;
ALTER TABLE agent_workspaces ADD CONSTRAINT agent_workspaces_last_operation_check
  CHECK (last_operation IN ('cancel', 'confirm', 'reject', 'reply', 'continue'));

-- This compatibility expansion changes only the supported shape of a page
-- handoff, never scopes or agent identity. Unknown/custom declarations stay
-- unchanged and fail the runtime's exact declaration check rather than gaining
-- authority. Agent versions remain pinned to the existing registered version.
WITH known AS (
  SELECT '{"agentId":"site-builder","agentVersion":"0.3.4","capability":"site.compose","description":"根据目标生成私有结构页面草稿。可接收用户选中消息/照片/日记及真实素材、专业文字成果；仅使用精确交付的内容和资源。依赖素材不得丢弃成纯文字页面，生成后需用户预览确认。","inputKinds":["chat-message","station-photo","station-diary"],"dependencyKinds":["media_selection","text_result"],"outputKind":"site_draft","requiredScopes":["profile:read","messages:read","station:read","station:write","album:read"]}'::jsonb AS declaration
), upgrades AS (
  SELECT workspace.id, jsonb_agg(CASE WHEN entry.value = known.declaration
    THEN jsonb_set(entry.value, '{dependencyKinds}', '["media_selection","text_result","site_draft"]'::jsonb)
    ELSE entry.value END ORDER BY entry.ordinality) AS capabilities
  FROM agent_workspaces workspace CROSS JOIN known
  CROSS JOIN LATERAL jsonb_array_elements(workspace.authority->'capabilities') WITH ORDINALITY entry
  WHERE jsonb_typeof(workspace.authority->'capabilities') = 'array'
  GROUP BY workspace.id
  HAVING bool_or(entry.value = known.declaration)
)
UPDATE agent_workspaces workspace SET authority = jsonb_set(workspace.authority, '{capabilities}', upgrades.capabilities)
FROM upgrades WHERE workspace.id = upgrades.id;
