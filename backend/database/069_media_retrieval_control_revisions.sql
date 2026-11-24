ALTER TABLE media_retrieval_operator_controls
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD COLUMN field_revisions JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE FUNCTION track_media_retrieval_control_revisions()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  changed JSONB;
  next_revision INTEGER := OLD.revision + 1;
BEGIN
  SELECT jsonb_object_agg(field.key, next_revision)
  INTO changed
  FROM jsonb_each(to_jsonb(NEW) - ARRAY['id', 'updated_at', 'revision', 'field_revisions']) AS field
  WHERE (to_jsonb(OLD) -> field.key) IS DISTINCT FROM field.value;

  NEW.revision := CASE WHEN changed IS NULL THEN OLD.revision ELSE next_revision END;
  NEW.field_revisions := OLD.field_revisions || COALESCE(changed, '{}'::jsonb);
  RETURN NEW;
END;
$$;

CREATE TRIGGER media_retrieval_control_revisions
BEFORE UPDATE ON media_retrieval_operator_controls
FOR EACH ROW EXECUTE FUNCTION track_media_retrieval_control_revisions();

CREATE INDEX idx_media_retrieval_controls_audit_request
ON usage_events (user_id, (payload ->> 'idempotencyKey'))
WHERE event_type = 'admin.media_retrieval.controls' AND target_id = 'media-retrieval'
  AND (payload ->> 'idempotencyKey') IS NOT NULL;
