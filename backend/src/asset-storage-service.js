import crypto from "crypto";
import path from "path";
import { config as appConfig } from "./config.js";
import { HttpError } from "./http-error.js";

const contentTypes = {
  glb: "model/gltf-binary",
  obj: "model/obj",
  fbx: "application/octet-stream",
  stl: "model/stl",
  usdz: "model/vnd.usdz+zip",
  "3mf": "model/3mf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
};

const safePart = (value) =>
  String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80) || "item";

const encodeObjectKey = (key) => key.split("/").map(encodeURIComponent).join("/");

const inferExtension = (url, fallback = "bin") => {
  try {
    const pathname = new URL(url).pathname;
    const ext = path.extname(pathname).replace(/^\./, "").toLowerCase();
    return ext || fallback;
  } catch {
    return fallback;
  }
};

export function getOssRuntimeStatus(storageConfig = appConfig.oss) {
  const missing = [];
  if (!storageConfig?.bucket) missing.push("OSS_BUCKET");
  if (!storageConfig?.endpoint) missing.push("OSS_ENDPOINT");
  if (!storageConfig?.accessKeyId) missing.push("OSS_ACCESS_KEY_ID");
  if (!storageConfig?.accessKeySecret) missing.push("OSS_ACCESS_KEY_SECRET");

  return {
    configured: missing.length === 0,
    missing,
    provider: "oss",
    bucket: storageConfig?.bucket || "",
    endpoint: storageConfig?.endpoint || "",
    publicBaseUrl: storageConfig?.publicBaseUrl || "",
    timeoutMs: storageConfig?.timeoutMs || 60000,
    hasAccessKeyId: Boolean(storageConfig?.accessKeyId),
    hasAccessKeySecret: Boolean(storageConfig?.accessKeySecret),
  };
}

export function ossObjectUrl({ storageConfig = appConfig.oss, key }) {
  const baseUrl = storageConfig.publicBaseUrl ||
    (storageConfig.bucket && storageConfig.endpoint
      ? `https://${storageConfig.bucket}.${storageConfig.endpoint}`
      : "");
  return baseUrl ? `${baseUrl}/${encodeObjectKey(key)}` : "";
}

export function buildStationModelAssetKey({ userId, jobId, kind, format, sourceUrl = "" }) {
  const safeKind = safePart(kind);
  const ext = safeKind === "thumbnail" ? inferExtension(sourceUrl, "png") : safePart(format || inferExtension(sourceUrl, "bin"));
  return [
    "station-models",
    safePart(userId),
    safePart(jobId),
    `${safeKind}.${ext}`,
  ].join("/");
}

