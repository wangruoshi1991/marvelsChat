import crypto from "crypto";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";

const uploadUrlTtlSeconds = 600;

const encodeObjectKey = (key) =>
  key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

const safeFilename = (filename = "") =>
  String(filename)
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "upload";

const assertOssConfigured = () => {
  const missing = [];
  if (!config.oss.bucket) missing.push("OSS_BUCKET");
  if (!config.oss.endpoint) missing.push("OSS_ENDPOINT");
  if (!config.oss.accessKeyId) missing.push("OSS_ACCESS_KEY_ID");
  if (!config.oss.accessKeySecret) missing.push("OSS_ACCESS_KEY_SECRET");
  if (missing.length) {
    throw new HttpError(503, "OSS upload is not configured.", { missing });
  }
};

export const buildStationMediaObjectKey = ({
  userId,
  assetId,
  originalFilename,
}) =>
  `users/${userId}/station-media/${assetId}/${safeFilename(originalFilename)}`;

export function createOssPutSignedUrl({ objectKey, contentType }) {
  assertOssConfigured();

  const expires = Math.floor(Date.now() / 1000) + uploadUrlTtlSeconds;
  const canonicalResource = `/${config.oss.bucket}/${objectKey}`;
  const stringToSign = [
    "PUT",
    "",
    contentType || "application/octet-stream",
    String(expires),
    canonicalResource,
  ].join("\n");
  const signature = crypto
    .createHmac("sha1", config.oss.accessKeySecret)
    .update(stringToSign)
    .digest("base64");

  const url = new URL(
    `https://${config.oss.bucket}.${config.oss.endpoint}/${encodeObjectKey(objectKey)}`,
  );
  url.searchParams.set("OSSAccessKeyId", config.oss.accessKeyId);
  url.searchParams.set("Expires", String(expires));
  url.searchParams.set("Signature", signature);

  return {
    method: "PUT",
    url: url.toString(),
    headers: {
      "Content-Type": contentType || "application/octet-stream",
    },
    expiresAt: new Date(expires * 1000).toISOString(),
    objectKey,
    storageProvider: "aliyun-oss",
  };
}

export function createOssGetSignedUrl({ objectKey }) {
  assertOssConfigured();

  const expires = Math.floor(Date.now() / 1000) + uploadUrlTtlSeconds;
  const canonicalResource = `/${config.oss.bucket}/${objectKey}`;
  const stringToSign = ["GET", "", "", String(expires), canonicalResource].join(
    "\n",
  );
  const signature = crypto
    .createHmac("sha1", config.oss.accessKeySecret)
    .update(stringToSign)
    .digest("base64");

  const url = new URL(
    `https://${config.oss.bucket}.${config.oss.endpoint}/${encodeObjectKey(objectKey)}`,
  );
  url.searchParams.set("OSSAccessKeyId", config.oss.accessKeyId);
  url.searchParams.set("Expires", String(expires));
  url.searchParams.set("Signature", signature);

  return url.toString();
}
