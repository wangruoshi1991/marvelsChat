ALTER TABLE chat_threads ADD COLUMN unread_delivered bigint NOT NULL DEFAULT 0;
ALTER TABLE chat_threads ADD COLUMN preferences_revision bigint NOT NULL DEFAULT 0;
ALTER TABLE chat_messages ADD COLUMN unread_sequence bigint;

-- Existing unread counts are the initial unread position for each thread.
UPDATE chat_threads SET unread_delivered = unread_count WHERE unread_count > 0;
