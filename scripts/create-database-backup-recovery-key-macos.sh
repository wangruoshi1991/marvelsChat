#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  printf 'This recovery-key helper requires macOS Keychain.\n' >&2
  exit 1
fi
if [[ $# -ne 0 ]]; then
  printf 'Usage: %s\n' "$0" >&2
  exit 2
fi

recovery_dir="$HOME/Documents/Miaoxun-Recovery"
private_key="$recovery_dir/miaoxun-db-backup-private-key.pem"
recipient_certificate="$recovery_dir/miaoxun-db-backup-recipient.pem"
keychain_service="com.miaoxun.database-backup.recovery"

for command_name in openssl security mktemp cmp; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required recovery-key command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done
for output_path in "$private_key" "$recipient_certificate"; do
  if [[ -e "$output_path" ]]; then
    printf 'Refusing to overwrite an existing recovery file: %s\n' "$output_path" >&2
    exit 1
  fi
done
if security find-generic-password \
  -a "$USER" \
  -s "$keychain_service" >/dev/null 2>&1; then
  printf 'Refusing to overwrite the existing Miaoxun recovery Keychain item.\n' >&2
  exit 1
fi

umask 077
temporary_dir="$(mktemp -d "${TMPDIR:-/tmp}/miaoxun-db-recovery-key.XXXXXX")"
passphrase_file="$temporary_dir/passphrase"
private_key_temporary="$temporary_dir/private-key.pem"
certificate_temporary="$temporary_dir/recipient.pem"
verified_passphrase_file="$temporary_dir/verified-passphrase"
keychain_item_created=0
completed=0
cleanup() {
  if (( completed == 0 )); then
    rm -f "$private_key" "$recipient_certificate"
    if (( keychain_item_created == 1 )); then
      security delete-generic-password \
        -a "$USER" \
        -s "$keychain_service" >/dev/null 2>&1 || true
    fi
  fi
  rm -rf "$temporary_dir"
}
trap cleanup EXIT

openssl rand -base64 48 >"$passphrase_file"
openssl genpkey \
  -algorithm RSA \
  -pkeyopt rsa_keygen_bits:3072 \
  -aes-256-cbc \
  -pass "file:$passphrase_file" \
  -out "$private_key_temporary"
openssl req \
  -new \
  -x509 \
  -sha256 \
  -days 3650 \
  -key "$private_key_temporary" \
  -passin "file:$passphrase_file" \
  -out "$certificate_temporary" \
  -subj '/CN=Miaoxun Database Backup Recovery/'

install -d -m 0700 "$recovery_dir"
install -m 0600 "$private_key_temporary" "$private_key"
install -m 0644 "$certificate_temporary" "$recipient_certificate"

security add-generic-password \
  -a "$USER" \
  -s "$keychain_service" \
  -l 'Miaoxun database backup recovery' \
  -j 'Private-key passphrase; do not export to ECS, Git, or OSS.' \
  -w <"$passphrase_file"
keychain_item_created=1

security find-generic-password \
  -a "$USER" \
  -s "$keychain_service" \
  -w >"$verified_passphrase_file"
if ! cmp -s "$passphrase_file" "$verified_passphrase_file"; then
  printf 'The stored Keychain passphrase did not match the generated passphrase.\n' >&2
  exit 1
fi
openssl pkey \
  -in "$private_key" \
  -passin "file:$verified_passphrase_file" \
  -noout
openssl x509 -in "$recipient_certificate" -noout -checkend 2592000

completed=1
printf 'Miaoxun database recovery key created.\n'
printf 'Private key: %s\n' "$private_key"
printf 'Recipient certificate: %s\n' "$recipient_certificate"
printf 'Keychain service: %s\n' "$keychain_service"
