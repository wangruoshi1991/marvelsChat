#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  printf 'Run this command as root.\n' >&2
  exit 1
fi
if [[ $# -ne 1 ]]; then
  printf 'Usage: %s <aliyun-access-key.csv>\n' "$0" >&2
  exit 2
fi

credential_csv="$1"
config_dir="/etc/marvels-chat"
environment_file="$config_dir/database-backup.env"
recipient_certificate="$config_dir/database-backup-recipient.pem"
database_role="marvels_chat_backup"
database_name="marvels_chat"

for command_name in openssl sudo psql pg_dump install stat awk tr mktemp grep; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required database backup configuration command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done
if [[ ! -s "$credential_csv" ]]; then
  printf 'The Aliyun AccessKey CSV must be a non-empty regular file.\n' >&2
  exit 1
fi
credential_owner="$(stat -c '%u' "$credential_csv")"
credential_mode="$(stat -c '%a' "$credential_csv")"
if [[ "$credential_owner" != "0" ]] || (( (8#$credential_mode & 077) != 0 )); then
  printf 'The Aliyun AccessKey CSV must be root-owned without group/world access.\n' >&2
  exit 1
fi
if [[ -e "$environment_file" ]]; then
  printf 'Refusing to overwrite the existing backup environment: %s\n' "$environment_file" >&2
  exit 1
fi
if [[ ! -f "$recipient_certificate" ]]; then
  printf 'The backup recipient certificate is missing: %s\n' "$recipient_certificate" >&2
  exit 1
fi
for protected_path in "$credential_csv" "$config_dir" "$recipient_certificate"; do
  if [[ -L "$protected_path" ]]; then
    printf 'Refusing to configure backups through a symbolic link: %s\n' "$protected_path" >&2
    exit 1
  fi
done

expected_header='UserPrincipalName,Password,AccessKeyId,AccessKeySecret,SecurityPhone,SecurityEmail'
if ! awk -F, -v expected_header="$expected_header" '
  NR == 1 {
    header = $0
    sub(/\r$/, "", header)
    valid = header == expected_header
  }
  NR == 2 { valid = valid && NF == 6 }
  END { exit valid && NR == 2 ? 0 : 1 }
' "$credential_csv"; then
  printf 'The Aliyun AccessKey CSV does not match the expected single-user export.\n' >&2
  exit 1
fi
mapfile -t csv_lines < <(tr -d '\r' <"$credential_csv")
IFS=, read -r \
  user_principal_name \
  console_password \
  access_key_id \
  access_key_secret \
  security_phone \
  security_email <<<"${csv_lines[1]}"
if \
  ! [[ "$user_principal_name" =~ ^miaoxun-postgresql-backup-prod(@[A-Za-z0-9.-]+)?$ ]] ||
  [[ -n "$console_password" ]] ||
  ! [[ "$access_key_id" =~ ^[A-Za-z0-9]+$ ]] ||
  ! [[ "$access_key_secret" =~ ^[A-Za-z0-9]+$ ]]; then
  printf 'The Aliyun AccessKey CSV contains an unexpected identity or credential format.\n' >&2
  exit 1
fi
unset csv_lines console_password security_phone security_email

if sudo -u postgres psql \
  --dbname=postgres \
  --no-psqlrc \
  --tuples-only \
  --no-align \
  --command="SELECT 1 FROM pg_roles WHERE rolname = '$database_role'" |
  grep -qx 1; then
  printf 'Refusing to modify the existing PostgreSQL backup role: %s\n' "$database_role" >&2
  exit 1
fi

umask 077
install -d -o root -g root -m 0755 "$config_dir"
environment_temporary="$(mktemp "$config_dir/.database-backup.env.XXXXXX")"
pgpass_file="$(mktemp "$config_dir/.database-backup.pgpass.XXXXXX")"
database_password="$(openssl rand -hex 32)"
role_created=0
completed=0
cleanup() {
  rm -f "$environment_temporary" "$pgpass_file"
  if (( role_created == 1 && completed == 0 )); then
    printf '%s\n' \
      "REVOKE CONNECT ON DATABASE $database_name FROM $database_role;" \
      "REVOKE pg_read_all_data FROM $database_role;" \
      "DROP ROLE $database_role;" |
      sudo -u postgres psql \
        --dbname=postgres \
        --no-psqlrc \
        --quiet \
        --set=ON_ERROR_STOP=1 >/dev/null
  fi
}
trap cleanup EXIT

printf '%s\n' \
  "CREATE ROLE $database_role LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION BYPASSRLS CONNECTION LIMIT 2 PASSWORD '$database_password';" \
  "GRANT pg_read_all_data TO $database_role;" \
  "GRANT CONNECT ON DATABASE $database_name TO $database_role;" \
  "ALTER ROLE $database_role SET statement_timeout = '30min';" |
  sudo -u postgres psql \
    --dbname=postgres \
    --no-psqlrc \
    --quiet \
    --set=ON_ERROR_STOP=1 >/dev/null
role_created=1

printf '127.0.0.1:5432:%s:%s:%s\n' \
  "$database_name" \
  "$database_role" \
  "$database_password" >"$pgpass_file"
chmod 0600 "$pgpass_file"
PGPASSFILE="$pgpass_file" pg_dump \
  --host=127.0.0.1 \
  --port=5432 \
  --username="$database_role" \
  --dbname="$database_name" \
  --schema-only >/dev/null

{
  printf 'MIAOXUN_DATABASE_BACKUP_OSS_BUCKET=miaoxun-chats\n'
  printf 'MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT=oss-cn-shanghai-internal.aliyuncs.com\n'
  printf 'MIAOXUN_DATABASE_BACKUP_OSS_PREFIX=postgresql/v1\n'
  printf 'MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_ID=%s\n' "$access_key_id"
  printf 'MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_SECRET=%s\n' "$access_key_secret"
  printf 'MIAOXUN_DATABASE_BACKUP_OSS_TIMEOUT_MS=120000\n'
  printf 'MIAOXUN_DATABASE_BACKUP_POSTGRES_HOST=127.0.0.1\n'
  printf 'MIAOXUN_DATABASE_BACKUP_POSTGRES_PORT=5432\n'
  printf 'MIAOXUN_DATABASE_BACKUP_POSTGRES_USER=%s\n' "$database_role"
  printf 'MIAOXUN_DATABASE_BACKUP_POSTGRES_PASSWORD=%s\n' "$database_password"
  printf 'MIAOXUN_DATABASE_BACKUP_POSTGRES_DATABASE=%s\n' "$database_name"
  printf 'MIAOXUN_DATABASE_BACKUP_DIR=/opt/projects/marvels-chat/database/backups\n'
  printf 'MIAOXUN_DATABASE_BACKUP_RETENTION_DAYS=30\n'
  printf 'MIAOXUN_DATABASE_BACKUP_RECIPIENT_CERT=%s\n' "$recipient_certificate"
} >"$environment_temporary"
chmod 0600 "$environment_temporary"
chown root:root "$environment_temporary"
mv "$environment_temporary" "$environment_file"

completed=1
unset access_key_id access_key_secret database_password
printf 'Miaoxun database backup credentials configured.\n'
printf 'PostgreSQL role: %s (read-only)\n' "$database_role"
printf 'Environment: %s (root:root 0600)\n' "$environment_file"
