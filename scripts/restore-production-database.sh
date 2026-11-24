#!/usr/bin/env bash
set -euo pipefail

valid_backup_identity() {
  [[ "$1" =~ ^[a-f0-9]{64}$ && "$2" =~ ^[0-9]{3}_[a-z0-9_]+\.sql$ ]]
}

baseline_header() {
  printf 'miaoxun-restore-baseline-v1\t%s\t%s\n' "$1" "$2"
}

# Use the same read-only snapshot and canonical output for the isolated
# approval and the candidate. Evidence is compared as data, never run as SQL.
capture_baseline() {
  local checksum="$1" migration="$2"
  shift 2
  baseline_header "$checksum" "$migration"
  "$@" -X -qAt -v ON_ERROR_STOP=1 -v migration="$migration" <<'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
\if :{?app_role}
SET LOCAL ROLE :"app_role";
\endif
SET LOCAL search_path = pg_catalog;
SELECT COALESCE(max(filename COLLATE "C") = :'migration', false) AS version_matches
FROM public.schema_migrations \gset
\if :version_matches
\else
  DO $$ BEGIN RAISE EXCEPTION 'Baseline database does not match the supplied final migration'; END; $$;
\endif
COPY (
  SELECT 'rows', table_name, row_count
  FROM (VALUES
    ('users', (SELECT count(*) FROM public.users)),
    ('auth_sessions', (SELECT count(*) FROM public.auth_sessions)),
    ('chat_threads', (SELECT count(*) FROM public.chat_threads)),
    ('chat_messages', (SELECT count(*) FROM public.chat_messages)),
    ('station_albums', (SELECT count(*) FROM public.station_albums)),
    ('station_media_assets', (SELECT count(*) FROM public.station_media_assets))
  ) AS summary(table_name, row_count)
  ORDER BY table_name COLLATE "C"
) TO STDOUT;
COPY (
  SELECT 'constraint', relation.relname, entry.conname, entry.contype,
    pg_get_constraintdef(entry.oid), entry.convalidated, entry.conenforced
  FROM pg_constraint AS entry
  JOIN pg_class AS relation ON relation.oid = entry.conrelid
  JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
  WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
  ORDER BY relation.relname COLLATE "C", entry.conname COLLATE "C"
) TO STDOUT;
COMMIT;
SQL
}

