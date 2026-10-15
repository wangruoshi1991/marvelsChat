-- Pending collaboration pages inherit their node's complete authorization.
-- Confirming a page clears this binding in the same transaction as its save;
-- a saved page remains independent when another page becomes current.
ALTER TABLE agent_workspace_nodes
  ADD CONSTRAINT uniq_agent_workspace_node_owner UNIQUE (id, user_id);

ALTER TABLE station_site_drafts ADD COLUMN workspace_node_id CHAR(36);

-- Refuse ambiguous/cross-account history. Never guess an owning node or turn
-- a conflicting collaboration result into an independently readable page.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM station_site_drafts draft
    JOIN agent_workspace_nodes node ON node.result->'artifact'->>'kind' = 'site_draft'
      AND node.result->'artifact'->>'id' = draft.id
    WHERE node.user_id <> draft.user_id OR node.agent_id <> 'site-builder'
      OR node.capability <> 'site.compose' OR node.status <> 'succeeded'
  ) THEN
    RAISE EXCEPTION 'WORKSPACE_SITE_DRAFT_OWNERSHIP_CONFLICT';
  END IF;
  IF EXISTS (
    SELECT draft.id FROM station_site_drafts draft
    JOIN agent_workspace_nodes node ON node.result->'artifact'->>'kind' = 'site_draft'
      AND node.result->'artifact'->>'id' = draft.id
    GROUP BY draft.id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'WORKSPACE_SITE_DRAFT_OWNERSHIP_AMBIGUOUS';
  END IF;
END $$;

UPDATE station_site_drafts draft SET workspace_node_id = node.id
FROM agent_workspace_nodes node JOIN agent_workspaces workspace ON workspace.id = node.workspace_id
WHERE node.result->'artifact'->>'kind' = 'site_draft'
  AND node.result->'artifact'->>'id' = draft.id
  AND node.user_id = draft.user_id AND draft.status <> 'applied'
  AND NOT COALESCE((workspace.status = 'succeeded' AND workspace.last_operation = 'confirm' AND workspace.result->'artifact'->>'kind' = 'site_draft'
    AND workspace.result->'artifact'->>'id' = draft.id AND workspace.result->>'resultKey' = node.node_key), false);

ALTER TABLE station_site_drafts
  ADD CONSTRAINT fk_station_site_draft_workspace_owner FOREIGN KEY (workspace_node_id, user_id)
    REFERENCES agent_workspace_nodes (id, user_id) ON DELETE CASCADE,
  ADD CONSTRAINT uniq_station_site_draft_workspace_node UNIQUE (workspace_node_id),
  ADD CONSTRAINT chk_station_site_draft_saved_ownership CHECK (status <> 'applied' OR workspace_node_id IS NULL);
