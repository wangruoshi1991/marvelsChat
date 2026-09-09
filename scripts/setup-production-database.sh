#!/usr/bin/env bash
set -euo pipefail

app_dir="${MIAOXUN_APP_DIR:-/opt/projects/marvels-chat/app}"
env_file="$app_dir/deploy/miaoxun-prod.env"
hba_file="$app_dir/deploy/miaoxun-postgresql.pg_hba.conf"
settings_file="$app_dir/deploy/miaoxun-postgresql.conf"
postgres_version="18"
cluster_name="main"

if (( EUID != 0 )); then
  printf 'Run this command as root.\n' >&2
  exit 1
fi
for required_file in "$env_file" "$hba_file" "$settings_file"; do
  if [[ ! -f "$required_file" ]]; then
    printf 'Required database deployment file is missing: %s\n' "$required_file" >&2
    exit 1
  fi
done

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
if ! [[ "$POSTGRES_USER" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  printf 'POSTGRES_USER contains unsupported characters.\n' >&2
  exit 1
fi
if ! [[ "$POSTGRES_DATABASE" =~ ^[A-Za-z_][A-Za-z0-9_]*$ ]]; then
  printf 'POSTGRES_DATABASE contains unsupported characters.\n' >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install --yes \
  "postgresql-$postgres_version" \
  "postgresql-client-$postgres_version" \
  "postgresql-$postgres_version-pgvector"

for setting in \
  listen_addresses \
  port \
  max_connections \
  shared_buffers \
  effective_cache_size \
  maintenance_work_mem \
  password_encryption; do
  pg_conftool "$postgres_version" "$cluster_name" remove "$setting"
done
install -d -o postgres -g postgres -m 0750 \
  "/etc/postgresql/$postgres_version/$cluster_name/conf.d"
install -o postgres -g postgres -m 0640 \
  "$settings_file" \
  "/etc/postgresql/$postgres_version/$cluster_name/conf.d/miaoxun.conf"
install -o postgres -g postgres -m 0640 \
  "$hba_file" "/etc/postgresql/$postgres_version/$cluster_name/pg_hba.conf"

systemctl enable "postgresql@$postgres_version-$cluster_name.service"
systemctl restart "postgresql@$postgres_version-$cluster_name.service"

runuser -u postgres -- env \
  MIAOXUN_DB_USER="$POSTGRES_USER" \
  MIAOXUN_DB_PASSWORD="$POSTGRES_PASSWORD" \
  MIAOXUN_DB_NAME="$POSTGRES_DATABASE" \
  psql --no-psqlrc --set=ON_ERROR_STOP=1 --dbname=postgres <<'SQL'
\getenv app_user MIAOXUN_DB_USER
\getenv app_password MIAOXUN_DB_PASSWORD
\getenv app_database MIAOXUN_DB_NAME
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', :'app_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'app_database') \gexec
SQL

runuser -u postgres -- psql --no-psqlrc --set=ON_ERROR_STOP=1 \
  --dbname="$POSTGRES_DATABASE" \
  --command='CREATE EXTENSION IF NOT EXISTS vector'

if [[ "$(ss -lntH 'sport = :5432' | awk '{print $4}' | sort -u)" != "127.0.0.1:5432" ]]; then
  printf 'PostgreSQL is not restricted to 127.0.0.1:5432.\n' >&2
  exit 1
fi

printf 'Miaoxun PostgreSQL %s with pgvector is ready on 127.0.0.1:5432.\n' "$postgres_version"
