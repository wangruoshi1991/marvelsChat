-- Metadata edits and album moves must not invalidate visual embeddings.
ALTER TABLE station_media_assets ADD COLUMN content_revision_at TIMESTAMPTZ;
-- Before this revision column existed, metadata and file changes shared updated_at.
-- Preserve that conservative boundary; old indexes predating it require explicit reindexing.
ALTER TABLE station_media_assets DISABLE TRIGGER trg_station_media_touch_updated_at;
UPDATE station_media_assets SET content_revision_at = updated_at;
ALTER TABLE station_media_assets ENABLE TRIGGER trg_station_media_touch_updated_at;
ALTER TABLE station_media_assets ALTER COLUMN content_revision_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE station_media_assets ALTER COLUMN content_revision_at SET NOT NULL;

CREATE FUNCTION station_media_content_revision() RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.storage_key, NEW.byte_size, NEW.mime_type, NEW.kind, NEW.metadata ->> 'uploadEtag')
     IS DISTINCT FROM
     (OLD.storage_key, OLD.byte_size, OLD.mime_type, OLD.kind, OLD.metadata ->> 'uploadEtag') THEN
    NEW.content_revision_at := clock_timestamp();
  ELSE
    NEW.content_revision_at := OLD.content_revision_at;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_station_media_content_revision BEFORE UPDATE ON station_media_assets
FOR EACH ROW EXECUTE FUNCTION station_media_content_revision();

-- Soft deletion must remove derived private data, including staged worker output.
CREATE FUNCTION station_media_delete_retrieval_data() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE media_retrieval_jobs SET status = 'cancelled', failure_code = 'asset_not_indexable'
    WHERE media_asset_id = NEW.id AND user_id = NEW.user_id AND status IN ('queued', 'running');
    DELETE FROM media_retrieval_segment_staging WHERE media_asset_id = NEW.id AND user_id = NEW.user_id;
    DELETE FROM media_retrieval_segments WHERE media_asset_id = NEW.id AND user_id = NEW.user_id;
    UPDATE agent_run_events e SET payload = jsonb_set(e.payload, '{searchResponse,results}', (
      SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
      FROM jsonb_array_elements(e.payload -> 'searchResponse' -> 'results') item
      WHERE item ->> 'mediaAssetId' <> NEW.id
    ))
    WHERE e.user_id = NEW.user_id AND e.payload -> 'searchResponse' -> 'results' IS NOT NULL
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.payload -> 'searchResponse' -> 'results') item
        WHERE item ->> 'mediaAssetId' = NEW.id);
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER trg_station_media_delete_retrieval_data AFTER UPDATE ON station_media_assets
FOR EACH ROW EXECUTE FUNCTION station_media_delete_retrieval_data();
