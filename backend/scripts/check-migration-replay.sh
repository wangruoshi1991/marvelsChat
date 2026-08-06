#!/usr/bin/env bash
set -euo pipefail

backend_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

: "${DATABASE_URL:?Set DATABASE_URL to an empty PostgreSQL migration test database.}"

if ! command -v psql >/dev/null 2>&1; then
  printf 'psql is required for migration replay checks.\n' >&2
  exit 1
fi

database_name="$(psql "$DATABASE_URL" --no-psqlrc --tuples-only --no-align \
  --command='SELECT current_database()')"

case "$database_name" in
  *_migration_test) ;;
  *)
    printf 'Refusing to use database %s; its name must end with _migration_test.\n' \
      "$database_name" >&2
    exit 1
    ;;
esac

public_table_count="$(psql "$DATABASE_URL" --no-psqlrc --tuples-only --no-align \
  --command="SELECT count(*) FROM pg_tables WHERE schemaname = 'public'")"
if [ "$public_table_count" != "0" ]; then
  printf 'Refusing to use non-empty migration test database %s.\n' "$database_name" >&2
  exit 1
fi

printf 'Building the ledger-free pre-023 schema in %s.\n' "$database_name"
for migration in "$backend_dir"/database/*.sql; do
  if [[ "$(basename "$migration")" == 023_* ]]; then
    break
  fi
  psql "$DATABASE_URL" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 --file="$migration"
done

# Production reached migrations 016-022 without these 015 objects. Reproduce that
# observed drift so the replay test covers the real upgrade path.
psql "$DATABASE_URL" --no-psqlrc --quiet --set=ON_ERROR_STOP=1 <<'SQL'
DROP TABLE miao_point_ledger;
ALTER TABLE user_profiles DROP COLUMN likes_count;

INSERT INTO users
  (id, email, phone_number, password_hash, display_name, ai_id, created_at)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'stable@example.com', NULL,
    'migration-test', 'Stable User', '000027654321', '2020-01-01T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000002', 'phone-legacy@example.com',
    '+86 138-0013-8000', 'migration-test', 'Phone Legacy User', 'legacy-phone',
    '2020-01-02T00:00:00Z'),
  ('00000000-0000-4000-8000-000000000003', 'email-legacy@example.com', NULL,
    'migration-test', 'Email Legacy User', 'legacy-email',
    '2020-01-03T00:00:00Z');
SQL

run_migrations() {
  (
    cd "$backend_dir"
    NODE_ENV=test \
      DEFAULT_ADMIN_ENABLED=false \
      CREATE_FIRST_USER_AS_ADMIN=false \
      npm run db:migrate
  )
}

run_migrations

expected_count="$(find "$backend_dir/database" -maxdepth 1 -name '[0-9][0-9][0-9]_*.sql' \
  -type f | wc -l | tr -d ' ')"
applied_count="$(psql "$DATABASE_URL" --no-psqlrc --tuples-only --no-align \
  --command='SELECT count(*) FROM schema_migrations')"

if [ "$applied_count" != "$expected_count" ]; then
  printf 'Migration ledger has %s rows; expected %s.\n' "$applied_count" "$expected_count" >&2
  exit 1
fi

schema_repaired="$(psql "$DATABASE_URL" --no-psqlrc --tuples-only --no-align <<'SQL'
SELECT
  to_regclass('public.miao_point_ledger') IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_profiles'
      AND column_name = 'likes_count'
  )
  AND (
    SELECT ai_id = '000027654321'
    FROM users
    WHERE id = '00000000-0000-4000-8000-000000000001'
  )
  AND (
    SELECT ai_id = '000028138000'
    FROM users
    WHERE id = '00000000-0000-4000-8000-000000000002'
  )
  AND (
    SELECT ai_id = '000029032333'
    FROM users
    WHERE id = '00000000-0000-4000-8000-000000000003'
  )
  AND (
    SELECT count(*) = 1
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%presence_mode%'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'users'
      AND indexname IN ('idx_users_login_name', 'idx_users_phone_number')
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_users_ai_id_format'
  )
  AND EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'station_site_drafts_source_check'
  );
SQL
)"

if [ "$schema_repaired" != "t" ]; then
  printf 'Migration replay did not repair the expected production schema drift.\n' >&2
  exit 1
fi

second_run_output="$(run_migrations)"
printf '%s\n' "$second_run_output"
if ! grep -Fq "Schema migrations: 0 applied, $expected_count unchanged." \
  <<<"$second_run_output"; then
  printf 'Second migration run was not a no-op.\n' >&2
  exit 1
fi

printf 'Migration replay check passed.\n'
