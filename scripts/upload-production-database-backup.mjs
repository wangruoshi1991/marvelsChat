#!/usr/bin/env node

import crypto from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import https from "node:https";
import path from "node:path";
import { fileURLToPath } from "node:url";

const maxSinglePutBytes = 5 * 1024 * 1024 * 1024;
const sha256Pattern = /^[a-f0-9]{64}$/;
const backupNamePattern = /^marvels_chat-(\d{8}T\d{6}Z)\.dump\.cms$/;

const requireValue = (value, name) => {
  const normalized = String(value || "").trim();
  if (!normalized) throw new Error(`${name} must be configured.`);
  return normalized;
};

const normalizeEndpoint = (value) => {
  const raw = requireValue(value, "MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT");
  const url = new URL(raw.includes("://") ? raw : `https://${raw}`);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      "MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT must be an HTTPS hostname without a path.",
    );
  }
  const hostname = url.hostname.toLowerCase();
  if (!/^oss-[a-z0-9-]+-internal\.aliyuncs\.com$/.test(hostname)) {
    throw new Error(
      "MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT must be an Alibaba Cloud OSS internal endpoint.",
    );
  }
  return hostname;
};

const normalizePrefix = (value) => {
  const prefix = requireValue(value, "MIAOXUN_DATABASE_BACKUP_OSS_PREFIX")
    .replace(/^\/+|\/+$/g, "");
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/.test(prefix)) {
    throw new Error("MIAOXUN_DATABASE_BACKUP_OSS_PREFIX is invalid.");
  }
  if (prefix.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("MIAOXUN_DATABASE_BACKUP_OSS_PREFIX contains an invalid path segment.");
  }
  return prefix;
};

const parseTimeout = (value) => {
  const timeoutMs = Number(value || 120000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 900000) {
    throw new Error(
      "MIAOXUN_DATABASE_BACKUP_OSS_TIMEOUT_MS must be between 1000 and 900000.",
    );
  }
  return timeoutMs;
};

export function readOssBackupConfig(environment = process.env) {
  const bucket = requireValue(
    environment.MIAOXUN_DATABASE_BACKUP_OSS_BUCKET,
    "MIAOXUN_DATABASE_BACKUP_OSS_BUCKET",
  );
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)) {
    throw new Error(
      "MIAOXUN_DATABASE_BACKUP_OSS_BUCKET must be a DNS-compatible bucket name without dots.",
    );
  }

  return {
    accessKeyId: requireValue(
      environment.MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_ID,
      "MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_ID",
    ),
    accessKeySecret: requireValue(
      environment.MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_SECRET,
      "MIAOXUN_DATABASE_BACKUP_OSS_ACCESS_KEY_SECRET",
    ),
    bucket,
    endpoint: normalizeEndpoint(environment.MIAOXUN_DATABASE_BACKUP_OSS_ENDPOINT),
    prefix: normalizePrefix(environment.MIAOXUN_DATABASE_BACKUP_OSS_PREFIX),
    timeoutMs: parseTimeout(environment.MIAOXUN_DATABASE_BACKUP_OSS_TIMEOUT_MS),
  };
}

const normalizeHeaderValue = (value) =>
  String(value).trim().replace(/[\t ]+/g, " ");

