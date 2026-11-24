-- The credential generation is opaque and changes with every password change.
-- Receipts need no copy or fingerprint of either the password or its verifier.
ALTER TABLE users ADD COLUMN credential_generation UUID NOT NULL DEFAULT gen_random_uuid();

CREATE FUNCTION track_user_credential_generation() RETURNS TRIGGER AS $$
BEGIN
  NEW.credential_generation := gen_random_uuid();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_credential_generation
BEFORE UPDATE OF password_hash ON users
FOR EACH ROW WHEN (NEW.password_hash IS DISTINCT FROM OLD.password_hash)
EXECUTE FUNCTION track_user_credential_generation();

CREATE TABLE admin_account_mutations (
  actor_user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id CHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  operation VARCHAR(32) NOT NULL CHECK (operation IN ('status', 'role', 'password_reset', 'revoke_sessions')),
  idempotency_key VARCHAR(160) NOT NULL CHECK (char_length(idempotency_key) BETWEEN 8 AND 160),
  request_value VARCHAR(32),
  credential_generation UUID,
  response JSONB NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (actor_user_id, target_user_id, operation, idempotency_key),
  CHECK (
    (operation = 'status' AND request_value IS NOT NULL AND request_value IN ('active', 'disabled') AND credential_generation IS NULL) OR
    (operation = 'role' AND request_value IS NOT NULL AND request_value IN ('user', 'admin') AND credential_generation IS NULL) OR
    (operation = 'password_reset' AND request_value IS NULL AND credential_generation IS NOT NULL) OR
    (operation = 'revoke_sessions' AND request_value IS NULL AND credential_generation IS NULL)
  )
);

CREATE INDEX idx_admin_account_mutations_target ON admin_account_mutations(target_user_id);
