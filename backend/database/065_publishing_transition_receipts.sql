ALTER TABLE agent_release_status_history ADD COLUMN transition_receipt JSONB;
ALTER TABLE product_status_history ADD COLUMN transition_receipt JSONB;

CREATE INDEX idx_release_transition_receipt
  ON agent_release_status_history (release_id, actor_user_id, request_id)
  WHERE transition_receipt IS NOT NULL;
CREATE INDEX idx_product_transition_receipt
  ON product_status_history (product_id, actor_user_id, request_id)
  WHERE transition_receipt IS NOT NULL;
