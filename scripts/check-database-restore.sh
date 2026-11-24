#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# This drill binds only the restore script and migrations. The database listens
# on a container-local socket, and the container has no network or host ports.
docker run --rm --interactive --network none --pull never \
  --mount "type=bind,source=$root_dir/scripts/restore-production-database.sh,target=/restore.sh,readonly" \
  --mount "type=bind,source=$root_dir/backend/database,target=/fixture/backend/database,readonly" \
  pgvector/pgvector:pg18 bash -s <<'DRILL'
set -euo pipefail
export LC_ALL=C MIAOXUN_APP_DIR=/fixture
umask 077

install -d -o postgres -g postgres -m 0700 /tmp/restore-pgdata
runuser -u postgres -- initdb -D /tmp/restore-pgdata --no-locale -E UTF8 -A trust >/dev/null
runuser -u postgres -- pg_ctl -D /tmp/restore-pgdata -w \
  -o "-c listen_addresses=''" -l /tmp/restore-pgdata/server.log start >/dev/null
printf 'Restore drill on %s with %s\n' "$(uname -s)" "$(postgres --version)"

install -d -m 0700 /fixture/deploy /fixture/bin
printf '%s\n' POSTGRES_USER=restore_owner POSTGRES_PASSWORD=synthetic-fixture \
  POSTGRES_DATABASE=restore_live >/fixture/deploy/miaoxun-prod.env
cat >/fixture/bin/systemctl <<'SYSTEMCTL'
#!/bin/sh
case "$1" in
  is-active) exit 3 ;;
  show) printf '%s\n' inactive ;;
  *) exit 1 ;;
esac
SYSTEMCTL
chmod 0700 /fixture/bin/systemctl
export PATH="/fixture/bin:$PATH"

db() {
  runuser -u postgres -- psql -X -qAt --set=ON_ERROR_STOP=1 "$@"
}
db --dbname=postgres <<'SQL'
CREATE ROLE restore_owner LOGIN;
CREATE DATABASE restore_live OWNER restore_owner;
CREATE DATABASE restore_backup OWNER restore_owner;
CREATE DATABASE restore_review OWNER restore_owner;
SQL
db --dbname=restore_live <<'SQL'
SET ROLE restore_owner;
CREATE TABLE original_witness (value text NOT NULL);
INSERT INTO original_witness VALUES ('original remains available');
SQL
original_oid="$(db --dbname=postgres -c "SELECT oid FROM pg_database WHERE datname='restore_live'")"

last_migration=070_media_retrieval_upload_run_settlement.sql
(
  printf 'CREATE EXTENSION vector;\nSET ROLE restore_owner;\n'
  printf 'CREATE TABLE schema_migrations (filename varchar(255) PRIMARY KEY, checksum char(64) NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);\n'
  for migration in /fixture/backend/database/[0-9][0-9][0-9]_*.sql; do
    filename="${migration##*/}"
    if [[ "$filename" > "$last_migration" ]]; then break; fi
    checksum="$(sha256sum "$migration" | awk '{print $1}')"
    printf 'BEGIN;\n'
    cat "$migration"
    printf "\nINSERT INTO schema_migrations (filename, checksum) VALUES ('%s', '%s');\nCOMMIT;\n" "$filename" "$checksum"
  done
) | db --dbname=restore_backup > /tmp/restore-migrations.log 2>&1 || {
  tail -n 30 /tmp/restore-migrations.log >&2
  exit 1
}

db --dbname=restore_backup <<'SQL'
SET ROLE restore_owner;
INSERT INTO users (id, email, password_hash, display_name, ai_id)
VALUES ('10000000-0000-0000-0000-000000000001', 'restore@example.invalid', 'synthetic', 'Restore Fixture', '000001000001');
INSERT INTO chat_threads (id, user_id, title)
VALUES ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Synthetic thread');
INSERT INTO station_albums (id, user_id, title)
VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Synthetic album');
INSERT INTO station_media_assets (id, user_id, album_id)
VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
SQL

