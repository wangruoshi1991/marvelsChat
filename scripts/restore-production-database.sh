#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  printf 'Run this command as root.\n' >&2
  exit 1
fi
if [[ $# -ne 2 ]]; then
  printf 'Usage: %s <custom-dump-path> <expected-sha256>\n' "$0" >&2
  exit 1
fi

dump_path="$1"
expected_sha256="${2,,}"
app_dir="${MIAOXUN_APP_DIR:-/opt/projects/marvels-chat/app}"
env_file="$app_dir/deploy/miaoxun-prod.env"

if [[ ! -f "$dump_path" ]] || [[ ! "$expected_sha256" =~ ^[a-f0-9]{64}$ ]]; then
  printf 'A readable custom dump and its 64-character SHA-256 are required.\n' >&2
  exit 1
fi
if [[ ! -f "$env_file" ]]; then
  printf 'Production environment file is missing: %s\n' "$env_file" >&2
  exit 1
fi
env_owner="$(stat -c '%u' "$env_file")"
env_mode="$(stat -c '%a' "$env_file")"
if [[ "$env_owner" != "0" ]] || (( (8#$env_mode & 022) != 0 )); then
  printf 'Root database restore refuses a writable production environment file.\n' >&2
  exit 1
fi
for service in marvels-chat-backend marvels-chat-media-retrieval-worker; do
  if systemctl is-active --quiet "$service"; then
    printf '%s must be stopped before a database restore.\n' "$service" >&2
    exit 1
  fi
done

actual_sha256="$(sha256sum "$dump_path" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  printf 'Database dump SHA-256 does not match the approved value.\n' >&2
  exit 1
fi

set -a
# The production environment file is root-owned deployment input, not user input.
source "$env_file"
set +a
for name in POSTGRES_USER POSTGRES_PASSWORD POSTGRES_DATABASE; do
  if [[ -z "${!name:-}" ]]; then
    printf '%s must be set in the production environment.\n' "$name" >&2
    exit 1
  fi
done
if ! [[ "$POSTGRES_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  printf 'POSTGRES_USER contains unsupported characters.\n' >&2
  exit 1
fi
if ! [[ "$POSTGRES_DATABASE" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  printf 'POSTGRES_DATABASE contains unsupported characters.\n' >&2
  exit 1
fi

dump_list="$(mktemp)"
restore_list="$(mktemp)"
restore_input="$(mktemp)"
trap 'rm -f "$dump_list" "$restore_list" "$restore_input"' EXIT
install -o postgres -g postgres -m 0600 "$dump_path" "$restore_input"
pg_restore --list "$dump_path" >"$dump_list"
if ! grep -q 'TABLE DATA public schema_migrations' "$dump_list"; then
  printf 'Restore refused: schema_migrations data is missing.\n' >&2
  exit 1
fi
if ! grep -q 'EXTENSION - vector' "$dump_list"; then
  printf 'Restore refused: vector extension is missing.\n' >&2
  exit 1
fi

# PostgreSQL creates public itself and pgvector is installed by the local superuser.
# PolarDB's provider-owned catalog must not be copied to self-hosted PostgreSQL.
awk '
  / SCHEMA - public / ||
  / ACL - SCHEMA public / ||
  / EXTENSION - vector / ||
  / COMMENT - EXTENSION vector / { print ";" $0; next }
  { print }
' "$dump_list" >"$restore_list"
chown postgres:postgres "$restore_list"
chmod 0600 "$restore_list"

runuser -u postgres -- env \
  MIAOXUN_DB_USER="$POSTGRES_USER" \
  MIAOXUN_DB_NAME="$POSTGRES_DATABASE" \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname=postgres <<'SQL'
\getenv app_user MIAOXUN_DB_USER
\getenv app_database MIAOXUN_DB_NAME
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = :'app_database' AND pid <> pg_backend_pid();
SELECT format('DROP DATABASE IF EXISTS %I', :'app_database') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', :'app_user') \gexec
SQL

runuser -u postgres -- psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --dbname="$POSTGRES_DATABASE" \
  --command='CREATE EXTENSION vector'
runuser -u postgres -- pg_restore \
  --dbname="$POSTGRES_DATABASE" \
  --role="$POSTGRES_USER" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --exclude-schema=polar_catalog \
  --use-list="$restore_list" \
  "$restore_input"

validation_result="$(runuser -u postgres -- env \
  MIAOXUN_DB_USER="$POSTGRES_USER" \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --tuples-only --no-align \
  --dbname="$POSTGRES_DATABASE" <<'SQL'
\getenv app_user MIAOXUN_DB_USER
SELECT
  (
    SELECT count(*)
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles AS owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'S', 'v', 'm')
      AND owner.rolname <> :'app_user'
  ),
  EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector'),
  EXISTS (SELECT 1 FROM schema_migrations);
SQL
)"
if [[ "$validation_result" != "0|t|t" ]]; then
  printf 'Database restore structural validation failed.\n' >&2
  exit 1
fi

printf 'Miaoxun database restore completed and passed structural checks.\n'
