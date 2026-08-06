import { config as appConfig } from "./config.js";

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
