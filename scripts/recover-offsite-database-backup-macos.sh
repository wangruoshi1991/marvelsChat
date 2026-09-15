#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'This recovery helper requires macOS Keychain.\n' >&2
  exit 1
fi
if [[ $# -ne 3 ]]; then
  printf 'Usage: %s <archive.cms> <manifest.json> <output.dump>\n' "$0" >&2
  exit 2
fi

archive_path="$1"
manifest_path="$2"
output_path="$3"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
recovery_dir="$HOME/Documents/Miaoxun-Recovery"
recipient_certificate="$recovery_dir/miaoxun-db-backup-recipient.pem"
private_key="$recovery_dir/miaoxun-db-backup-private-key.pem"
keychain_service="com.miaoxun.database-backup.recovery"

for command_name in security mktemp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required recovery command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done
for recovery_file in "$recipient_certificate" "$private_key"; do
  if [[ ! -f "$recovery_file" ]]; then
    printf 'Required recovery file is missing: %s\n' "$recovery_file" >&2
    exit 1
  fi
done

umask 077
passphrase_file="$(mktemp "${TMPDIR:-/tmp}/miaoxun-db-recovery-passphrase.XXXXXX")"
cleanup() {
  rm -f "$passphrase_file"
}
trap cleanup EXIT

if ! security find-generic-password \
  -a "$USER" \
  -s "$keychain_service" \
  -w >"$passphrase_file"; then
  printf 'Unable to read the Miaoxun recovery passphrase from macOS Keychain.\n' >&2
  exit 1
fi
chmod 0600 "$passphrase_file"

"$script_dir/decrypt-production-database-backup.sh" \
  "$archive_path" \
  "$manifest_path" \
  "$recipient_certificate" \
  "$private_key" \
  "$passphrase_file" \
  "$output_path"