if [[ $# -eq 4 && "$1" = "--capture-baseline" ]]; then
  isolated_database="$2"
  checksum="$(printf '%s' "$3" | LC_ALL=C tr 'A-F' 'a-f')"
  if ! [[ "$isolated_database" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]] || ! valid_backup_identity "$checksum" "$4"; then
    printf 'Provide an isolated database name, dump SHA-256 and final migration filename.\n' >&2
    exit 1
  fi
  capture_baseline "$checksum" "$4" psql --dbname="$isolated_database"
  exit 0
fi

if (( EUID != 0 )); then
  printf 'Run this command as root.\n' >&2
  exit 1
fi
if [[ $# -eq 2 && "$1" = "--rollback" ]]; then
  mode=rollback
  previous_database="$2"
elif [[ $# -eq 4 ]]; then
  mode=restore
  dump_path="$1"
  expected_sha256="${2,,}"
  last_migration="$3"
  approved_baseline="$4"
else
  printf 'Usage: %s <custom-dump-path> <expected-sha256> <last-migration-filename> <approved-baseline.tsv>\n       %s --capture-baseline <isolated-database> <dump-sha256> <last-migration-filename>\n       %s --rollback <retained-database>\n' "$0" "$0" "$0" >&2
  exit 1
fi

app_dir="${MIAOXUN_APP_DIR:-/opt/projects/marvels-chat/app}"
env_file="$app_dir/deploy/miaoxun-prod.env"
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
require_stopped_services() {
  local service service_state
  for service in marvels-chat-backend marvels-chat-media-retrieval-worker marvels-chat-ai-task-worker; do
    if systemctl is-active --quiet "$service"; then
      printf '%s must be stopped before a database restore.\n' "$service" >&2
      exit 1
    fi
    service_state="$(systemctl show --property=ActiveState --value "$service")"
    if [[ "$service_state" != inactive && "$service_state" != failed ]]; then
      printf 'Cannot confirm that %s is stopped.\n' "$service" >&2
      exit 1
    fi
  done
}
require_stopped_services

set -a
# The production environment file is root-owned deployment input, not user input.
source "$env_file"
set +a
# Restore is for the local PostgreSQL cluster reached by the postgres OS user.
unset PGHOST PGHOSTADDR PGPORT PGUSER PGSERVICE PGSERVICEFILE PGDATABASE PGOPTIONS
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
if ! [[ "$POSTGRES_DATABASE" =~ ^[A-Za-z_][A-Za-z0-9_]{0,31}$ ]] ||
   [[ "$POSTGRES_DATABASE" =~ ^(postgres|template[01])$ ]]; then
  printf 'POSTGRES_DATABASE contains unsupported characters.\n' >&2
  exit 1
fi

exec 9>"/run/lock/miaoxun-db-restore-$POSTGRES_DATABASE"
flock -n 9
maintenance_sql() {
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 --dbname=postgres "$@"
}
source_database="$POSTGRES_DATABASE"
suffix="$(date -u +%Y%m%d%H%M%S)_$$"
candidate_database="${source_database}_mx_new_$suffix"

switch_databases() {
  local incoming="$1" retained="$2" source_required="$3"
  require_stopped_services
  maintenance_sql \
    -v source="$source_database" -v incoming="$incoming" -v retained="$retained" \
    -v source_required="$source_required" -v owner="$POSTGRES_USER" <<'SQL'
SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'source') AS had_source,
  EXISTS (SELECT 1 FROM pg_database WHERE datname = :'incoming'
    AND pg_get_userbyid(datdba) = :'owner') AS incoming_valid,
  NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'retained') AS retained_available \gset
SELECT (:'incoming_valid'::boolean AND :'retained_available'::boolean
  AND (NOT :'source_required'::boolean OR :'had_source'::boolean)) AS preflight_ok \gset
\if :preflight_ok
\else
  DO $$ BEGIN RAISE EXCEPTION 'Database switch preflight failed'; END; $$;
\endif
BEGIN;
-- RENAME takes a database lock. Connections arriving during the switch can
-- cause it to fail safely, with ROLLBACK restoring both names.
SELECT pg_terminate_backend(pid, 5000)
FROM pg_stat_activity WHERE datname IN (:'source', :'incoming');
\if :had_source
  SELECT format('ALTER DATABASE %I RENAME TO %I', :'source', :'retained') \gexec
  SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS false', :'retained') \gexec
\endif
SELECT format('ALTER DATABASE %I RENAME TO %I', :'incoming', :'source') \gexec
SELECT format('ALTER DATABASE %I ALLOW_CONNECTIONS true', :'source') \gexec
COMMIT;
SQL
}

if [[ "$mode" = "rollback" ]]; then
  if ! [[ "$previous_database" =~ ^${source_database}_mx_prev_[0-9]{14}_[0-9]+$ ]]; then
    printf 'Rollback requires the retained database name printed by this script.\n' >&2
    exit 1
  fi
  replaced_database="${source_database}_mx_prev_$suffix"
  switch_databases "$previous_database" "$replaced_database" true
  printf 'Reactivated %s. The displaced database is retained as %s.\n' "$source_database" "$replaced_database"
  exit 0
fi

if [[ ! -f "$dump_path" || ! -f "$approved_baseline" ]] ||
   ! valid_backup_identity "$expected_sha256" "$last_migration"; then
  printf 'Provide a custom dump, the approved SHA-256, final migration filename and approval evidence.\n' >&2
  exit 1
fi

dump_list="$(mktemp)"
restore_list="$(mktemp)"
restore_input="$(mktemp)"
expected_ledger="$(mktemp)"
expected_baseline="$(mktemp)"
candidate_baseline="$(mktemp)"
candidate_created=false
cleanup() {
  rm -f "$dump_list" "$restore_list" "$restore_input" "$expected_ledger" "$expected_baseline" "$candidate_baseline"
  if "$candidate_created"; then
    maintenance_sql -v candidate="$candidate_database" <<'SQL' || true
SELECT format('DROP DATABASE %I WITH (FORCE)', datname)
FROM pg_database WHERE datname = :'candidate' \gexec
SQL
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
install -m 0600 "$approved_baseline" "$expected_baseline"
if [[ "$(head -n 1 "$expected_baseline")" != "$(baseline_header "$expected_sha256" "$last_migration")" ]]; then
  printf 'Approval evidence must identify this dump SHA-256 and final migration filename.\n' >&2
  exit 1
fi
install -o postgres -g postgres -m 0600 "$dump_path" "$restore_input"
actual_sha256="$(sha256sum "$restore_input" | awk '{print $1}')"
if [[ "$actual_sha256" != "$expected_sha256" ]]; then
  printf 'Database dump SHA-256 does not match the approved value.\n' >&2
  exit 1
fi
pg_restore --list "$restore_input" >"$dump_list"
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

export LC_ALL=C
[[ -f "$app_dir/backend/database/$last_migration" ]]
for migration in "$app_dir"/backend/database/[0-9][0-9][0-9]_*.sql; do
  filename="${migration##*/}"
  if [[ "$filename" > "$last_migration" ]]; then break; fi
  [[ "$filename" =~ ^[0-9]{3}_[a-z0-9_]+\.sql$ ]]
  checksum="$(sha256sum "$migration" | awk '{print $1}')"
  printf '%s\t%s\n' "$filename" "$checksum" >>"$expected_ledger"
done

maintenance_sql -v candidate="$candidate_database" -v owner="$POSTGRES_USER" <<'SQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'candidate', :'owner') \gexec
SQL
candidate_created=true

runuser -u postgres -- psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --dbname="$candidate_database" \
  --command='CREATE EXTENSION vector'
runuser -u postgres -- pg_restore \
  --dbname="$candidate_database" \
  --role="$POSTGRES_USER" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  --single-transaction \
  --exclude-schema=polar_catalog \
  --use-list="$restore_list" \
  "$restore_input"

validation_result="$({
  printf 'CREATE TEMP TABLE expected_ledger (filename text PRIMARY KEY, checksum text);\n'
  printf '\\copy expected_ledger FROM STDIN\n'
  awk '1' "$expected_ledger"
  printf '\\.\n'
  awk '1' <<'SQL'
SELECT count(*) FILTER (WHERE expected.filename IS NULL OR actual.filename IS NULL) AS migration_gap_count,
  count(*) FILTER (WHERE actual.filename IS NOT NULL AND expected.filename IS NOT NULL
    AND actual.checksum IS DISTINCT FROM expected.checksum) AS checksum_gap_count
FROM expected_ledger expected FULL JOIN public.schema_migrations actual USING (filename) \gset
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
  (SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace
    AND (NOT convalidated OR NOT conenforced)),
  :migration_gap_count,
  :checksum_gap_count;
SQL
} | runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 -v app_user="$POSTGRES_USER" -qAt --dbname="$candidate_database")"
if [[ "$validation_result" != "0|t|0|0|0" ]]; then
  printf 'Database restore structural validation failed.\n' >&2
  exit 1
fi
capture_baseline "$expected_sha256" "$last_migration" \
  runuser -u postgres -- psql --dbname="$candidate_database" -v app_role="$POSTGRES_USER" >"$candidate_baseline"
if ! cmp -s "$expected_baseline" "$candidate_baseline"; then
  printf 'Candidate representative row counts or constraints differ from the approved evidence.\n' >&2
  diff -U0 --label approved --label candidate "$expected_baseline" "$candidate_baseline" >&2 || true
  exit 1
fi
previous_database="${source_database}_mx_prev_$suffix"
switch_databases "$candidate_database" "$previous_database" false
candidate_created=false
printf 'Restore verified and activated. If present, the original database is retained as %s.\n' "$previous_database"
