-- Additive: legacy previews are deliberately not reconstructed as full text.
ALTER TABLE file_assets ADD COLUMN extracted_text TEXT;
ALTER TABLE file_assets ADD COLUMN parse_version VARCHAR(40);
ALTER TABLE file_assets ADD COLUMN upload_idempotency_key UUID;
ALTER TABLE file_assets ADD COLUMN upload_request_hash CHAR(64);
ALTER TABLE file_assets ADD CONSTRAINT file_assets_text_pair CHECK ((extracted_text IS NULL AND parse_version IS NULL) OR (extracted_text IS NOT NULL AND parse_version IS NOT NULL AND parse_version = 'utf8-text-v1' AND char_length(extracted_text) BETWEEN 1 AND 50000));
ALTER TABLE file_assets ADD CONSTRAINT file_assets_upload_pair CHECK ((upload_idempotency_key IS NULL) = (upload_request_hash IS NULL));
CREATE UNIQUE INDEX file_assets_upload_idempotency ON file_assets(user_id, upload_idempotency_key) WHERE upload_idempotency_key IS NOT NULL;
