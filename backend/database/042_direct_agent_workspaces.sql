-- Direct specialist work shares the existing durable workspace, node and
-- round lifecycle. Existing coordinated requests and hashes are unchanged.
ALTER TABLE agent_workspaces ADD COLUMN execution_mode VARCHAR(16) NOT NULL DEFAULT 'coordinated'
  CHECK (execution_mode IN ('coordinated', 'direct'));
ALTER TABLE agent_workspaces ADD COLUMN origin JSONB;
ALTER TABLE agent_workspaces ALTER COLUMN coordinator_version DROP NOT NULL;
ALTER TABLE agent_workspaces ADD CONSTRAINT chk_agent_workspace_execution_origin CHECK ((
  (execution_mode = 'coordinated' AND coordinator_version IS NOT NULL AND origin IS NULL)
  OR (execution_mode = 'direct' AND coordinator_version IS NULL
    AND jsonb_typeof(origin) = 'object'
    AND origin ?& ARRAY['kind','threadId','inputMessageId','agentId','agentVersion','capability']
    AND (origin - ARRAY['kind','threadId','inputMessageId','agentId','agentVersion','capability']) = '{}'::jsonb
    AND origin->>'kind' = 'agent_conversation'
    AND jsonb_typeof(origin->'threadId') = 'string'
    AND origin->>'threadId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND jsonb_typeof(origin->'inputMessageId') = 'string'
    AND origin->>'inputMessageId' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    AND jsonb_typeof(origin->'agentId') = 'string' AND length(origin->>'agentId') BETWEEN 1 AND 120
    AND jsonb_typeof(origin->'agentVersion') = 'string' AND length(origin->>'agentVersion') BETWEEN 1 AND 80
    AND jsonb_typeof(origin->'capability') = 'string' AND length(origin->>'capability') BETWEEN 1 AND 120)
) IS TRUE);

-- JSON provenance is not a client-selected permission. Enforce the same
-- account/thread/user-input identity at insertion as well as in the service.
-- Source deletion does not erase paid-call receipts or silently rerun tasks;
-- the runtime revalidates the source chain before execution and delivery.
CREATE FUNCTION validate_direct_workspace_origin() RETURNS trigger AS $$
BEGIN
  IF NEW.execution_mode = 'direct' AND NOT EXISTS (
    SELECT 1 FROM chat_threads thread JOIN chat_messages message ON message.thread_id = thread.id
    WHERE thread.id = NEW.origin->>'threadId' AND thread.user_id = NEW.user_id
      AND thread.kind = 'agent' AND thread.agent_id = NEW.origin->>'agentId' AND thread.peer_user_id IS NULL
      AND message.id = NEW.origin->>'inputMessageId' AND message.user_id = NEW.user_id
      AND message.sender_type = 'user' AND message.deleted_at IS NULL AND message.recalled_at IS NULL
  ) THEN RAISE EXCEPTION 'WORKSPACE_DIRECT_ORIGIN_INVALID' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_direct_workspace_origin
  BEFORE INSERT OR UPDATE OF execution_mode, origin, user_id ON agent_workspaces
  FOR EACH ROW EXECUTE FUNCTION validate_direct_workspace_origin();