export function canonicalizeOssHeaders(headers) {
  return Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), normalizeHeaderValue(value)])
    .filter(([name]) => name.startsWith("x-oss-"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}:${value}\n`)
    .join("");
}

export function createOssAuthorization({
  accessKeyId,
  accessKeySecret,
  method,
  contentMd5 = "",
  contentType = "",
  date,
  headers = {},
  canonicalResource,
}) {
  const stringToSign = [
    method,
    contentMd5,
    contentType,
    date,
    `${canonicalizeOssHeaders(headers)}${canonicalResource}`,
  ].join("\n");
  const signature = crypto
    .createHmac("sha1", accessKeySecret)
    .update(stringToSign)
    .digest("base64");
  return `OSS ${accessKeyId}:${signature}`;
}

export const encodeObjectKey = (objectKey) =>
  objectKey
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

export async function hashFile(filePath) {
  const before = await stat(filePath);
  if (!before.isFile() || before.size <= 0) {
    throw new Error("The encrypted backup must be a non-empty regular file.");
  }
  if (before.size > maxSinglePutBytes) {
    throw new Error("The encrypted backup exceeds the OSS single-object upload limit.");
  }

  const sha256 = crypto.createHash("sha256");
  const md5 = crypto.createHash("md5");
  for await (const chunk of createReadStream(filePath)) {
    sha256.update(chunk);
    md5.update(chunk);
  }

  const after = await stat(filePath);
  if (before.size !== after.size || before.mtimeMs !== after.mtimeMs) {
    throw new Error("The encrypted backup changed while it was being hashed.");
  }

  return {
    bytes: before.size,
    md5Base64: md5.digest("base64"),
    sha256: sha256.digest("hex"),
  };
}

const md5Base64ToHex = (value) => Buffer.from(value, "base64").toString("hex");

const responseHeader = (headers, name) => {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
};

const requestOss = ({
  config,
  method,
  objectKey,
  contentLength,
  contentMd5 = "",
  contentType = "",
  ossHeaders = {},
  bodyPath,
  bodyBuffer,
  now = new Date(),
}) =>
  new Promise((resolve, reject) => {
    const date = now.toUTCString();
    const canonicalResource = `/${config.bucket}/${objectKey}`;
    const headers = {
      Date: date,
      ...ossHeaders,
    };
    if (method === "PUT") {
      headers["Content-Length"] = String(contentLength);
      headers["Content-MD5"] = contentMd5;
      headers["Content-Type"] = contentType;
    }
    headers.Authorization = createOssAuthorization({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      method,
      contentMd5,
      contentType,
      date,
      headers,
      canonicalResource,
    });

    const request = https.request(
      {
        protocol: "https:",
        hostname: `${config.bucket}.${config.endpoint}`,
        port: 443,
        path: `/${encodeObjectKey(objectKey)}`,
        method,
        headers,
      },
      (response) => {
        response.resume();
        response.once("end", () => {
          const statusCode = Number(response.statusCode || 0);
          if (statusCode < 200 || statusCode >= 300) {
            const requestId = responseHeader(response.headers, "x-oss-request-id");
            reject(
              new Error(
                `OSS ${method} failed with HTTP ${statusCode}${
                  requestId ? ` (request ${requestId})` : ""
                }.`,
              ),
            );
            return;
          }
          resolve({ headers: response.headers, statusCode });
        });
      },
    );
    request.setTimeout(config.timeoutMs, () => {
      request.destroy(new Error(`OSS ${method} timed out.`));
    });
    request.once("error", reject);

    if (bodyPath) {
      const body = createReadStream(bodyPath);
      body.once("error", (error) => request.destroy(error));
      body.pipe(request);
      return;
    }
    request.end(bodyBuffer);
  });

const verifyHead = ({ headers, expected, objectKey }) => {
  const contentLength = Number(responseHeader(headers, "content-length"));
  const etag = responseHeader(headers, "etag").replace(/^"|"$/g, "").toLowerCase();
  if (contentLength !== expected.bytes) {
    throw new Error(`OSS verification failed for ${objectKey}: size mismatch.`);
  }
  if (etag !== md5Base64ToHex(expected.md5Base64)) {
    throw new Error(`OSS verification failed for ${objectKey}: ETag mismatch.`);
  }
  for (const [name, value] of Object.entries(expected.metadata || {})) {
    if (responseHeader(headers, name) !== value) {
      throw new Error(`OSS verification failed for ${objectKey}: ${name} mismatch.`);
    }
  }
};

const putAndVerify = async ({
  config,
  objectKey,
  contentType,
  bodyPath,
  bodyBuffer,
  digest,
  metadata,
}) => {
  const ossHeaders = {
    "x-oss-forbid-overwrite": "true",
    "x-oss-server-side-encryption": "AES256",
    ...metadata,
  };
  await requestOss({
    config,
    method: "PUT",
    objectKey,
    contentLength: digest.bytes,
    contentMd5: digest.md5Base64,
    contentType,
    ossHeaders,
    bodyPath,
    bodyBuffer,
  });
  const verified = await requestOss({ config, method: "HEAD", objectKey });
  verifyHead({
    headers: verified.headers,
    expected: {
      ...digest,
      metadata: { ...metadata, "x-oss-server-side-encryption": "AES256" },
    },
    objectKey,
  });
};

const parseCreatedAt = (objectName) => {
  const match = objectName.match(backupNamePattern);
  if (!match) {
    throw new Error(
      "The encrypted object name must match marvels_chat-YYYYMMDDTHHMMSSZ.dump.cms.",
    );
  }
  const compact = match[1];
  const createdAt = new Date(
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` +
      `T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`,
  );
  const expectedIso =
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` +
    `T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}.000Z`;
  if (Number.isNaN(createdAt.getTime()) || createdAt.toISOString() !== expectedIso) {
    throw new Error("The backup timestamp is invalid.");
  }
  return expectedIso;
};

const hashBuffer = (buffer) => ({
  bytes: buffer.length,
  md5Base64: crypto.createHash("md5").update(buffer).digest("base64"),
  sha256: crypto.createHash("sha256").update(buffer).digest("hex"),
});

export async function uploadProductionDatabaseBackup({
  archivePath,
  objectName,
  plaintextSha256,
  recipientCertificateSha256,
  environment = process.env,
}) {
  if (!sha256Pattern.test(plaintextSha256)) {
    throw new Error("The plaintext backup SHA-256 is invalid.");
  }
  if (!sha256Pattern.test(recipientCertificateSha256)) {
    throw new Error("The recipient certificate SHA-256 is invalid.");
  }

  const config = readOssBackupConfig(environment);
  const createdAt = parseCreatedAt(objectName);
  const archiveDigest = await hashFile(archivePath);
  const archiveKey = `${config.prefix}/${objectName}`;
  const archiveMetadata = {
    "x-oss-meta-backup-format": "pg-custom-cms-v1",
    "x-oss-meta-ciphertext-sha256": archiveDigest.sha256,
    "x-oss-meta-plaintext-sha256": plaintextSha256,
    "x-oss-meta-recipient-cert-sha256": recipientCertificateSha256,
  };

  await putAndVerify({
    config,
    objectKey: archiveKey,
    contentType: "application/pkcs7-mime",
    bodyPath: archivePath,
    digest: archiveDigest,
    metadata: archiveMetadata,
  });

  const manifest = {
    schemaVersion: 1,
    project: "miaoxun",
    createdAt,
    archive: {
      objectKey: archiveKey,
      encryptedSizeBytes: archiveDigest.bytes,
      postgresFormat: "custom",
    },
    encryption: {
      container: "CMS AuthEnvelopedData DER",
      contentCipher: "AES-256-GCM",
      keyTransport: "RSA-OAEP-SHA256",
      recipientCertificateSha256,
    },
    integrity: {
      plaintextSha256,
      ciphertextSha256: archiveDigest.sha256,
      ciphertextContentMd5: archiveDigest.md5Base64,
    },
  };
  const manifestBuffer = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  const manifestDigest = hashBuffer(manifestBuffer);
  const manifestKey = `${archiveKey}.manifest.json`;
  await putAndVerify({
    config,
    objectKey: manifestKey,
    contentType: "application/json",
    bodyBuffer: manifestBuffer,
    digest: manifestDigest,
    metadata: {
      "x-oss-meta-backup-format": "pg-custom-cms-manifest-v1",
      "x-oss-meta-manifest-sha256": manifestDigest.sha256,
    },
  });

  return { archiveKey, manifestKey, ciphertextSha256: archiveDigest.sha256 };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [archivePath, objectName, plaintextSha256, recipientCertificateSha256] =
    process.argv.slice(2);
  if (
    !archivePath ||
    !objectName ||
    !plaintextSha256 ||
    !recipientCertificateSha256 ||
    process.argv.length !== 6
  ) {
    process.stderr.write(
      `Usage: ${path.basename(process.argv[1])} ` +
        "<encrypted-archive> <object-name> <plaintext-sha256> <recipient-cert-sha256>\n",
    );
    process.exitCode = 2;
  } else {
    uploadProductionDatabaseBackup({
      archivePath,
      objectName,
      plaintextSha256: plaintextSha256.toLowerCase(),
      recipientCertificateSha256: recipientCertificateSha256.toLowerCase(),
    })
      .then(({ archiveKey, manifestKey, ciphertextSha256 }) => {
        process.stdout.write(
          `Miaoxun offsite database backup completed: ${archiveKey}; ` +
            `manifest=${manifestKey}; sha256=${ciphertextSha256}\n`,
        );
      })
      .catch((error) => {
        process.stderr.write(
          `Miaoxun offsite database backup failed: ${
            error instanceof Error ? error.message : "unknown error"
          }\n`,
        );
        process.exitCode = 1;
      });
  }
}
