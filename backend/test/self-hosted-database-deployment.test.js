import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readRepoFile = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8");

test("self-hosted production PostgreSQL is installed with pgvector and restricted to localhost", async () => {
  const [setup, hba, productionEnv] = await Promise.all([
    readRepoFile("scripts/setup-production-database.sh"),
    readRepoFile("deploy/miaoxun-postgresql.pg_hba.conf"),
    readRepoFile("deploy/miaoxun-prod.env.example"),
  ]);

  assert.match(setup, /postgres_version="18"/);
  assert.match(setup, /postgresql-\$postgres_version-pgvector/);
  assert.match(setup, /listen_addresses 127\.0\.0\.1/);
  assert.match(setup, /password_encryption scram-sha-256/);
  assert.match(setup, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.doesNotMatch(setup, /docker|0\.0\.0\.0:5432/);
  assert.match(hba, /host\s+all\s+all\s+127\.0\.0\.1\/32\s+scram-sha-256/);
  assert.doesNotMatch(hba, /0\.0\.0\.0\/0|trust\s*$/m);
  assert.match(productionEnv, /^HOST=127\.0\.0\.1$/m);
  assert.match(productionEnv, /^POSTGRES_HOST=127\.0\.0\.1$/m);
  assert.doesNotMatch(productionEnv, /rds\.aliyuncs\.com|polardb/i);
});

test("database startup precedes application services and backup execution", async () => {
  const [backendService, workerService, backupService, backupTimer] =
    await Promise.all([
      readRepoFile("deploy/marvels-chat-backend.service.example"),
      readRepoFile("deploy/marvels-chat-media-retrieval-worker.service.example"),
      readRepoFile("deploy/marvels-chat-database-backup.service.example"),
      readRepoFile("deploy/marvels-chat-database-backup.timer.example"),
    ]);

  for (const applicationService of [backendService, workerService]) {
    assert.match(applicationService, /Requires=postgresql@18-main\.service/);
    assert.match(applicationService, /After=.*postgresql@18-main\.service/);
  }
  assert.match(backupService, /Requires=postgresql@18-main\.service/);
  assert.match(backupService, /backup-production-database\.sh/);
  assert.match(backupTimer, /OnCalendar=\*-\*-\* 00\/6:15:00/);
  assert.match(backupTimer, /Persistent=true/);
});

test("production backup validates content before publishing and prunes only Miaoxun dumps", async () => {
  const script = await readRepoFile("scripts/backup-production-database.sh");

  assert.match(script, /set -euo pipefail/);
  assert.match(script, /flock -n/);
  assert.match(script, /pg_dump[\s\\]+[\s\S]*--format=custom/);
  assert.match(script, /pg_restore --list/);
  assert.match(script, /PGPASSWORD="\$POSTGRES_PASSWORD"/);
  assert.match(script, /TABLE DATA public schema_migrations/);
  assert.match(script, /EXTENSION - vector/);
  assert.match(script, /sha256sum/);
  assert.match(script, /-name 'marvels_chat-\*\.dump'/);
  assert.doesNotMatch(script, /docker|rm -rf/);
});

test("production restore requires downtime and an approved dump checksum", async () => {
  const script = await readRepoFile("scripts/restore-production-database.sh");

  assert.match(script, /set -euo pipefail/);
  assert.match(script, /systemctl is-active --quiet "\$service"/);
  assert.match(script, /actual_sha256=.*sha256sum/);
  assert.match(script, /actual_sha256.*expected_sha256/);
  assert.match(script, /TABLE DATA public schema_migrations/);
  assert.match(script, /EXTENSION - vector/);
  assert.match(script, /DROP DATABASE IF EXISTS/);
  assert.match(script, /CREATE DATABASE %I OWNER %I/);
  assert.match(script, /CREATE EXTENSION vector/);
  assert.match(script, /--exclude-schema=polar_catalog/);
  assert.match(script, /--role="\$POSTGRES_USER"/);
  assert.match(script, /--exit-on-error/);
  assert.doesNotMatch(script, /rm -rf|DROP ROLE|DROP TABLE/);
});
