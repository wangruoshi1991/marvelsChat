-- An owner/request pair is one explicit publication intent. Keep receipts when a
-- post is soft-deleted so losing a response can never recreate that publication.
ALTER TABLE station_posts ADD CONSTRAINT uq_station_posts_owner_id UNIQUE (user_id, id);

CREATE TABLE station_post_submissions (
  user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  client_request_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('submitted', 'closed')),
  request_hash CHAR(64) CHECK (request_hash ~ '^[0-9a-f]{64}$'),
  post_id CHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, client_request_id),
  UNIQUE (post_id),
  CHECK ((status = 'submitted' AND post_id IS NOT NULL AND request_hash IS NOT NULL)
    OR (status = 'closed' AND post_id IS NULL AND request_hash IS NULL)),
  FOREIGN KEY (user_id, post_id) REFERENCES station_posts(user_id, id) ON DELETE CASCADE
);
