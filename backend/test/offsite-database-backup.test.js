import assert from "node:assert/strict";
import crypto from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  canonicalizeOssHeaders,
  createOssAuthorization,
  readOssBackupConfig,
} from "../../scripts/upload-production-database-backup.mjs";
import {
  validateOffsiteBackupManifest,
  verifyOffsiteDatabaseBackup,
} from "../../scripts/verify-offsite-database-backup.mjs";

const validEnvironment = {
  MIAOXUN_DATABASE_BACKUP_OSS_BUCKET: "miaoxun-database-backups",
  MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT: "oss-cn-shanghai-internal.aliyuncs.com",
  MIAOXUN_DATABASE_BACKUP_OSS_PREFIX: "postgresql/v1",
  MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_ID: "backup-access-key",
  MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_SECRET: "backup-access-secret",
  MIAOXUN_DATABASE_BACKUP_OSS_TIMEOUT_MS: "120000",
};

test("offsite backup configuration is explicit and rejects unsafe endpoints", () => {
  assert.deepEqual(readOssBackupConfig(validEnvironment), {
    accessKeyId: "backup-access-key",
    accessKeySecret: "backup-access-secret",
    bucket: "miaoxun-database-backups",
    endpoint: "oss-cn-shanghai-internal.aliyuncs.com",
    prefix: "postgresql/v1",
    timeoutMs: 120000,
  });

  assert.throws(
    () => readOssBackupConfig({ ...validEnvironment, MIAOXUN_DATABASE_BACKUP_OSS_BUCKET: "" }),
    /must be configured/,
  );
  assert.throws(
    () =>
      readOssBackupConfig({
        ...validEnvironment,
        MIAOXUN_DATABASE_BACKUP_OSS_BUCKET: "Miaoxun-Database-Backups",
      }),
    /DNS-compatible bucket name/,
  );
  assert.throws(
    () =>
      readOssBackupConfig({
        ...validEnvironment,
        MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT: "http://oss-cn-shanghai.aliyuncs.com",
      }),
    /HTTPS hostname/,
  );
  assert.throws(
    () =>
      readOssBackupConfig({
        ...validEnvironment,
        MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT: "https://example.com",
      }),
    /OSS internal endpoint/,
  );
  assert.throws(
    () =>
      readOssBackupConfig({
        ...validEnvironment,
        MIAOXUN_DATABASE_BACKUP_OSS_PREFIX: "postgresql/../other",
      }),
    /invalid path segment/,
  );
});

test("OSS authorization canonicalizes metadata deterministically", () => {
  const headers = {
    "x-oss-meta-z": "one   two",
    "X-OSS-META-A": "value",
    "x-oss-server-side-encryption": "AES256",
    Ignored: "header",
  };
  assert.equal(
    canonicalizeOssHeaders(headers),
    "x-oss-meta-a:value\nx-oss-meta-z:one two\nx-oss-server-side-encryption:AES256\n",
  );
  assert.equal(
    createOssAuthorization({
      accessKeyId: "test-id",
      accessKeySecret: "test-secret",
      method: "PUT",
      contentMd5: "CY9rzUYh03PK3k6DJie09g==",
      contentType: "application/pkcs7-mime",
      date: "Fri, 11 Sep 2026 06:00:00 GMT",
      headers,
      canonicalResource: "/bucket/postgresql/v1/file.cms",
    }),
    "OSS test-id:SsaknXFVU9NY7x6vhCNJo/PZId4=",
  );
});

test("offsite backup verification detects ciphertext and manifest tampering", async () => {
  const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "miaoxun-backup-test-"));
  const archivePath = path.join(
    temporaryDirectory,
    "marvels_chat-20260911T060000Z.dump.cms",
  );
  const manifestPath = `${archivePath}.manifest.json`;
  const archive = Buffer.from("encrypted-database-archive", "utf8");
  const digest = {
    md5: crypto.createHash("md5").update(archive).digest("base64"),
    sha256: crypto.createHash("sha256").update(archive).digest("hex"),
  };
  const manifest = {
    schemaVersion: 1,
    project: "miaoxun",
    createdAt: "2026-09-11T06:00:00.000Z",
    archive: {
      objectKey: `postgresql/v1/${path.basename(archivePath)}`,
      encryptedSizeBytes: archive.length,
      postgresFormat: "custom",
    },
    encryption: {
      container: "CMS AuthEnvelopedData DER",
      contentCipher: "AES-256-GCM",
      keyTransport: "RSA-OAEP-SHA256",
      recipientCertificateSha256: "a".repeat(64),
    },
    integrity: {
      plaintextSha256: "b".repeat(64),
      ciphertextSha256: digest.sha256,
      ciphertextContentMd5: digest.md5,
    },
  };

  try {
    await writeFile(archivePath, archive);
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    assert.equal(
      (await verifyOffsiteDatabaseBackup({ archivePath, manifestPath })).plaintextSha256,
      "b".repeat(64),
    );

    await writeFile(manifestPath, "x".repeat(64 * 1024 + 1));
    await assert.rejects(
      verifyOffsiteDatabaseBackup({ archivePath, manifestPath }),
      /non-empty file up to 64 KiB/,
    );
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);

    await writeFile(archivePath, Buffer.from("tampered", "utf8"));
    await assert.rejects(
      verifyOffsiteDatabaseBackup({ archivePath, manifestPath }),
      /does not match its manifest/,
    );
    assert.throws(
      () => validateOffsiteBackupManifest({ ...manifest, unexpected: true }, path.basename(archivePath)),
      /unsupported shape/,
    );
    assert.throws(
      () =>
        validateOffsiteBackupManifest(
          { ...manifest, createdAt: "2026-09-12T06:00:00.000Z" },
          path.basename(archivePath),
        ),
      /creation time is invalid/,
    );
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
});
