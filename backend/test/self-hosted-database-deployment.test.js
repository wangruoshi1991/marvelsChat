import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readRepoFile = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8");

test("self-hosted production PostgreSQL is installed with pgvector and restricted to localhost", async () => {
  const [setup, settings, hba, productionEnv] = await Promise.all([
    readRepoFile("scripts/setup-production-database.sh"),
    readRepoFile("deploy/miaoxun-postgresql.conf"),
    readRepoFile("deploy/miaoxun-postgresql.pg_hba.conf"),
    readRepoFile("deploy/miaoxun-prod.env.example"),
  ]);

  assert.match(setup, /postgres_version="18"/);
  assert.match(setup, /postgresql-\$postgres_version-pgvector/);
  assert.match(setup, /pg_conftool[\s\S]*remove "\$setting"/);
  assert.match(setup, /conf\.d\/miaoxun\.conf/);
  assert.doesNotMatch(setup, /set listen_addresses/);
  assert.match(settings, /^listen_addresses = '127\.0\.0\.1'$/m);
  assert.match(settings, /^password_encryption = 'scram-sha-256'$/m);
  assert.match(setup, /CREATE EXTENSION IF NOT EXISTS vector/);
  assert.match(setup, /Root database setup refuses a writable deployment file/);
  assert.doesNotMatch(setup, /docker|0\.0\.0\.0:5432/);
  assert.match(hba, /host\s+all\s+all\s+127\.0\.0\.1\/32\s+scram-sha-256/);
  assert.doesNotMatch(hba, /0\.0\.0\.0\/0|trust\s*$/m);
  assert.match(productionEnv, /^HOST=127\.0\.0\.1$/m);
  assert.match(productionEnv, /^POSTGRES_HOST=127\.0\.0\.1$/m);
  assert.doesNotMatch(productionEnv, /rds\.aliyuncs\.com|polardb/i);
});

test("database startup precedes application services and backup execution", async () => {
  const [backendService, workerService, backupService, backupTimer, backupEnvironment] =
    await Promise.all([
      readRepoFile("deploy/marvels-chat-backend.service.example"),
      readRepoFile("deploy/marvels-chat-media-retrieval-worker.service.example"),
      readRepoFile("deploy/marvels-chat-database-backup.service.example"),
      readRepoFile("deploy/marvels-chat-database-backup.timer.example"),
      readRepoFile("deploy/miaoxun-database-backup.env.example"),
    ]);

  for (const applicationService of [backendService, workerService]) {
    assert.match(applicationService, /Requires=postgresql@18-main\.service/);
    assert.match(applicationService, /After=.*postgresql@18-main\.service/);
  }
  assert.match(backupService, /Requires=postgresql@18-main\.service/);
  assert.match(backupService, /User=marvels-backup/);
  assert.match(backupService, /Group=marvels-backup/);
  assert.match(backupService, /EnvironmentFile=\/etc\/marvels-chat\/database-backup\.env/);
  assert.match(backupService, /ExecStart=\/usr\/local\/libexec\/marvels-chat\/backup-production-database\.sh/);
  assert.match(backupService, /backup-production-database\.sh/);
  assert.match(backupService, /ProtectSystem=strict/);
  assert.match(backupService, /RuntimeDirectory=marvels-chat-database-backup/);
  assert.match(backupService, /ReadWritePaths=\/opt\/projects\/marvels-chat\/database\/backups/);
  assert.match(backupTimer, /OnCalendar=\*-\*-\* 00\/6:15:00/);
  assert.match(backupTimer, /Persistent=true/);
  assert.match(backupEnvironment, /^MIAOXUN_DATABASE_BACKUP_OSS_BUCKET=$/m);
  assert.match(backupEnvironment, /^MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_ID=$/m);
  assert.match(backupEnvironment, /^MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_SECRET=$/m);
  assert.match(backupEnvironment, /^MIAOXUN_DATABASE_BACKUP_POSTGRES_HOST=127\.0\.0\.1$/m);
  assert.match(backupEnvironment, /^MIAOXUN_DATABASE_BACKUP_POSTGRES_USER=marvels_chat_backup$/m);
  assert.match(backupEnvironment, /^MIAOXUN_DATABASE_BACKUP_POSTGRES_PASSWORD=$/m);
  assert.doesNotMatch(backupEnvironment, /^OSS_ACCESS_KEY_/m);
});

test("production backup validates content before publishing and prunes only Miaoxun dumps", async () => {
  const script = await readRepoFile("scripts/backup-production-database.sh");

  assert.match(script, /set -euo pipefail/);
  assert.match(script, /flock -n/);
  assert.match(script, /pg_dump[\s\\]+[\s\S]*--format=custom/);
  assert.match(script, /pg_restore --list/);
  assert.match(script, /PGPASSWORD="\$MIAOXUN_DATABASE_BACKUP_POSTGRES_PASSWORD"/);
  assert.match(script, /TABLE DATA public schema_migrations/);
  assert.match(script, /EXTENSION - vector/);
  assert.match(script, /sha256sum/);
  assert.match(script, /openssl cms -encrypt/);
  assert.match(script, /-aes-256-gcm/);
  assert.match(script, /rsa_padding_mode:oaep/);
  assert.match(script, /rsa_oaep_md:sha256/);
  assert.match(script, /upload-production-database-backup\.mjs/);
  assert.match(script, /MIAOXUN_DATABASE_BACKUP_RECIPIENT_CERT/);
  assert.match(script, /certificate_group=.*stat -c '%g'/);
  assert.match(script, /\[\[ "\$certificate_mode" != "644" \]\]/);
  assert.match(script, /MIAOXUN_DATABASE_BACKUP_LOCK_DIR/);
  assert.doesNotMatch(script, /source .*miaoxun-prod\.env|MIAOXUN_APP_DIR/);
  assert.match(script, /-name 'marvels_chat-\*\.dump'/);
  assert.doesNotMatch(script, /docker|rm -rf/);
});

