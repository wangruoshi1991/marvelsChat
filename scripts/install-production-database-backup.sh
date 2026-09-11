#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  printf 'Run this command as root.\n' >&2
  exit 1
fi

repo_dir="${MIAOXUN_REPOSITORY_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
service_user="marvels-backup"
service_group="marvels-backup"
program_dir="/usr/local/libexec/marvels-chat"
config_dir="/etc/marvels-chat"
backup_dir="/opt/projects/marvels-chat/database/backups"
environment_file="$config_dir/database-backup.env"
recipient_certificate="$config_dir/database-backup-recipient.pem"

for required_file in \
  "$repo_dir/scripts/backup-production-database.sh" \
  "$repo_dir/scripts/upload-production-database-backup.mjs" \
  "$repo_dir/deploy/marvels-chat-database-backup.service.example" \
  "$repo_dir/deploy/marvels-chat-database-backup.timer.example" \
  "$environment_file" \
  "$recipient_certificate"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'Required backup deployment file is missing: %s\n' "$required_file" >&2
    exit 1
  fi
done
for managed_path in \
  "$program_dir" \
  "$config_dir" \
  "$backup_dir" \
  "$environment_file" \
  "$recipient_certificate" \
  /etc/systemd/system/marvels-chat-database-backup.service \
  /etc/systemd/system/marvels-chat-database-backup.timer; do
  if [[ -L "$managed_path" ]]; then
    printf 'Refusing to install through a symbolic link: %s\n' "$managed_path" >&2
    exit 1
  fi
done
if [[ -e "$environment_file" ]] && [[ ! -f "$environment_file" ]]; then
  printf 'Refusing to use a non-regular backup environment file: %s\n' "$environment_file" >&2
  exit 1
fi
environment_owner="$(stat -c '%u' "$environment_file")"
environment_mode="$(stat -c '%a' "$environment_file")"
certificate_owner="$(stat -c '%u' "$recipient_certificate")"
certificate_group="$(stat -c '%g' "$recipient_certificate")"
certificate_mode="$(stat -c '%a' "$recipient_certificate")"
if [[ "$environment_owner" != "0" ]] || [[ "$environment_mode" != "600" ]]; then
  printf 'The backup environment must be root-owned with mode 0600.\n' >&2
  exit 1
fi
if \
  [[ "$certificate_owner" != "0" ]] ||
  [[ "$certificate_group" != "0" ]] ||
  [[ "$certificate_mode" != "644" ]]; then
  printf 'The backup recipient certificate must be owned by root:root with mode 0644.\n' >&2
  exit 1
fi
for required_name in \
  MIAOXUN_DATABASE_BACKUP_OSS_BUCKET \
  MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT \
  MIAOXUN_DATABASE_BACKUP_OSS_PREFIX \
  MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_ID \
  MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_SECRET \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_HOST \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_PORT \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_USER \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_PASSWORD \
  MIAOXUN_DATABASE_BACKUP_POSTGRES_DATABASE; do
  if ! awk -F= -v name="$required_name" '
    $1 == name {
      value = substr($0, index($0, "=") + 1)
      gsub(/^[[:space:]"]+|[[:space:]"]+$/, "", value)
      found = length(value) > 0
    }
    END { exit found ? 0 : 1 }
  ' "$environment_file"; then
    printf 'The backup environment is missing a value for %s.\n' "$required_name" >&2
    exit 1
  fi
done
if ! openssl x509 -in "$recipient_certificate" -noout -checkend 2592000 >/dev/null; then
  printf 'The backup recipient certificate is invalid or expires within 30 days.\n' >&2
  exit 1
fi

if ! getent group "$service_group" >/dev/null; then
  groupadd --system "$service_group"
fi
if ! getent passwd "$service_user" >/dev/null; then
  useradd \
    --system \
    --gid "$service_group" \
    --home-dir /nonexistent \
    --shell /usr/sbin/nologin \
    "$service_user"
fi

account_entry="$(getent passwd "$service_user")"
account_group="$(id -gn "$service_user")"
account_uid="$(id -u "$service_user")"
account_home="$(printf '%s' "$account_entry" | cut -d: -f6)"
if \
  (( account_uid >= 1000 )) ||
  [[ "$account_home" != "/nonexistent" ]] ||
  [[ "${account_entry##*:}" != "/usr/sbin/nologin" ]] ||
  [[ "$account_group" != "$service_group" ]]; then
  printf 'The existing %s account does not match the required service identity.\n' "$service_user" >&2
  exit 1
fi

install -d -o root -g root -m 0755 "$program_dir" "$config_dir"
install -o root -g root -m 0755 \
  "$repo_dir/scripts/backup-production-database.sh" \
  "$program_dir/backup-production-database.sh"
install -o root -g root -m 0755 \
  "$repo_dir/scripts/upload-production-database-backup.mjs" \
  "$program_dir/upload-production-database-backup.mjs"
install -d -o "$service_user" -g "$service_group" -m 0700 "$backup_dir"
find "$backup_dir" -maxdepth 1 -type f \
  \( -name 'marvels_chat-*.dump' -o -name 'marvels_chat-*.dump.sha256' \) \
  -exec chown "$service_user:$service_group" {} + \
  -exec chmod 0600 {} +

install -o root -g root -m 0644 \
  "$repo_dir/deploy/marvels-chat-database-backup.service.example" \
  /etc/systemd/system/marvels-chat-database-backup.service
install -o root -g root -m 0644 \
  "$repo_dir/deploy/marvels-chat-database-backup.timer.example" \
  /etc/systemd/system/marvels-chat-database-backup.timer

systemctl daemon-reload
printf 'Miaoxun database backup programs and units installed; timer state was not changed.\n'
