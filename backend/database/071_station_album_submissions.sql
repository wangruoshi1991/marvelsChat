ALTER TABLE station_albums
  ADD COLUMN creation_receipt JSONB
  CHECK (jsonb_typeof(creation_receipt) = 'object');

CREATE TABLE station_album_submissions (
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_key UUID NOT NULL,
  album_id CHAR(36) UNIQUE REFERENCES station_albums(id) ON DELETE SET NULL,
  request_hash CHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  PRIMARY KEY (user_id, submission_key)
);
