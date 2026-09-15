#!/usr/bin/env node

import https from "node:https";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

import {
  createOssAuthorization,
  encodeObjectKey,
  readOssBackupConfig,
} from "./upload-production-database-backup.mjs";

const archiveNamePattern = /^marvels_chat-\d{8}T\d{6}Z\.dump\.cms$/;
const manifestNamePattern = /^marvels_chat-\d{8}T\d{6}Z\.dump\.cms\.manifest\.json$/;
const maxArchiveBytes = 5 * 1024 * 1024 * 1024;
const maxManifestBytes = 64 * 1024;

const responseHeader = (headers, name) => {
  const value = headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : String(value || "");
};

export function createOssDownloadRequest({
  objectName,
  environment = process.env,
  now = new Date(),
}) {
  const isArchive = archiveNamePattern.test(objectName);
  const isManifest = manifestNamePattern.test(objectName);
  if (!isArchive && !isManifest) {
    throw new Error("The requested object is not a supported Miaoxun backup artifact.");
  }
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    throw new Error("The OSS request time is invalid.");
  }

  const config = readOssBackupConfig(environment);
  const objectKey = `${config.prefix}/${objectName}`;
  const date = now.toUTCString();
  const headers = { Date: date };
  headers.Authorization = createOssAuthorization({
    accessKeyId: config.accessKeyId,
    accessKeySecret: config.accessKeySecret,
    method: "GET",
    date,
    headers,
    canonicalResource: `/${config.bucket}/${objectKey}`,
  });

  return {
    maxBytes: isManifest ? maxManifestBytes : maxArchiveBytes,
    objectKey,
    requestOptions: {
      protocol: "https:",
      hostname: `${config.bucket}.${config.endpoint}`,
      port: 443,
      path: `/${encodeObjectKey(objectKey)}`,
      method: "GET",
      headers,
    },
    timeoutMs: config.timeoutMs,
  };
}

export async function downloadProductionDatabaseBackupObject({
  objectName,
  environment = process.env,
  now = new Date(),
  output = process.stdout,
}) {
  const { maxBytes, objectKey, requestOptions, timeoutMs } = createOssDownloadRequest({
    objectName,
    environment,
    now,
  });

  await new Promise((resolve, reject) => {
    const request = https.request(requestOptions, (response) => {
      const statusCode = Number(response.statusCode || 0);
      if (statusCode !== 200) {
        const requestId = responseHeader(response.headers, "x-oss-request-id");
        response.resume();
        response.once("end", () => {
          reject(
            new Error(
              `OSS GET failed with HTTP ${statusCode}${
                requestId ? ` (request ${requestId})` : ""
              }.`,
            ),
          );
        });
        return;
      }

      const contentLength = Number(responseHeader(response.headers, "content-length"));
      if (!Number.isSafeInteger(contentLength) || contentLength <= 0 || contentLength > maxBytes) {
        response.resume();
        response.once("end", () => {
          reject(new Error(`OSS returned an invalid size for ${objectKey}.`));
        });
        return;
      }

      let receivedBytes = 0;
      response.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          response.destroy(new Error(`OSS exceeded the download limit for ${objectKey}.`));
        }
      });
      pipeline(response, output, { end: false })
        .then(() => {
          if (receivedBytes !== contentLength) {
            reject(new Error(`OSS returned an incomplete object for ${objectKey}.`));
            return;
          }
          resolve();
        })
        .catch(reject);
    });
    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error("OSS GET timed out."));
    });
    request.once("error", reject);
    request.end();
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [objectName] = process.argv.slice(2);
  if (!objectName || process.argv.length !== 3) {
    process.stderr.write(
      `Usage: ${path.basename(process.argv[1])} <backup-object-name>\n`,
    );
    process.exitCode = 2;
  } else {
    downloadProductionDatabaseBackupObject({ objectName }).catch((error) => {
      process.stderr.write(
        `Miaoxun offsite database backup download failed: ${
          error instanceof Error ? error.message : "unknown error"
        }\n`,
      );
      process.exitCode = 1;
    });
  }
}
