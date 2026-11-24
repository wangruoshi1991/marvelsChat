ALTER TABLE file_assets
  ADD COLUMN inline_submission_key UUID,
  ADD COLUMN inline_request_hash CHAR(64),
  ADD CONSTRAINT chk_file_inline_submission_hash
    CHECK ((inline_submission_key IS NULL) = (inline_request_hash IS NULL)),
  ADD CONSTRAINT uniq_file_inline_submission UNIQUE (user_id, inline_submission_key);
