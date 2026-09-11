#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  printf 'Usage: %s <archive.cms> <manifest.json> <recipient-cert.pem> <private-key.pem> <output.dump>\n' "$0" >&2
  exit 2
fi

archive_path="$1"
manifest_path="$2"
recipient_certificate="$3"
private_key="$4"
output_path="$5"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

for required_file in "$archive_path" "$manifest_path" "$recipient_certificate" "$private_key"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'Required recovery file is missing: %s\n' "$required_file" >&2
    exit 1
  fi
done
if [[ -e "$output_path" ]]; then
  printf 'Refusing to overwrite the recovery output: %s\n' "$output_path" >&2
  exit 1
fi
for command_name in node openssl pg_restore; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Required recovery command is unavailable: %s\n' "$command_name" >&2
    exit 1
  fi
done
private_key_permissions="$(
  node -e '
    const fs = require("node:fs");
    const stats = fs.statSync(process.argv[1]);
    process.stdout.write(`${stats.uid} ${stats.mode & 0o777}`);
  ' "$private_key"
)"
private_key_owner="${private_key_permissions%% *}"
private_key_mode="${private_key_permissions##* }"
if [[ "$private_key_owner" != "$EUID" ]] || (( (private_key_mode & 077) != 0 )); then
  printf 'The recovery private key must be owned by the current user without group/world access.\n' >&2
  exit 1
fi

output_dir="$(dirname -- "$output_path")"
if [[ ! -d "$output_dir" ]]; then
  printf 'Recovery output directory does not exist: %s\n' "$output_dir" >&2
  exit 1
fi

umask 077
temporary_output="$(mktemp "$output_dir/.miaoxun-recovery.dump.tmp.XXXXXX")"
list_output="$(mktemp "$output_dir/.miaoxun-recovery.list.tmp.XXXXXX")"
trap 'rm -f "$temporary_output" "$list_output"' EXIT

expected_sha256="$(
  node "$script_dir/verify-offsite-database-backup.mjs" \
    --print-plaintext-sha256 \
    "$archive_path" \
    "$manifest_path" \
    "$recipient_certificate"
)"

openssl cms -decrypt \
  -binary \
  -inform DER \
  -in "$archive_path" \
  -recip "$recipient_certificate" \
  -inkey "$private_key" \
  -out "$temporary_output"

actual_sha256="$(sha256sum "$temporary_output" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  printf 'The decrypted database backup SHA-256 does not match the manifest.\n' >&2
  exit 1
fi

pg_restore --list "$temporary_output" >"$list_output"
if ! grep -q 'TABLE DATA public schema_migrations' "$list_output"; then
  printf 'Recovery validation failed: schema_migrations data is missing.\n' >&2
  exit 1
fi
if ! grep -q 'EXTENSION - vector' "$list_output"; then
  printf 'Recovery validation failed: vector extension is missing.\n' >&2
  exit 1
fi

mv "$temporary_output" "$output_path"
printf 'Miaoxun database backup decrypted and validated: %s\n' "$output_path"
