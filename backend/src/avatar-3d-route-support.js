import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { HttpError } from "./http-error.js";
import { createRateLimitMiddleware } from "./rate-limit-service.js";
import { createUsageEvent, hashRequestIp } from "./repositories.js";

const hour = 60 * 60 * 1000;
const day = 24 * hour;

export const avatar3dPhotoMutationLimit = createRateLimitMiddleware({
  action: "avatar3d.photo.mutate",
  limit: 30,
  windowMs: hour,
  message: "照片操作过于频繁，请稍后再试。",
});

export const avatar3dJobCreateLimit = createRateLimitMiddleware({
  action: "avatar3d.job.create",
  limit: 6,
  windowMs: day,
  message: "生成请求过于频繁，请明天再试。",
});

export const noStore = (res) => res.set("Cache-Control", "private, no-store");

export const privateImmutableCacheControl = "private, max-age=31536000, immutable";

export const streamAvatar3dPrivateObject = async (
  res,
  resource,
  { cacheControl = "private, no-store" } = {},
) => {
  const response = resource?.response;
  if (!response?.body) {
    throw new HttpError(502, "Private storage returned an empty response.");
  }

  res.status(response.status);
  for (const header of [
    "accept-ranges",
    "content-length",
    "content-range",
    "content-type",
    "etag",
    "last-modified",
  ]) {
    const value = response.headers?.get?.(header);
    if (value) res.setHeader(header, value);
  }
  if (!response.headers?.get?.("content-type") && resource.contentType) {
    res.setHeader("content-type", resource.contentType);
  }
  res.setHeader("cache-control", cacheControl);
  res.setHeader("vary", "Authorization");
  res.setHeader("x-content-type-options", "nosniff");

  try {
    await pipeline(Readable.fromWeb(response.body), res);
  } catch (error) {
    if (!res.destroyed) res.destroy(error);
  }
};

export const createAvatar3dUsageRecorder = (
  req,
  recordUsageEvent = createUsageEvent,
) => (eventType, targetType, targetId, payload = {}) => recordUsageEvent({
  userId: req.user.id,
  eventType,
  targetType,
  targetId,
  payload,
  ipHash: hashRequestIp(req.ip),
  userAgent: req.get("user-agent") || "",
});
