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
    .replace(/^[.\-]+|[.\-]+$/g, "")
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

const createOssSignedUrl = ({
  method,
  objectKey,
  contentType = "",
  useInternalEndpoint = false,
}) => {
  assertOssConfigured();

  const expires = Math.floor(Date.now() / 1000) + uploadUrlTtlSeconds;
  const canonicalResource = `/${config.oss.bucket}/${objectKey}`;
  const stringToSign = [
    method,
    "",
    contentType,
    String(expires),
    canonicalResource,
  ].join("\n");
  const signature = crypto
    .createHmac("sha1", config.oss.accessKeySecret)
    .update(stringToSign)
    .digest("base64");

  const endpoint = useInternalEndpoint && config.oss.internalEndpoint
    ? config.oss.internalEndpoint
    : config.oss.endpoint;
  const url = new URL(
    `https://${config.oss.bucket}.${endpoint}/${encodeObjectKey(objectKey)}`,
  );
  url.searchParams.set("OSSAccessKeyId", config.oss.accessKeyId);
  url.searchParams.set("Expires", String(expires));
  url.searchParams.set("Signature", signature);
  return { expires, url };
};

export function createOssPutSignedUrl({
  objectKey,
  contentType,
  useInternalEndpoint = false,
}) {
  const normalizedContentType = contentType || "application/octet-stream";
  const { expires, url } = createOssSignedUrl({
    method: "PUT",
    objectKey,
    contentType: normalizedContentType,
    useInternalEndpoint,
  });

  return {
    method: "PUT",
    url: url.toString(),
    headers: {
      "Content-Type": normalizedContentType,
    },
    expiresAt: new Date(expires * 1000).toISOString(),
    objectKey,
    storageProvider: "aliyun-oss",
  };
}

export function createOssGetSignedUrl({ objectKey, useInternalEndpoint = false }) {
  const { url } = createOssSignedUrl({ method: "GET", objectKey, useInternalEndpoint });
  return url.toString();
}

export function createOssHeadSignedUrl({ objectKey, useInternalEndpoint = false }) {
  const { url } = createOssSignedUrl({ method: "HEAD", objectKey, useInternalEndpoint });
  return url.toString();
}

export function createOssDeleteSignedUrl({ objectKey, useInternalEndpoint = false }) {
  const { url } = createOssSignedUrl({ method: "DELETE", objectKey, useInternalEndpoint });
  return url.toString();
}

export async function inspectOssObject({ objectKey, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(createOssHeadSignedUrl({
      objectKey,
      useInternalEndpoint: true,
    }), {
      method: "HEAD",
      signal: AbortSignal.timeout(config.oss.timeoutMs),
    });
  } catch (error) {
    throw new HttpError(502, "Media storage verification failed.", {
      reason: error instanceof Error ? error.message : "OSS request failed",
    });
  }
  if (!response.ok) {
    throw new HttpError(
      response.status === 404 ? 409 : 502,
      response.status === 404
        ? "Uploaded media was not found in storage."
        : "Media storage verification failed.",
    );
  }

  const contentLengthHeader = response.headers.get("content-length");
  const contentLength = Number(contentLengthHeader);
  return {
    contentType: (response.headers.get("content-type") || "")
      .split(";", 1)[0]
      .trim()
      .toLowerCase(),
    contentLength:
      contentLengthHeader !== null && Number.isFinite(contentLength)
        ? contentLength
        : null,
    etag: response.headers.get("etag") || "",
  };
}

export async function fetchOssObject({
  objectKey,
  range = "",
  fetchImpl = fetch,
}) {
  try {
    const response = await fetchImpl(createOssGetSignedUrl({
      objectKey,
      useInternalEndpoint: true,
    }), {
      headers: range ? { Range: range } : undefined,
      signal: AbortSignal.timeout(config.oss.timeoutMs),
    });
    if (!response.ok) {
      throw new HttpError(
        response.status === 404 ? 404 : 502,
        response.status === 404
          ? "Media asset file not found."
          : "Media asset storage read failed.",
      );
    }
    return response;
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(502, "Media asset storage read failed.", {
      reason: error instanceof Error ? error.message : "OSS request failed",
    });
  }
}
export async function putOssObject({
  objectKey,
  body,
  contentType = "application/octet-stream",
  fetchImpl = fetch,
}) {
  const signed = createOssPutSignedUrl({
    objectKey,
    contentType,
    useInternalEndpoint: true,
  });
  let response;
  try {
    response = await fetchImpl(signed.url, {
      method: "PUT",
      headers: signed.headers,
      body,
      signal: AbortSignal.timeout(config.oss.timeoutMs),
    });
  } catch (error) {
    throw new HttpError(502, "Media storage write failed.", {
      reason: error instanceof Error ? error.message : "OSS request failed",
    });
  }
  if (!response.ok) throw new HttpError(502, "Media storage write failed.");
  return {
    stored: true,
    objectKey,
    contentType,
    byteSize: Buffer.isBuffer(body) ? body.length : null,
  };
}

export async function deleteOssObject({ objectKey, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl(createOssDeleteSignedUrl({
      objectKey,
      useInternalEndpoint: true,
    }), {
      method: "DELETE",
      signal: AbortSignal.timeout(config.oss.timeoutMs),
    });
  } catch (error) {
    throw new HttpError(502, "Media storage deletion failed.", {
      reason: error instanceof Error ? error.message : "OSS request failed",
    });
  }
  if (!response.ok && response.status !== 404) {
    throw new HttpError(502, "Media storage deletion failed.");
  }
  return { deleted: true };
}
