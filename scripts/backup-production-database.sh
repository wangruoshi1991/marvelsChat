#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
backup_dir="${MIAOXUN_DATABASE_BACKUP_DIR:-/opt/projects/marvels-chat/database/backups}"
retention_days="${MIAOXUN_DATABASE_BACKUP_RETENTION_DAYS:-30}"
recipient_certificate="${MIAOXUN_DATABASE_BACKUP_RECIPIENT_CERT:-/etc/marvels-chat/database-backup-recipient.pem}"
offsite_uploader="$script_dir/upload-production-database-backup.mjs"
lock_dir="${MIAOXUN_DATABASE_BACKUP_LOCK_DIR:-/run/marvels-chat-database-backup}"
lock_file="$lock_dir/backup.lock"

if ! [[ "$retention_days" =~ ^[1-9][0-9]*$ ]] || (( retention_days > 365 )); then
  printf 'MIAOXUN_DATABASE_BACKUP_RETENTION_DAYS must be between 1 and 365.\n' >&2
  exit 1
fi

for required_file in "$recipient_certificate" "$offsite_uploader"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'Required database deployment file is missing: %s\n' "$required_file" >&2
    exit 1
  fi
done
certificate_owner="$(stat -c '%u' "$recipient_certificate")"
certificate_group="$(stat -c '%g' "$recipient_certificate")"
certificate_mode="$(stat -c '%a' "$recipient_certificate")"
if \
  [[ "$certificate_owner" != "0" ]] ||
  [[ "$certificate_group" != "0" ]] ||
  [[ "$certificate_mode" != "644" ]]; then
  printf 'The backup recipient certificate must be owned by root:root with mode 0644.\n' >&2
  exit 1
fi
if ! openssl x509 -in "$recipient_certificate" -noout -checkend 2592000 >/dev/null; then
  printf 'The backup recipient certificate is invalid or expires within 30 days.\n' >&2
  exit 1
fi

umask 077
install -d -m 0700 "$backup_dir"
install -d -m 0700 "$lock_dir"
backup_owner="$(stat -c '%u' "$backup_dir")"
backup_mode="$(stat -c '%a' "$backup_dir")"
if [[ "$backup_owner" != "$EUID" ]] || (( (8#$backup_mode & 077) != 0 )); then
  printf 'The database backup directory must be owned by the backup user with mode 0700.\n' >&2
  exit 1
fi
exec 9>"$lock_file"
if ! flock -n 9; then
  printf 'Another Miaoxun database backup is already running.\n' >&2
  exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="$backup_dir/marvels_chat-$timestamp.dump"
if [[ -e "$target" ]] || [[ -e "$target.sha256" ]]; then
  printf 'A database backup with the current UTC timestamp already exists.\n' >&2
  exit 1
fi
temporary="$(mktemp --tmpdir="$backup_dir" '.marvels_chat.dump.tmp.XXXXXX')"
list_output="$(mktemp --tmpdir="$backup_dir" '.marvels_chat.list.tmp.XXXXXX')"
encrypted_temporary=""
cleanup() {
  rm -f "$temporary" "$list_output"
  if [[ -n "$encrypted_temporary" ]]; then
    rm -f "$encrypted_temporary"
  fi
}
trap cleanup EXIT

for name in \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_HOST \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_PORT \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_USER \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_PASSWORD \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_DATABASE; do
  if [[ -z "${!name:-}" ]]; then
    printf '%s must be set in the backup environment.\n' "$name" >&2
    exit 1
  fi
done
if [[ "$MIAOXUN_DATABASE_BACKUP_POSTGRES_HOST" != "127.0.0.1" ]]; then
  printf 'The production database backup host must be 127.0.0.1.\n' >&2
  exit 1
fi
if \
  ! [[ "$MIAOXUN_DATABASE_BACKUP_POSTGRES_PORT" =~ ^[0-9]+$ ]] ||
  (( MIAOXUN_DATABASE_BACKUP_POSTGRES_PORT < 1 || MIAOXUN_DATABASE_BACKUP_POSTGRES_PORT > 65535 )); then
  printf 'The production database backup port must be between 1 and 65535.\n' >&2
  exit 1
fi
(
  unset \
    MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_ID \
    MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_SECRET
  export PGPASSWORD="$MIAOXUN_DATABASE_BACKUP_POSTGRES_PASSWORD"
  exec pg_dump \
    --host=127.0.0.1 \
    --port="$MIAOXUN_DATABASE_BACKUP_POSTGRES_PORT" \
    --username="$MIAOXUN_DATABASE_BACKUP_POSTGRES_USER" \
    --dbname="$MIAOXUN_DATABASE_BACKUP_POSTGRES_DATABASE" \
    --format=custom \
    --compress=6 \
    --no-owner \
    --no-acl
) >"$temporary"
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

printf 'Miaoxun local database backup completed: %s\n' "$target"

plaintext_sha256="$(awk '{print $1}' "$target.sha256")"
recipient_certificate_sha256="$(
  openssl x509 -in "$recipient_certificate" -outform DER |
    sha256sum |
    awk '{print $1}'
)"
encrypted_object_name="$(basename "$target").cms"
encrypted_temporary="$(mktemp --tmpdir="$backup_dir" '.marvels_chat.cms.tmp.XXXXXX')"
openssl cms -encrypt \
  -binary \
  -aes-256-gcm \
  -outform DER \
  -in "$target" \
  -out "$encrypted_temporary" \
  -recip "$recipient_certificate" \
  -keyopt rsa_padding_mode:oaep \
  -keyopt rsa_oaep_md:sha256

(
  unset MIAOXUN_DATABASE_BACKUP_POSTGRES_PASSWORD
  exec node "$offsite_uploader" \
    "$encrypted_temporary" \
    "$encrypted_object_name" \
    "$plaintext_sha256" \
    "$recipient_certificate_sha256"
)