test("backup installer isolates executable code and credentials from the application user", async () => {
  const script = await readRepoFile("scripts/install-production-database-backup.sh");

  assert.match(script, /service_user="marvels-backup"/);
  assert.match(script, /useradd[\s\S]*--system[\s\S]*--shell \/usr\/sbin\/nologin/);
  assert.match(script, /program_dir="\/usr\/local\/libexec\/marvels-chat"/);
  assert.match(script, /install -o root -g root -m 0755/);
  assert.match(script, /environment_file="\$config_dir\/database-backup\.env"/);
  assert.match(script, /backup environment must be root-owned with mode 0600/);
  assert.match(script, /MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_SECRET/);
  assert.match(script, /MIAOXUN_DATABASE_BACKUP_POSTGRES_PASSWORD/);
  assert.match(script, /certificate_group=.*stat -c '%g'/);
  assert.match(script, /\[\[ "\$certificate_mode" != "644" \]\]/);
  assert.match(script, /timer state was not changed/);
  assert.doesNotMatch(script, /systemctl enable|systemctl start|systemctl restart/);
});

test("production release hardening leaves only the explicit data directory writable", async () => {
  const script = await readRepoFile("scripts/harden-production-release.sh");

  assert.match(script, /^if \(\( EUID != 0 \)\); then/m);
  assert.match(script, /\/opt\/projects\/marvels-chat\/releases\//);
  assert.match(script, /find "\$release_root" -xdev -exec chown -h root:root/);
  assert.match(script, /find "\$release_root"[\s\S]*chmod go-w/);
  assert.match(script, /storage_dir="\$release_root\/backend\/storage"/);
  assert.match(script, /chown root:"\$service_group" "\$environment_file"/);
  assert.match(script, /chmod 0640 "\$environment_file"/);
  assert.doesNotMatch(script, /rm -rf|docker .*prune/);
});

test("offsite recovery verifies, decrypts, and validates before publishing a dump", async () => {
  const [script, gitignore] = await Promise.all([
    readRepoFile("scripts/decrypt-production-database-backup.sh"),
    readRepoFile(".gitignore"),
  ]);

  assert.match(script, /verify-offsite-database-backup\.mjs/);
  assert.match(script, /openssl cms -decrypt/);
  assert.match(script, /recovery private key must be owned by the current user/);
  assert.match(script, /actual_sha256.*expected_sha256/);
  assert.match(script, /pg_restore --list/);
  assert.match(script, /TABLE DATA public schema_migrations/);
  assert.match(script, /EXTENSION - vector/);
  assert.match(script, /Refusing to overwrite/);
  assert.doesNotMatch(script, /rm -rf|--clean|DROP DATABASE/);
  for (const recoveryArtifact of [
    "*.pem",
    "*.key",
    "*.dump",
    "*.dump.sha256",
    "*.dump.cms",
    "*.dump.cms.manifest.json",
  ]) {
    assert.match(gitignore, new RegExp(`^${recoveryArtifact.replaceAll(".", "\\.").replaceAll("*", "\\*")}$`, "m"));
  }
});

test("production restore requires downtime and an approved dump checksum", async () => {
  const script = await readRepoFile("scripts/restore-production-database.sh");

  assert.match(script, /set -euo pipefail/);
  assert.match(script, /systemctl is-active --quiet "\$service"/);
  assert.match(script, /actual_sha256=.*sha256sum/);
  assert.match(script, /actual_sha256.*expected_sha256/);
  assert.match(
    script,
    /install -o postgres -g postgres -m 0600 "\$dump_path" "\$restore_input"/,
  );
  assert.match(script, /TABLE DATA public schema_migrations/);
  assert.match(script, /EXTENSION - vector/);
  assert.match(script, /DROP DATABASE IF EXISTS/);
  assert.match(script, /CREATE DATABASE %I OWNER %I/);
  assert.match(script, /CREATE EXTENSION vector/);
  assert.match(script, /--exclude-schema=polar_catalog/);
  assert.match(script, /--role="\$POSTGRES_USER"/);
  assert.match(script, /--exit-on-error/);
  assert.match(script, /chown postgres:postgres "\$restore_list"/);
  assert.match(script, /"\$restore_input"/);
  assert.match(script, /validation_result/);
  assert.match(script, /"0\|t\|t"/);
  assert.match(script, /Root database restore refuses a writable production environment file/);
  assert.doesNotMatch(script, /1 \/ 0/);
  assert.doesNotMatch(script, /rm -rf|DROP ROLE|DROP TABLE/);
});
