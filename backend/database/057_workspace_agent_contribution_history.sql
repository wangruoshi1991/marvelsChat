CREATE INDEX idx_agent_workspace_nodes_owner_agent_created
  ON agent_workspace_nodes (user_id, agent_id, created_at DESC, id DESC)
  WHERE capability <> 'workspace.coordinate';
