-- Visible message copies hold transactional references. Account deletion keeps
-- its explicit attachment cascade; retention never deletes a referenced asset.
CREATE TABLE IF NOT EXISTS chat_attachment_references (
  attachment_id UUID NOT NULL REFERENCES chat_attachments(id) ON DELETE CASCADE,
  message_id CHAR(36) NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  PRIMARY KEY (attachment_id, message_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_attachment_references_message ON chat_attachment_references(message_id);
CREATE INDEX IF NOT EXISTS idx_chat_attachments_created ON chat_attachments(created_at, id);

CREATE OR REPLACE FUNCTION sync_chat_attachment_references() RETURNS TRIGGER AS $$
DECLARE
  attachment_text TEXT;
  attachment_uuid UUID;
BEGIN
  DELETE FROM chat_attachment_references WHERE message_id = NEW.id;
  IF NEW.deleted_at IS NOT NULL OR NEW.recalled_at IS NOT NULL THEN RETURN NEW; END IF;
  IF jsonb_typeof(NEW.metadata->'attachments') = 'array' THEN
    FOR attachment_text IN SELECT DISTINCT entry->>'id'
      FROM jsonb_array_elements(NEW.metadata->'attachments') entry ORDER BY 1
    LOOP
      IF attachment_text IS NULL OR attachment_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RAISE EXCEPTION 'Attachment reference is unavailable'
          USING ERRCODE = '23503', CONSTRAINT = 'chat_attachment_visible_reference';
      END IF;
      -- This lock lives until the message transaction commits. Cleanup uses
      -- FOR UPDATE SKIP LOCKED, so it cannot remove a send in progress.
      SELECT id INTO attachment_uuid FROM chat_attachments
        WHERE id = attachment_text::uuid FOR KEY SHARE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'Attachment reference is unavailable'
          USING ERRCODE = '23503', CONSTRAINT = 'chat_attachment_visible_reference';
      END IF;
      INSERT INTO chat_attachment_references(attachment_id,message_id)
        VALUES(attachment_uuid,NEW.id) ON CONFLICT DO NOTHING;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_chat_attachment_references ON chat_messages;
CREATE TRIGGER trg_chat_attachment_references
  AFTER INSERT OR UPDATE OF metadata, deleted_at, recalled_at ON chat_messages
  FOR EACH ROW EXECUTE FUNCTION sync_chat_attachment_references();

-- Backfill only real, still-visible references; never rewrite message metadata.
INSERT INTO chat_attachment_references(attachment_id,message_id)
SELECT DISTINCT a.id,m.id FROM chat_messages m
CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(m.metadata->'attachments')='array'
  THEN m.metadata->'attachments' ELSE '[]'::jsonb END) entry
JOIN chat_attachments a ON a.id::text=entry->>'id'
WHERE m.deleted_at IS NULL AND m.recalled_at IS NULL
ON CONFLICT DO NOTHING;
