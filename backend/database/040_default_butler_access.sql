-- Every account starts with the built-in Butler available. This is an explicit
-- product default, so existing disabled or incomplete Butler rows are brought
-- to the current complete grant as well. Existing aliases are preserved.
-- UUID-shaped deterministic ids make this migration repeatable without
-- requiring a database extension; the migration ledger still applies it once.
INSERT INTO user_agents (user_id, agent_id, alias, enabled, granted_scopes)
SELECT
  users.id,
  'miaoxun-butler',
  '妙讯管家',
  TRUE,
  '["profile:read","messages:read","agents:invoke","station:read","album:read"]'::jsonb
FROM users
WHERE TRUE
ON CONFLICT (user_id, agent_id) DO UPDATE SET
  alias = user_agents.alias,
  enabled = TRUE,
  granted_scopes = EXCLUDED.granted_scopes,
  updated_at = CURRENT_TIMESTAMP
WHERE user_agents.enabled IS DISTINCT FROM TRUE
   OR user_agents.granted_scopes IS DISTINCT FROM EXCLUDED.granted_scopes;

-- A pre-existing thread may have been marked stopped while its access row was
-- disabled. The default now enables that access, so bring its status back in
-- sync without replacing the owner's existing title or messages.
UPDATE chat_threads
SET status_text = '在线 · Agent',
    kind = 'agent',
    updated_at = CURRENT_TIMESTAMP
WHERE agent_id = 'miaoxun-butler'
  AND (status_text IS DISTINCT FROM '在线 · Agent' OR kind IS DISTINCT FROM 'agent')
  AND user_id IN (
    SELECT user_id
    FROM user_agents
    WHERE agent_id = 'miaoxun-butler' AND enabled = TRUE
  );

INSERT INTO chat_threads
  (id, user_id, title, status_text, avatar_text, agent_id, kind, pinned)
SELECT
  substr(md5(users.id || ':miaoxun-butler:thread'), 1, 8) || '-' ||
    substr(md5(users.id || ':miaoxun-butler:thread'), 9, 4) || '-' ||
    substr(md5(users.id || ':miaoxun-butler:thread'), 13, 4) || '-' ||
    substr(md5(users.id || ':miaoxun-butler:thread'), 17, 4) || '-' ||
    substr(md5(users.id || ':miaoxun-butler:thread'), 21, 12),
  users.id,
  COALESCE(NULLIF(user_agents.alias, ''), '妙讯管家'),
  '在线 · Agent',
  LEFT(COALESCE(NULLIF(user_agents.alias, ''), '妙讯管家'), 1),
  'miaoxun-butler',
  'agent',
  FALSE
FROM users
JOIN user_agents
  ON user_agents.user_id = users.id
 AND user_agents.agent_id = 'miaoxun-butler'
 AND user_agents.enabled = TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM chat_threads
  WHERE chat_threads.user_id = users.id
    AND chat_threads.agent_id = 'miaoxun-butler'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO chat_messages
  (id, thread_id, user_id, sender_type, sender_name, content, metadata)
SELECT
  substr(md5(threads.id || ':miaoxun-butler:welcome'), 1, 8) || '-' ||
    substr(md5(threads.id || ':miaoxun-butler:welcome'), 9, 4) || '-' ||
    substr(md5(threads.id || ':miaoxun-butler:welcome'), 13, 4) || '-' ||
    substr(md5(threads.id || ':miaoxun-butler:welcome'), 17, 4) || '-' ||
    substr(md5(threads.id || ':miaoxun-butler:welcome'), 21, 12),
  threads.id,
  users.id,
  'agent',
  COALESCE(NULLIF(user_agents.alias, ''), '妙讯管家'),
  COALESCE(NULLIF(user_agents.alias, ''), '妙讯管家') || ' 已添加，可以开始对话。',
  '{"source":"account_default","agentId":"miaoxun-butler"}'::jsonb
FROM users
JOIN chat_threads threads
  ON threads.user_id = users.id
 AND threads.agent_id = 'miaoxun-butler'
JOIN user_agents
  ON user_agents.user_id = users.id
 AND user_agents.agent_id = 'miaoxun-butler'
 AND user_agents.enabled = TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM chat_messages
  WHERE chat_messages.thread_id = threads.id
)
ON CONFLICT (id) DO NOTHING;
