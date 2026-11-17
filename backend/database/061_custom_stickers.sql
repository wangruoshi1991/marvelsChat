-- Favorites are independent of thread-scoped attachments and their draft TTL.
-- Soft deletion removes a favorite but never invalidates a visible sent copy.
CREATE TABLE IF NOT EXISTS custom_stickers (
  id UUID PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key UUID NOT NULL,
  request_hash CHAR(64) NOT NULL,
  mime_type VARCHAR(100) NOT NULL CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size BETWEEN 1 AND 2097152),
  width INTEGER NOT NULL CHECK (width BETWEEN 1 AND 512),
  height INTEGER NOT NULL CHECK (height BETWEEN 1 AND 512),
  checksum_sha256 CHAR(64) NOT NULL,
  content BYTEA NOT NULL CHECK (octet_length(content)=byte_size),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  UNIQUE (user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_custom_stickers_owner_created ON custom_stickers(user_id,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE TABLE IF NOT EXISTS custom_sticker_message_references (
  sticker_id UUID NOT NULL REFERENCES custom_stickers(id) ON DELETE CASCADE,
  message_id CHAR(36) NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  PRIMARY KEY (sticker_id,message_id)
);
CREATE INDEX IF NOT EXISTS idx_custom_sticker_references_message ON custom_sticker_message_references(message_id);
CREATE OR REPLACE FUNCTION sync_custom_sticker_message_references() RETURNS TRIGGER AS $$
DECLARE
  sticker custom_stickers%ROWTYPE;
  thread chat_threads%ROWTYPE;
  sticker_text TEXT;
  actor_id TEXT;
  is_origin BOOLEAN;
BEGIN
  DELETE FROM custom_sticker_message_references WHERE message_id=NEW.id;
  IF NEW.deleted_at IS NOT NULL OR NEW.recalled_at IS NOT NULL OR NEW.metadata->'sticker' IS NULL THEN RETURN NEW; END IF;
  sticker_text := NEW.metadata->'sticker'->>'id';
  IF sticker_text IS NULL OR sticker_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Sticker reference is unavailable' USING ERRCODE='23503',CONSTRAINT='custom_sticker_visible_reference';
  END IF;
  SELECT * INTO thread FROM chat_threads WHERE id=NEW.thread_id;
  is_origin := COALESCE(NEW.metadata->>'source' = 'app',FALSE);
  actor_id := CASE WHEN is_origin THEN thread.user_id::text ELSE NEW.metadata->>'senderUserId' END;
  -- FOR SHARE conflicts with favorite deletion (UPDATE), closing the
  -- resolve/send race while allowing concurrent ordinary message sends.
  SELECT * INTO sticker FROM custom_stickers WHERE id=sticker_text::uuid AND user_id=actor_id FOR SHARE;
  IF NOT FOUND OR thread.agent_id IS NOT NULL OR NEW.sender_type <> 'user' OR NEW.content <> '' OR
     jsonb_array_length(CASE WHEN jsonb_typeof(NEW.metadata->'attachments')='array' THEN NEW.metadata->'attachments' ELSE '[]'::jsonb END)>0 THEN
    RAISE EXCEPTION 'Sticker reference is unavailable' USING ERRCODE='23503',CONSTRAINT='custom_sticker_visible_reference';
  END IF;
  IF thread.kind='group' AND is_origin AND NOT EXISTS(SELECT 1 FROM chat_group_members gm WHERE gm.group_id=thread.group_id AND gm.user_id=sticker.user_id AND gm.left_at IS NULL) THEN
    RAISE EXCEPTION 'Sticker membership is unavailable' USING ERRCODE='23503',CONSTRAINT='custom_sticker_visible_reference';
  END IF;
  IF is_origin AND sticker.deleted_at IS NOT NULL AND TG_OP='INSERT' THEN
    RAISE EXCEPTION 'Sticker favorite is unavailable' USING ERRCODE='23503',CONSTRAINT='custom_sticker_visible_reference';
  END IF;
  IF NOT is_origin AND NEW.metadata->>'source'='direct' AND NOT EXISTS(
    SELECT 1 FROM chat_messages origin JOIN chat_threads source_thread ON source_thread.id=origin.thread_id
    WHERE source_thread.user_id=sticker.user_id AND source_thread.peer_user_id=thread.user_id
      AND origin.metadata->>'source'='app' AND origin.metadata->'sticker'->>'id'=sticker_text
      AND origin.client_message_id=NEW.client_message_id
      AND origin.metadata->>'requestFingerprint'=NEW.metadata->>'requestFingerprint'
      AND origin.deleted_at IS NULL AND origin.recalled_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Sticker source is unavailable' USING ERRCODE='23503',CONSTRAINT='custom_sticker_visible_reference';
  END IF;
  IF NOT is_origin AND (NEW.metadata->>'source' IS DISTINCT FROM 'direct') AND
    (NEW.metadata->>'source' IS DISTINCT FROM 'group' OR (sticker.deleted_at IS NOT NULL AND TG_OP='INSERT') OR NOT EXISTS(
      SELECT 1 FROM chat_group_members gm WHERE gm.group_id=thread.group_id AND gm.user_id=sticker.user_id AND gm.left_at IS NULL
    )) THEN
    RAISE EXCEPTION 'Sticker source is unavailable' USING ERRCODE='23503',CONSTRAINT='custom_sticker_visible_reference';
  END IF;
  INSERT INTO custom_sticker_message_references(sticker_id,message_id) VALUES(sticker.id,NEW.id) ON CONFLICT DO NOTHING;
  IF TG_OP='INSERT' AND is_origin THEN
    INSERT INTO usage_events(id,user_id,event_type,target_type,target_id,payload)
      VALUES(gen_random_uuid()::text,sticker.user_id,'custom_sticker.send','message',NEW.id,jsonb_build_object('stickerId',sticker.id));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_custom_sticker_message_references ON chat_messages;
CREATE TRIGGER trg_custom_sticker_message_references AFTER INSERT OR UPDATE OF metadata,deleted_at,recalled_at ON chat_messages
FOR EACH ROW EXECUTE FUNCTION sync_custom_sticker_message_references();
