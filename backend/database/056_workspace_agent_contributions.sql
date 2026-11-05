CREATE INDEX idx_agent_workspace_nodes_owner_agent_updated
  ON agent_workspace_nodes (user_id, agent_id, updated_at DESC, id DESC);
