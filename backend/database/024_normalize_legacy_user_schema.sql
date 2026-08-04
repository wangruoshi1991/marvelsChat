ALTER TABLE users
  ADD COLUMN IF NOT EXISTS login_name VARCHAR(80) UNIQUE,
  ADD COLUMN IF NOT EXISTS phone_number VARCHAR(32) UNIQUE,
  ADD COLUMN IF NOT EXISTS admin_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS presence_mode VARCHAR(20) NOT NULL DEFAULT 'online';

UPDATE users
SET admin_permissions = '[]'::jsonb
WHERE admin_permissions IS NULL;

ALTER TABLE users
  ALTER COLUMN admin_permissions SET DEFAULT '[]'::jsonb,
  ALTER COLUMN admin_permissions SET NOT NULL,
  ALTER COLUMN presence_mode SET DEFAULT 'online';

UPDATE users
SET presence_mode = 'online'
WHERE presence_mode IS NULL
  OR presence_mode NOT IN ('online', 'offline', 'hidden');

ALTER TABLE users
  ALTER COLUMN presence_mode SET NOT NULL,
  DROP CONSTRAINT IF EXISTS users_presence_mode_check,
  DROP CONSTRAINT IF EXISTS chk_users_presence_mode;

ALTER TABLE users
  ADD CONSTRAINT chk_users_presence_mode
  CHECK (presence_mode IN ('online', 'offline', 'hidden'));

CREATE INDEX IF NOT EXISTS idx_users_presence_mode
  ON users (presence_mode);

ALTER TABLE chat_threads
  ADD COLUMN IF NOT EXISTS peer_user_id CHAR(36);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'fk_threads_peer_user'
      AND conrelid = 'chat_threads'::regclass
  ) THEN
    ALTER TABLE chat_threads
      ADD CONSTRAINT fk_threads_peer_user
      FOREIGN KEY (peer_user_id) REFERENCES users(id) ON DELETE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_threads_peer_user
  ON chat_threads (peer_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_threads_direct_peer
  ON chat_threads (user_id, peer_user_id)
  WHERE peer_user_id IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS users_ai_id_seq
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  MAXVALUE 999999
  NO CYCLE;

DO $$
DECLARE
  legacy_user RECORD;
  sequence_last_value BIGINT;
  sequence_is_called BOOLEAN;
  sequence_issued_value BIGINT;
  persisted_prefix BIGINT;
  aligned_value BIGINT;
  sequence_value BIGINT;
  phone_digits TEXT;
  suffix TEXT;
  email_hash BYTEA;
  email_hash_prefix BIGINT;
BEGIN
  SELECT last_value, is_called
  INTO sequence_last_value, sequence_is_called
  FROM users_ai_id_seq;

  SELECT COALESCE(MAX(
    CASE
      WHEN ai_id ~ '^[0-9]{12}$' THEN LEFT(ai_id, 6)::BIGINT
      ELSE 0
    END
  ), 0)
  INTO persisted_prefix
  FROM users;

  sequence_issued_value := CASE
    WHEN sequence_is_called THEN sequence_last_value
    ELSE sequence_last_value - 1
  END;
  aligned_value := GREATEST(sequence_issued_value, persisted_prefix);

  PERFORM setval(
    'users_ai_id_seq',
    GREATEST(aligned_value, 1),
    aligned_value > 0
  );

  FOR legacy_user IN
    SELECT id, email, phone_number
    FROM users
    WHERE ai_id !~ '^[0-9]{12}$'
    ORDER BY created_at ASC, id ASC
  LOOP
    sequence_value := nextval('users_ai_id_seq');
    phone_digits := regexp_replace(
      COALESCE(legacy_user.phone_number, ''),
      '[^0-9]',
      '',
      'g'
    );

    IF phone_digits <> '' THEN
      suffix := LPAD(RIGHT(phone_digits, 6), 6, '0');
    ELSE
      email_hash := sha256(
        convert_to(lower(btrim(legacy_user.email)), 'UTF8')
      );
      email_hash_prefix :=
        get_byte(email_hash, 0)::BIGINT * 16777216
        + get_byte(email_hash, 1)::BIGINT * 65536
        + get_byte(email_hash, 2)::BIGINT * 256
        + get_byte(email_hash, 3)::BIGINT;
      suffix := LPAD((email_hash_prefix % 1000000)::TEXT, 6, '0');
    END IF;

    UPDATE users
    SET ai_id = LPAD(sequence_value::TEXT, 6, '0') || suffix
    WHERE id = legacy_user.id;
  END LOOP;
END $$;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS chk_users_ai_id_format;

ALTER TABLE users
  ADD CONSTRAINT chk_users_ai_id_format
  CHECK (ai_id ~ '^[0-9]{12}$');

DROP INDEX IF EXISTS idx_users_login_name;
DROP INDEX IF EXISTS idx_users_phone_number;
