-- Chat proposals are immutable content; confirmation is separate from 058 execution.
ALTER TABLE chat_threads ADD CONSTRAINT uniq_chat_thread_content_owner UNIQUE (id,user_id);
ALTER TABLE chat_messages ADD CONSTRAINT uniq_chat_message_content_owner UNIQUE (id,user_id,thread_id);
ALTER TABLE station_diary_entries ADD CONSTRAINT uniq_station_diary_content_owner UNIQUE (id,user_id);
CREATE TABLE chat_content_previews (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  thread_id CHAR(36) NOT NULL,
  input_message_id CHAR(36) NOT NULL,
  output_message_id CHAR(36),
  kind TEXT NOT NULL CHECK (kind IN ('comic','diary')),
  schema_version INTEGER NOT NULL DEFAULT 1 CHECK (schema_version=1),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision>0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','rejected','expired','superseded','revoked')),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot)='object'),
  snapshot_hash CHAR(64) NOT NULL CHECK (snapshot_hash ~ '^[a-f0-9]{64}$'),
  source_snapshots JSONB NOT NULL CHECK (jsonb_typeof(source_snapshots)='array'),
  context_refs JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(context_refs)='array' AND jsonb_array_length(context_refs)<=6),
  authority_snapshot JSONB NOT NULL CHECK (jsonb_typeof(authority_snapshot)='object'),
  base_preview_id CHAR(36),
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  accepted_revision INTEGER,
  accepted_hash CHAR(64),
  confirmation_key VARCHAR(160),
  comic_diary_id CHAR(36),
  comic_render_task_id CHAR(36),
  diary_entry_id CHAR(36),
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (id,user_id),
  UNIQUE (input_message_id,kind),
  FOREIGN KEY (thread_id,user_id) REFERENCES chat_threads(id,user_id) ON DELETE CASCADE,
  FOREIGN KEY (input_message_id,user_id,thread_id) REFERENCES chat_messages(id,user_id,thread_id) ON DELETE CASCADE,
  FOREIGN KEY (output_message_id,user_id,thread_id) REFERENCES chat_messages(id,user_id,thread_id) ON DELETE CASCADE,
  FOREIGN KEY (comic_diary_id,user_id) REFERENCES station_comic_diaries(id,user_id),
  FOREIGN KEY (comic_render_task_id,user_id) REFERENCES ai_tasks(id,user_id),
  FOREIGN KEY (diary_entry_id,user_id) REFERENCES station_diary_entries(id,user_id),
  CHECK ((status='confirmed' AND accepted_revision IS NOT NULL AND accepted_hash=snapshot_hash AND confirmation_key IS NOT NULL AND confirmed_at IS NOT NULL
    AND ((kind='comic' AND comic_diary_id IS NOT NULL AND comic_render_task_id IS NOT NULL AND diary_entry_id IS NULL)
      OR (kind='diary' AND diary_entry_id IS NOT NULL AND comic_diary_id IS NULL AND comic_render_task_id IS NULL)))
    OR (status<>'confirmed' AND accepted_revision IS NULL AND accepted_hash IS NULL AND confirmed_at IS NULL
      AND comic_diary_id IS NULL AND comic_render_task_id IS NULL AND diary_entry_id IS NULL))
);
CREATE UNIQUE INDEX uniq_chat_content_comic ON chat_content_previews(comic_diary_id) WHERE comic_diary_id IS NOT NULL;
CREATE UNIQUE INDEX uniq_chat_content_render ON chat_content_previews(comic_render_task_id) WHERE comic_render_task_id IS NOT NULL;
CREATE INDEX idx_chat_content_owner_thread ON chat_content_previews(user_id,thread_id,created_at DESC);

CREATE FUNCTION protect_chat_content_snapshot() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF ROW(NEW.user_id,NEW.thread_id,NEW.input_message_id,NEW.kind,NEW.schema_version,NEW.snapshot,NEW.snapshot_hash,
         NEW.source_snapshots,NEW.context_refs,NEW.authority_snapshot,NEW.base_preview_id,NEW.request_hash)
     IS DISTINCT FROM ROW(OLD.user_id,OLD.thread_id,OLD.input_message_id,OLD.kind,OLD.schema_version,OLD.snapshot,OLD.snapshot_hash,
         OLD.source_snapshots,OLD.context_refs,OLD.authority_snapshot,OLD.base_preview_id,OLD.request_hash) THEN
    RAISE EXCEPTION 'Chat content snapshot is immutable' USING ERRCODE='23514';
  END IF;
  IF OLD.status='confirmed' AND ROW(NEW.status,NEW.accepted_revision,NEW.accepted_hash,NEW.confirmation_key,NEW.confirmed_at,
      NEW.comic_diary_id,NEW.comic_render_task_id,NEW.diary_entry_id) IS DISTINCT FROM
      ROW(OLD.status,OLD.accepted_revision,OLD.accepted_hash,OLD.confirmation_key,OLD.confirmed_at,OLD.comic_diary_id,OLD.comic_render_task_id,OLD.diary_entry_id) THEN
    RAISE EXCEPTION 'Confirmed chat content receipt is immutable' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_protect_chat_content_snapshot BEFORE UPDATE ON chat_content_previews
  FOR EACH ROW EXECUTE FUNCTION protect_chat_content_snapshot();
