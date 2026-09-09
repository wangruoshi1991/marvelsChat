#!/usr/bin/env bash
set -euo pipefail

app_dir="${MIAOXUN_APP_DIR:-/opt/projects/marvels-chat/app}"
backup_dir="${MIAOXUN_DATABASE_BACKUP_DIR:-/opt/projects/marvels-chat/database/backups}"
retention_days="${MIAOXUN_DATABASE_BACKUP_RETENTION_DAYS:-30}"
env_file="$app_dir/deploy/miaoxun-prod.env"
lock_file="/run/lock/miaoxun-database-backup.lock"

if ! [[ "$retention_days" =~ ^[1-9][0-9]*$ ]] || (( retention_days > 365 )); then
  printf 'MIAOXUN_DATABASE_BACKUP_RETENTION_DAYS must be between 1 and 365.\n' >&2
  exit 1
fi

for required_file in "$env_file"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'Required database deployment file is missing: %s\n' "$required_file" >&2
    exit 1
  fi
done

umask 077
install -d -m 0700 "$backup_dir"
exec 9>"$lock_file"
if ! flock -n 9; then
  printf 'Another Miaoxun database backup is already running.\n' >&2
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
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_dir/marvels_chat-$timestamp.dump"
temporary="$(mktemp --tmpdir="$backup_dir" '.marvels_chat.dump.tmp.XXXXXX')"
list_output="$(mktemp --tmpdir="$backup_dir" '.marvels_chat.list.tmp.XXXXXX')"
trap 'rm -f "$temporary" "$list_output"' EXIT

PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  --host=127.0.0.1 \
  --port="${POSTGRES_PORT:-5432}" \
  --username="$POSTGRES_USER" \
  --dbname="$POSTGRES_DATABASE" \
  --format=custom \
  --compress=6 \
  --no-owner \
  --no-acl \
  >"$temporary"
pg_restore --list "$temporary" >"$list_output"

if ! grep -q 'TABLE DATA public schema_migrations' "$list_output"; then
  printf 'Backup validation failed: schema_migrations data is missing.\n' >&2
  exit 1
fi
if ! grep -q 'EXTENSION - vector' "$list_output"; then
  printf 'Backup validation failed: vector extension is missing.\n' >&2
  exit 1
fi

mv "$temporary" "$target"
sha256sum "$target" >"$target.sha256"
find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'marvels_chat-*.dump' -o -name 'marvels_chat-*.dump.sha256' \) \
  -mtime "+$retention_days" -delete

printf 'Miaoxun database backup completed: %s\n' "$target"
