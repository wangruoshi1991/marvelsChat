#!/usr/bin/env bash
set -euo pipefail

if (( EUID != 0 )); then
  printf 'Run this command as root.\n' >&2
  exit 1
fi

app_link="${MIAOXUN_APP_LINK:-/opt/projects/marvels-chat/app}"
service_user="${MIAOXUN_SERVICE_USER:-marvels}"
service_group="${MIAOXUN_SERVICE_GROUP:-marvels}"
project_root="/opt/projects/marvels-chat"
releases_root="$project_root/releases"
release_root="$(readlink -f -- "$app_link")"

if [[ ! "$release_root" =~ ^/opt/projects/marvels-chat/releases/[A-Za-z0-9._-]+/runtime$ ]]; then
  printf 'Refusing unexpected Miaoxun release path: %s\n' "$release_root" >&2
  exit 1
fi
release_parent="${release_root%/runtime}"
# Protect directory entries as well as file contents: a writable project parent
# would let the service replace app even when the runtime itself is read-only.
for protected_dir in /opt /opt/projects "$project_root" "$releases_root" "$release_parent" "$release_root"; do
  if [[ ! -d "$protected_dir" || -L "$protected_dir" ]] ||
    [[ "$(readlink -f -- "$protected_dir")" != "$protected_dir" ]]; then
    printf 'Refusing unexpected production directory: %s\n' "$protected_dir" >&2
    exit 1
  fi
done
# Host ancestors are outside this release's ownership boundary; verify rather
# than changing their permissions as a side effect of an application release.
for host_dir in /opt /opt/projects; do
  host_owner="$(stat -c '%u' "$host_dir")"
  host_mode="$(stat -c '%a' "$host_dir")"
  if [[ "$host_owner" != "0" ]] || (( (8#$host_mode & 022) != 0 )); then
    printf 'Production ancestor must be root-owned and not writable by other users: %s\n' "$host_dir" >&2
    exit 1
  fi
done
for required_path in \
  "$release_root/backend/src" \
  "$release_root/backend/storage" \
  "$release_root/deploy/miaoxun-prod.env"; do
  if [[ ! -e "$required_path" ]]; then
    printf 'Required production release path is missing: %s\n' "$required_path" >&2
    exit 1
  fi
done
if ! getent passwd "$service_user" >/dev/null || ! getent group "$service_group" >/dev/null; then
  printf 'The configured Miaoxun service identity does not exist.\n' >&2
  exit 1
fi

for protected_dir in "$project_root" "$releases_root" "$release_parent" "$release_root"; do
  chown root:root "$protected_dir"
  chmod 0755 "$protected_dir"
done

find "$release_root" -xdev -exec chown -h root:root {} +
find "$release_root" -xdev \( -type d -o -type f \) -exec chmod go-w {} +

storage_dir="$release_root/backend/storage"
find "$storage_dir" -xdev -exec chown -h "$service_user:$service_group" {} +
find "$storage_dir" -xdev -type d -exec chmod 0750 {} +
find "$storage_dir" -xdev -type f -exec chmod 0640 {} +

environment_file="$release_root/deploy/miaoxun-prod.env"
chown root:"$service_group" "$environment_file"
chmod 0640 "$environment_file"

unexpected_writable="$(
  find "$release_root" -xdev \
    -path "$storage_dir" -prune -o \
    \( -type d -o -type f \) -perm /022 -print -quit
)"
if [[ -n "$unexpected_writable" ]]; then
  printf 'Production release still contains an unexpected writable path: %s\n' "$unexpected_writable" >&2
  exit 1
fi

printf 'Miaoxun production release permissions hardened: %s\n' "$release_root"
