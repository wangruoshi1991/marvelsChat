#!/usr/bin/env node

import crypto from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hashFile } from "./upload-production-database-backup.mjs";

const sha256Pattern = /^[a-f0-9]{64}$/;
const archiveNamePattern = /^marvels_chat-(\d{8}T\d{6}Z)\.dump\.cms$/;
const maxManifestBytes = 64 * 1024;

const assertSha256 = (value, label) => {
  if (!sha256Pattern.test(value)) throw new Error(`${label} is invalid.`);
};

const assertExactKeys = (value, keys, label) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has an unsupported shape.`);
  }
};

export function validateOffsiteBackupManifest(manifest, archiveName) {
  assertExactKeys(
    manifest,
    ["schemaVersion", "project", "createdAt", "archive", "encryption", "integrity"],
    "The offsite backup manifest",
  );
  if (manifest.schemaVersion !== 1 || manifest.project !== "miaoxun") {
    throw new Error("The offsite backup manifest version or project is unsupported.");
  }
  const timestamp = archiveName.match(archiveNamePattern)?.[1] || "";
  const expectedCreatedAt = timestamp
    ? `${timestamp.slice(0, 4)}-${timestamp.slice(4, 6)}-${timestamp.slice(6, 8)}` +
      `T${timestamp.slice(9, 11)}:${timestamp.slice(11, 13)}:${timestamp.slice(13, 15)}.000Z`
    : "";
  if (
    !expectedCreatedAt ||
    Number.isNaN(new Date(expectedCreatedAt).getTime()) ||
    new Date(expectedCreatedAt).toISOString() !== expectedCreatedAt ||
    manifest.createdAt !== expectedCreatedAt
  ) {
    throw new Error("The offsite backup creation time is invalid.");
  }

  assertExactKeys(
    manifest.archive,
    ["objectKey", "encryptedSizeBytes", "postgresFormat"],
    "The archive descriptor",
  );
  if (
    typeof manifest.archive.objectKey !== "string" ||
    !manifest.archive.objectKey.endsWith(`/${archiveName}`) ||
    !Number.isSafeInteger(manifest.archive.encryptedSizeBytes) ||
    manifest.archive.encryptedSizeBytes <= 0 ||
    manifest.archive.postgresFormat !== "custom"
  ) {
    throw new Error("The archive descriptor is invalid.");
  }

  assertExactKeys(
    manifest.encryption,
    ["container", "contentCipher", "keyTransport", "recipientCertificateSha256"],
    "The encryption descriptor",
  );
  if (
    manifest.encryption.container !== "CMS AuthEnvelopedData DER" ||
    manifest.encryption.contentCipher !== "AES-256-GCM" ||
    manifest.encryption.keyTransport !== "RSA-OAEP-SHA256"
  ) {
    throw new Error("The backup encryption format is unsupported.");
  }
  assertSha256(
    manifest.encryption.recipientCertificateSha256,
    "The recipient certificate SHA-256",
  );

  assertExactKeys(
    manifest.integrity,
    ["plaintextSha256", "ciphertextSha256", "ciphertextContentMd5"],
    "The integrity descriptor",
  );
  assertSha256(manifest.integrity.plaintextSha256, "The plaintext SHA-256");
  assertSha256(manifest.integrity.ciphertextSha256, "The ciphertext SHA-256");
  if (!/^[A-Za-z0-9+/]{22}==$/.test(manifest.integrity.ciphertextContentMd5)) {
    throw new Error("The ciphertext Content-MD5 is invalid.");
  }
  return manifest;
}

export async function verifyOffsiteDatabaseBackup({
  archivePath,
  manifestPath,
  recipientCertificatePath,
}) {
  let manifestStats;
  try {
    manifestStats = await stat(manifestPath);
  } catch (error) {
    throw new Error("The offsite backup manifest cannot be read.", { cause: error });
  }
  if (
    !manifestStats.isFile() ||
    manifestStats.size <= 0 ||
    manifestStats.size > maxManifestBytes
  ) {
    throw new Error("The offsite backup manifest must be a non-empty file up to 64 KiB.");
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `The offsite backup manifest is not valid JSON: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
      { cause: error },
    );
  }
  validateOffsiteBackupManifest(manifest, path.basename(archivePath));

  const digest = await hashFile(archivePath);
  if (
    digest.bytes !== manifest.archive.encryptedSizeBytes ||
    digest.sha256 !== manifest.integrity.ciphertextSha256 ||
    digest.md5Base64 !== manifest.integrity.ciphertextContentMd5
  ) {
    throw new Error("The encrypted archive does not match its manifest.");
  }

  if (recipientCertificatePath) {
    const certificatePem = await readFile(recipientCertificatePath, "utf8");
    const certificate = new crypto.X509Certificate(certificatePem);
    const fingerprint = crypto.createHash("sha256").update(certificate.raw).digest("hex");
    if (fingerprint !== manifest.encryption.recipientCertificateSha256) {
      throw new Error("The recipient certificate does not match the backup manifest.");
    }
  }

  return {
    plaintextSha256: manifest.integrity.plaintextSha256,
    ciphertextSha256: digest.sha256,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const printPlaintext = process.argv[2] === "--print-plaintext-sha256";
  const offset = printPlaintext ? 3 : 2;
  const [archivePath, manifestPath, recipientCertificatePath] = process.argv.slice(offset);
  const expectedLength = printPlaintext ? 6 : 5;
  if (!archivePath || !manifestPath || !recipientCertificatePath || process.argv.length !== expectedLength) {
    process.stderr.write(
      `Usage: ${path.basename(process.argv[1])} [--print-plaintext-sha256] ` +
        "<encrypted-archive> <manifest> <recipient-certificate>\n",
    );
    process.exitCode = 2;
  } else {
    verifyOffsiteDatabaseBackup({ archivePath, manifestPath, recipientCertificatePath })
      .then(({ plaintextSha256, ciphertextSha256 }) => {
        process.stdout.write(
          printPlaintext
            ? `${plaintextSha256}\n`
            : `Encrypted database backup verified: sha256=${ciphertextSha256}\n`,
        );
      })
      .catch((error) => {
        process.stderr.write(
          `Offsite database backup verification failed: ${
            error instanceof Error ? error.message : "unknown error"
          }\n`,
        );
        process.exitCode = 1;
      });
  }
}
