CREATE TABLE IF NOT EXISTS storage_cleanup_operations (
  id CHAR(36) PRIMARY KEY,
  scope VARCHAR(32) NOT NULL CHECK (scope IN ('account', 'station_album', 'station_media')),
  user_id CHAR(36) NOT NULL,
  target_id CHAR(36) NOT NULL,
  dedupe_key VARCHAR(180) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_storage_cleanup_completed CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_operations_queued
  ON storage_cleanup_operations (created_at, id) WHERE status <> 'completed';

CREATE TABLE IF NOT EXISTS storage_cleanup_objects (
  id CHAR(36) PRIMARY KEY,
  operation_id CHAR(36) NOT NULL REFERENCES storage_cleanup_operations(id) ON DELETE CASCADE,
  provider VARCHAR(40) NOT NULL,
  object_key VARCHAR(512) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  not_before TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  claim_token CHAR(36),
  claim_lease_until TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uniq_storage_cleanup_operation_object UNIQUE (operation_id, provider, object_key),
  CONSTRAINT chk_storage_cleanup_object_claim CHECK (
    (status = 'running' AND claim_token IS NOT NULL AND claim_lease_until IS NOT NULL) OR
    (status <> 'running' AND claim_token IS NULL AND claim_lease_until IS NULL)
  ),
  CONSTRAINT chk_storage_cleanup_object_completed CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_storage_cleanup_objects_queued
  ON storage_cleanup_objects (next_attempt_at, not_before, created_at, id)
  WHERE status <> 'completed';
