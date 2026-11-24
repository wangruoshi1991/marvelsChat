-- Keep the existing byte limit and extend the binary attachment types.
ALTER TABLE chat_attachments DROP CONSTRAINT chat_attachments_kind_check;
ALTER TABLE chat_attachments DROP CONSTRAINT chat_attachments_check;
ALTER TABLE chat_attachments ADD CONSTRAINT chat_attachments_kind_check
  CHECK (kind IN ('image','audio','file','video','location','contact','task'));
ALTER TABLE chat_attachments ADD CONSTRAINT chat_attachments_content_kind_check
  CHECK ((content IS NULL AND byte_size = 0 AND kind IN ('location','contact','task')) OR
    (content IS NOT NULL AND octet_length(content) = byte_size AND kind IN ('image','audio','file','video')));
ALTER TABLE chat_attachments ADD CONSTRAINT chat_attachments_video_shape_check
  CHECK (kind <> 'video' OR (mime_type IS NOT DISTINCT FROM 'video/mp4' AND duration_ms IS NOT NULL AND duration_ms <= 60000 AND byte_size > 0));
