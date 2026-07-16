import { config } from "./config.js";
import { HttpError } from "./http-error.js";

export function homepageFeatureForUser(user, runtime = config.homepage) {
  const identifiers = [user?.id, user?.email]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const allowlist = Array.isArray(runtime?.allowlist) ? runtime.allowlist : [];
  const allowlisted = allowlist.includes("*")
    || identifiers.some((identifier) => allowlist.includes(identifier))
    || (!runtime?.requireAllowlist && allowlist.length === 0);

  return {
    enabled: Boolean(runtime?.enabled && allowlisted),
    publicVisibilityEnabled: false,
    generationDailyLimit: Number(runtime?.generationDailyLimit || 5),
    refineDailyLimit: Number(runtime?.refineDailyLimit || 20),
  };
}

export function requireHomepageV1(req, _res, next) {
  if (!homepageFeatureForUser(req.user).enabled) {
    next(new HttpError(404, "Homepage feature is not available."));
    return;
  }
  next();
}
