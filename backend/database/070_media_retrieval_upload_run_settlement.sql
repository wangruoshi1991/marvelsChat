-- Legacy upload notifications could leave a run with no bound job or provider charge.
WITH blocked AS (
  UPDATE agent_runs AS run
  SET lifecycle_status = 'blocked', status = 'error',
      failure_code = 'retrieval_index_enqueue_failed', finished_at = CURRENT_TIMESTAMP
  WHERE run.agent_id = 'media-retrieval' AND run.run_type = 'media-index'
    AND run.input_summary ->> 'source' = 'upload'
    AND run.lifecycle_status IN ('accepted', 'queued')
    AND NOT EXISTS (SELECT 1 FROM media_retrieval_jobs job WHERE job.agent_run_id = run.id)
    AND NOT EXISTS (SELECT 1 FROM media_retrieval_cost_ledger cost WHERE cost.agent_run_id = run.id)
    AND NOT EXISTS (
      SELECT 1 FROM agent_run_events event
      WHERE event.agent_run_id = run.id AND event.event_type NOT IN ('accepted', 'queued')
    )
  RETURNING run.id, run.user_id
)
INSERT INTO agent_run_events
  (id, agent_run_id, user_id, sequence, lifecycle_status, event_type, payload, delivery_key)
SELECT gen_random_uuid(), blocked.id, blocked.user_id,
  COALESCE((SELECT MAX(sequence) FROM agent_run_events WHERE agent_run_id = blocked.id), 0) + 1,
  'blocked', 'upload-job-missing', '{"reasonCode":"retrieval_index_enqueue_failed"}'::jsonb,
  'upload-job-missing:' || blocked.id
FROM blocked;

CREATE FUNCTION settle_media_retrieval_deleted_upload_runs()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- The earlier delete trigger already cancelled queued/running jobs and removed
  -- derived data. This trigger closes only the runs owned by upload notifications.
  WITH cancelled AS (
    UPDATE agent_runs run
    SET lifecycle_status = 'cancelled', status = 'error', failure_code = 'asset_not_indexable',
        finished_at = CURRENT_TIMESTAMP
    WHERE run.user_id = NEW.user_id AND run.agent_id = 'media-retrieval' AND run.run_type = 'media-index'
      AND run.input_summary ->> 'source' = 'upload'
      AND run.lifecycle_status IN ('accepted', 'queued', 'running')
      AND EXISTS (
        SELECT 1 FROM media_retrieval_jobs job
        WHERE job.agent_run_id = run.id AND job.user_id = NEW.user_id AND job.media_asset_id = NEW.id
          AND job.status = 'cancelled' AND job.failure_code IN ('asset_not_indexable', 'retrieval_purge_requested')
      )
      AND NOT EXISTS (
        SELECT 1 FROM media_retrieval_jobs job
        WHERE job.agent_run_id = run.id AND job.status <> 'cancelled'
      )
    RETURNING run.id, run.user_id
  )
  INSERT INTO agent_run_events
    (id, agent_run_id, user_id, sequence, lifecycle_status, event_type, payload, delivery_key)
  SELECT gen_random_uuid(), cancelled.id, cancelled.user_id,
    COALESCE((SELECT MAX(sequence) FROM agent_run_events WHERE agent_run_id = cancelled.id), 0) + 1,
    'cancelled', 'upload-asset-deleted', '{"reasonCode":"asset_not_indexable"}'::jsonb,
    'upload-asset-deleted:' || cancelled.id
  FROM cancelled;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_station_media_settle_deleted_upload_runs
AFTER UPDATE OF deleted_at ON station_media_assets
FOR EACH ROW
WHEN (OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL)
EXECUTE FUNCTION settle_media_retrieval_deleted_upload_runs();
