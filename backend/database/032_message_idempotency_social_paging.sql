CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_thread_client_message
  ON chat_messages (thread_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_messages_owner_client_message
  ON chat_messages (user_id, client_message_id)
  WHERE client_message_id IS NOT NULL
    AND sender_type = 'user'
    AND metadata ->> 'source' = 'app';

CREATE UNIQUE INDEX IF NOT EXISTS uniq_chat_agent_run_input
  ON agent_runs (input_message_id)
  WHERE input_message_id IS NOT NULL AND run_type = 'chat';

CREATE INDEX IF NOT EXISTS idx_social_relationships_follower_page
  ON social_relationships (follower_user_id, relation_type, status, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_social_relationships_followed_page
  ON social_relationships (followed_user_id, relation_type, status, created_at DESC, id DESC);
