import { HttpError } from "./http-error.js";
import { deleteLocalMediaObject } from "./local-media-storage.js";
import { deleteOssObject } from "./oss-service.js";

const ossProviders = new Set(["oss", "aliyun-oss"]);

export async function deletePrivateStorageObject(
  { provider, objectKey },
  {
    deleteLocalObject = deleteLocalMediaObject,
    deleteOss = deleteOssObject,
  } = {},
) {
  const normalizedKey = String(objectKey || "").trim();
  if (!normalizedKey) return;

  const normalizedProvider = String(provider || "").trim().toLowerCase();
  if (normalizedProvider === "local") {
    await deleteLocalObject(normalizedKey);
    return;
  }
  if (ossProviders.has(normalizedProvider)) {
    await deleteOss({ objectKey: normalizedKey });
    return;
  }
  throw new HttpError(500, "Unsupported storage provider.", {
    code: "UNSUPPORTED_STORAGE_PROVIDER",
  });
}
