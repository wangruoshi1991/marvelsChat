import { HttpError } from "./http-error.js";

const defaultKey = "anonymous";

const toPositiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export function createInMemoryRateLimiter({
  limit = 20,
  windowMs = 60 * 60 * 1000,
  now = () => Date.now(),
} = {}) {
  const safeLimit = toPositiveInteger(limit, 20);
  const safeWindowMs = toPositiveInteger(windowMs, 60 * 60 * 1000);
  const buckets = new Map();

  const check = (rawKey) => {
    const key = String(rawKey || defaultKey);
    const currentTime = now();
    let bucket = buckets.get(key);

    if (!bucket || currentTime >= bucket.resetAt) {
      bucket = {
        count: 0,
        resetAt: currentTime + safeWindowMs,
      };
      buckets.set(key, bucket);
    }

    if (bucket.count >= safeLimit) {
      return {
        limited: true,
        limit: safeLimit,
        remaining: 0,
        resetAt: bucket.resetAt,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((bucket.resetAt - currentTime) / 1000),
        ),
      };
    }

    bucket.count += 1;
    return {
      limited: false,
      limit: safeLimit,
      remaining: Math.max(0, safeLimit - bucket.count),
      resetAt: bucket.resetAt,
      retryAfterSeconds: 0,
    };
  };

  return {
    check,
    reset: () => buckets.clear(),
    size: () => buckets.size,
  };
}

export function createRateLimitMiddleware({
  action,
  limit,
  windowMs,
  limiter = createInMemoryRateLimiter({ limit, windowMs }),
  message = "Too many requests. Please try again later.",
  keyGenerator = (req) => req.user?.id || req.ip || defaultKey,
} = {}) {
  const actionName = String(action || "api");

  return (req, res, next) => {
    const subject = keyGenerator(req) || defaultKey;
    const result = limiter.check(`${actionName}:${subject}`);
    res.set("X-RateLimit-Limit", String(result.limit));
    res.set("X-RateLimit-Remaining", String(result.remaining));
    res.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));

    if (!result.limited) {
      next();
      return;
    }

    res.set("Retry-After", String(result.retryAfterSeconds));
    const error = new HttpError(429, message, {
      code: "RATE_LIMITED",
      action: actionName,
      limit: result.limit,
      retryAfterSeconds: result.retryAfterSeconds,
      resetAt: new Date(result.resetAt).toISOString(),
    });
    error.publicCode = "RATE_LIMITED";
    next(error);
  };
}