dump_hash() {
  runuser -u postgres -- pg_dump --format=custom --dbname=restore_backup >"$1"
  sha256sum "$1" | awk '{print $1}'
}
good_sha="$(dump_hash /tmp/good.dump)"
# Collect the approval from a separate restoration of the exact archive.
runuser -u postgres -- pg_restore --no-owner --no-acl --exit-on-error \
  --single-transaction --dbname=restore_review </tmp/good.dump
runuser -u postgres -- bash /restore.sh --capture-baseline restore_review "$good_sha" "$last_migration" >/tmp/good.tsv
printf 'pgvector %s, %s representative counts and %s constraints in approved evidence\n' \
  "$(db --dbname=restore_review -c "SELECT extversion FROM pg_extension WHERE extname='vector'")" \
  "$(grep -c '^rows' /tmp/good.tsv)" "$(grep -c '^constraint' /tmp/good.tsv)"

assert_original() {
  [[ "$(db --dbname=postgres -c "SELECT oid FROM pg_database WHERE datname='restore_live'")" = "$original_oid" ]]
  [[ "$(db --dbname=restore_live -c 'SET ROLE restore_owner; SELECT value FROM original_witness')" = 'original remains available' ]]
  [[ -z "$(db --dbname=postgres -c "SELECT datname FROM pg_database WHERE datname LIKE 'restore_live_mx_new_%'")" ]]
}

expect_rejection() {
  local archive="$1" checksum="$2" evidence="$3" difference="$4" lines="$5"
  if bash /restore.sh "$archive" "$checksum" "$last_migration" "$evidence" >/tmp/restore-rejection.log 2>&1; then
    printf 'Unexpected database switch for %s.\n' "$archive" >&2
    exit 1
  fi
  grep -F -- "$difference" /tmp/restore-rejection.log
  [[ "$(grep -Ec '^[+-](rows|constraint)' /tmp/restore-rejection.log || true)" = "$lines" ]]
  assert_original
}

db --dbname=restore_backup -c 'DELETE FROM station_media_assets'
bad_rows_sha="$(dump_hash /tmp/bad-rows.dump)"
expect_rejection /tmp/bad-rows.dump "$bad_rows_sha" /tmp/good.tsv \
  'Approval evidence must identify this dump SHA-256 and final migration filename.' 0
printf '%s\n' 'PASS evidence from a different archive refused before switch'
# Bind the evidence to the faulty archive hash so the test reaches the row comparison.
sed "1s/$good_sha/$bad_rows_sha/" /tmp/good.tsv >/tmp/bad-rows.tsv
expect_rejection /tmp/bad-rows.dump "$bad_rows_sha" /tmp/bad-rows.tsv $'-rows\tstation_media_assets\t1' 2
printf '%s\n' 'PASS row mismatch refused before switch, original readable and candidate removed'

db --dbname=restore_backup <<'SQL'
INSERT INTO station_media_assets (id, user_id, album_id)
VALUES ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001');
ALTER TABLE station_media_assets DROP CONSTRAINT fk_station_media_album;
SQL
bad_constraints_sha="$(dump_hash /tmp/bad-constraints.dump)"
sed "1s/$good_sha/$bad_constraints_sha/" /tmp/good.tsv >/tmp/bad-constraints.tsv
expect_rejection /tmp/bad-constraints.dump "$bad_constraints_sha" /tmp/bad-constraints.tsv \
  $'-constraint\tstation_media_assets\tfk_station_media_album\t' 1
printf '%s\n' 'PASS missing constraint refused before switch, original readable and candidate removed'

bash /restore.sh /tmp/good.dump "$good_sha" "$last_migration" /tmp/good.tsv
[[ "$(db --dbname=restore_live -c "SELECT title FROM station_albums")" = 'Synthetic album' ]]
retained="$(db --dbname=postgres -c "SELECT datname FROM pg_database WHERE oid=$original_oid AND NOT datallowconn")"
[[ -n "$retained" ]]
printf '%s\n' 'PASS matching evidence switched to readable candidate and retained original'

bash /restore.sh --rollback "$retained"
assert_original
printf '%s\n' 'PASS rollback reactivated the original database'
DRILL
