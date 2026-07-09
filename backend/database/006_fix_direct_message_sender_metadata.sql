UPDATE chat_messages m
SET metadata = COALESCE(m.metadata, '{}'::jsonb) || jsonb_build_object('senderUserId', t.peer_user_id)
FROM chat_threads t
JOIN users owner ON owner.id = t.user_id
WHERE m.thread_id = t.id
  AND t.peer_user_id IS NOT NULL
  AND m.sender_type = 'user'
  AND COALESCE(m.metadata ->> 'senderUserId', '') = t.user_id
  AND m.sender_name <> owner.display_name;
