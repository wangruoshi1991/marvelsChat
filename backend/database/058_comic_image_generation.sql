-- Comic rendering has a dedicated public contract; legacy task rows remain v1.
ALTER TABLE station_comic_diaries ADD CONSTRAINT uniq_station_comic_diary_owner UNIQUE (id, user_id);
ALTER TABLE ai_tasks ADD COLUMN comic_diary_id CHAR(36);
ALTER TABLE ai_tasks DROP CONSTRAINT ai_tasks_contract_version_check;
ALTER TABLE ai_tasks DROP CONSTRAINT ai_tasks_kind_check;
ALTER TABLE ai_tasks DROP CONSTRAINT ai_tasks_status_check;
ALTER TABLE ai_tasks DROP CONSTRAINT ai_tasks_phase_check;
ALTER TABLE ai_tasks DROP CONSTRAINT chk_ai_task_source;
ALTER TABLE ai_tasks ADD CONSTRAINT chk_ai_task_kind CHECK (kind IN ('agent_message','site_draft','comic_render'));
ALTER TABLE ai_tasks ADD CONSTRAINT chk_ai_task_contract_version CHECK (
  (kind IN ('agent_message','site_draft') AND contract_version = 1)
  OR (kind = 'comic_render' AND contract_version = 2)
);
ALTER TABLE ai_tasks ADD CONSTRAINT chk_ai_task_status CHECK (
  status IN ('queued','running','awaiting_confirmation','succeeded','partially_succeeded','failed','cancelled','interrupted')
  AND (status <> 'partially_succeeded' OR kind = 'comic_render')
  AND (kind <> 'comic_render' OR status <> 'awaiting_confirmation')
);
ALTER TABLE ai_tasks ADD CONSTRAINT chk_ai_task_phase CHECK (
  phase IN ('queued','validating','generating','searching','rendering','awaiting_confirmation','completed','failed','cancelled','interrupted')
  AND (phase <> 'rendering' OR kind = 'comic_render')
  AND (kind <> 'comic_render' OR phase IN ('queued','validating','rendering','completed','failed','cancelled','interrupted'))
);
ALTER TABLE ai_tasks ADD CONSTRAINT chk_ai_task_source CHECK (
  (kind = 'agent_message' AND thread_id IS NOT NULL AND input_message_id IS NOT NULL AND comic_diary_id IS NULL)
  OR (kind = 'site_draft' AND thread_id IS NULL AND input_message_id IS NULL AND comic_diary_id IS NULL)
  OR (kind = 'comic_render' AND thread_id IS NULL AND input_message_id IS NULL AND comic_diary_id IS NOT NULL
      AND agent_id = 'comic-diary' AND artifacts = '[]'::jsonb AND approval IS NULL AND context_refs = '[]'::jsonb)
);
ALTER TABLE ai_tasks ADD CONSTRAINT fk_ai_task_comic_owner FOREIGN KEY (comic_diary_id,user_id)
  REFERENCES station_comic_diaries(id,user_id) ON DELETE CASCADE;
ALTER TABLE ai_tasks ADD CONSTRAINT uniq_ai_task_owner_kind UNIQUE (id,user_id,kind);
CREATE INDEX idx_ai_tasks_comic_owner ON ai_tasks(user_id,comic_diary_id,created_at DESC) WHERE kind = 'comic_render';

CREATE TABLE comic_task_outputs (
  task_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  task_kind VARCHAR(24) NOT NULL DEFAULT 'comic_render' CHECK (task_kind = 'comic_render'),
  frame_index INTEGER NOT NULL CHECK (frame_index BETWEEN 1 AND 8),
  status TEXT NOT NULL CHECK (status IN ('queued','running','succeeded','failed','unknown','skipped')),
  media_asset_id CHAR(36),
  safe_error_code VARCHAR(100) CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[A-Za-z][A-Za-z0-9._-]{0,99}$'),
  provider_request_id VARCHAR(500),
  provider_metadata JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_metadata) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (task_id,frame_index),
  CONSTRAINT fk_comic_output_task_owner FOREIGN KEY (task_id,user_id,task_kind) REFERENCES ai_tasks(id,user_id,kind) ON DELETE CASCADE,
  CONSTRAINT fk_comic_output_media_owner FOREIGN KEY (media_asset_id,user_id) REFERENCES station_media_assets(id,user_id) ON DELETE SET NULL (media_asset_id),
  CONSTRAINT chk_comic_output_asset CHECK (media_asset_id IS NULL OR status = 'succeeded')
);

ALTER TABLE ai_task_events DROP CONSTRAINT ai_task_events_payload_check;
ALTER TABLE ai_task_events ADD CONSTRAINT chk_ai_task_event_safe_payload CHECK (
  jsonb_typeof(payload) = 'object' AND payload ?& ARRAY['status','phase']
  AND (payload - ARRAY['status','phase','errorCode','total','succeeded','failed','unknown']) = '{}'::jsonb
  AND ((NOT (payload ?| ARRAY['total','succeeded','failed','unknown'])) OR (
    payload ?& ARRAY['total','succeeded','failed','unknown']
    AND (payload -> 'total')::text ~ '^[0-8]$'
    AND (payload -> 'succeeded')::text ~ '^[0-8]$'
    AND (payload -> 'failed')::text ~ '^[0-8]$'
    AND (payload -> 'unknown')::text ~ '^[0-8]$'
  ))
);

CREATE TABLE ai_task_worker_heartbeats (
  instance_id VARCHAR(160) PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN ('starting','ready','stopped')),
  capabilities JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(capabilities) = 'array'),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_ai_task_worker_recent ON ai_task_worker_heartbeats(last_seen_at DESC) WHERE state = 'ready';

-- Deliberately no owner/task/asset FK: deletion must retain private-object cleanup intent.
CREATE TABLE comic_render_cleanup_journal (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36),
  task_id CHAR(36),
  media_asset_id CHAR(36),
  frame_index INTEGER CHECK (frame_index BETWEEN 1 AND 8),
  bucket VARCHAR(255) NOT NULL,
  object_key VARCHAR(512) NOT NULL UNIQUE,
  state TEXT NOT NULL CHECK (state IN ('pending','stored','cleanup_required')),
  last_error_code VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX idx_comic_render_cleanup ON comic_render_cleanup_journal(state,updated_at);