export function collectProviderModelAssetSources(providerJob = {}) {
  const modelUrls = providerJob.modelUrls && typeof providerJob.modelUrls === "object" ? providerJob.modelUrls : {};
  const modelSources = Object.entries(modelUrls)
    .filter(([, url]) => typeof url === "string" && /^https:\/\//i.test(url))
    .map(([format, url]) => ({
      kind: "model",
      format: String(format || "").toLowerCase(),
      url,
    }));
  const thumbnailUrl = providerJob.thumbnailUrl || "";
  const thumbnailSources = /^https:\/\//i.test(thumbnailUrl)
    ? [{ kind: "thumbnail", format: inferExtension(thumbnailUrl, "png"), url: thumbnailUrl }]
    : [];

  return [...modelSources, ...thumbnailSources];
}

export function buildOssPutObjectRequest({
  storageConfig = appConfig.oss,
  key,
  bytes,
  contentType = "application/octet-stream",
  now = new Date(),
}) {
  const status = getOssRuntimeStatus(storageConfig);
  if (!status.configured) {
    throw new HttpError(503, `OSS is not configured: ${status.missing.join(", ")}`, status);
  }

  const body = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const date = now.toUTCString();
  const canonicalizedResource = `/${storageConfig.bucket}/${key}`;
  const stringToSign = ["PUT", "", contentType, date, canonicalizedResource].join("\n");
  const signature = crypto
    .createHmac("sha1", storageConfig.accessKeySecret)
    .update(stringToSign)
    .digest("base64");
  const url = `https://${storageConfig.bucket}.${storageConfig.endpoint}/${encodeObjectKey(key)}`;

  return {
    method: "PUT",
    url,
    body,
    headers: {
      Date: date,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
      Authorization: `OSS ${storageConfig.accessKeyId}:${signature}`,
    },
  };
}

async function fetchWithTimeout({ fetchImpl, url, options = {}, timeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "Asset storage request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function downloadRemoteAsset({ url, fetchImpl = fetch, timeoutMs = 60000, maxBytes = 120 * 1024 * 1024 }) {
  if (!/^https:\/\//i.test(url)) {
    throw new HttpError(400, "Only HTTPS asset URLs can be persisted");
  }
  const response = await fetchWithTimeout({ fetchImpl, url, timeoutMs });
  if (!response.ok) {
    throw new HttpError(response.status, "Failed to download generated asset");
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxBytes) {
    throw new HttpError(413, "Generated asset is too large to persist");
  }
  return {
    bytes,
    contentType: response.headers.get("content-type") || "application/octet-stream",
  };
}

export async function putObjectToOss({
  storageConfig = appConfig.oss,
  key,
  bytes,
  contentType = "application/octet-stream",
  fetchImpl = fetch,
}) {
  const request = buildOssPutObjectRequest({ storageConfig, key, bytes, contentType });
  const response = await fetchWithTimeout({
    fetchImpl,
    url: request.url,
    timeoutMs: storageConfig.timeoutMs || 60000,
    options: {
      method: request.method,
      headers: request.headers,
      body: request.body,
    },
  });
  if (!response.ok) {
    throw new HttpError(response.status, "OSS rejected generated asset upload");
  }

  return {
    key,
    url: ossObjectUrl({ storageConfig, key }),
    contentType,
    byteSize: Buffer.byteLength(request.body),
  };
}

export async function persistProviderModelAssets({
  userId,
  job,
  providerJob,
  storageConfig = appConfig.oss,
  fetchImpl = fetch,
  putObject = putObjectToOss,
}) {
  const status = getOssRuntimeStatus(storageConfig);
  if (!status.configured) {
    throw new HttpError(503, `OSS is not configured: ${status.missing.join(", ")}`, status);
  }

  const sources = collectProviderModelAssetSources(providerJob);
  const modelSources = sources.filter((source) => source.kind === "model");
  if (!modelSources.length) {
    throw new HttpError(422, "3D provider returned no model files to persist");
  }

  const modelFiles = {};
  let thumbnail = null;
  for (const source of sources) {
    const key = buildStationModelAssetKey({
      userId,
      jobId: job.id,
      kind: source.kind === "thumbnail" ? "thumbnail" : `model-${source.format}`,
      format: source.format,
      sourceUrl: source.url,
    });
    const downloaded = await downloadRemoteAsset({
      url: source.url,
      fetchImpl,
      timeoutMs: storageConfig.timeoutMs || 60000,
    });
    const contentType = downloaded.contentType === "application/octet-stream"
      ? contentTypes[source.format] || downloaded.contentType
      : downloaded.contentType;
    const stored = await putObject({
      storageConfig,
      key,
      bytes: downloaded.bytes,
      contentType,
      fetchImpl,
    });

    const item = {
      format: source.format,
      storageProvider: "oss",
      storageKey: stored.key,
      url: stored.url,
      contentType: stored.contentType,
      byteSize: stored.byteSize,
    };
    if (source.kind === "thumbnail") {
      thumbnail = item;
    } else {
      modelFiles[source.format] = item;
    }
  }

  return {
    storageProvider: "oss",
    modelFiles,
    thumbnail,
    persistedAt: new Date().toISOString(),
  };
}
