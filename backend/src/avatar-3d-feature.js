import { config } from "./config.js";
import { HttpError } from "./http-error.js";
import {
  avatar3dCostVersion,
  avatar3dDefaultQualityPreset,
  publicAvatar3dQualityCatalog,
} from "./avatar-3d-quality.js";

export function avatar3dFeatureForUser(user, runtime = config.avatar3d) {
  const identifiers = [user?.id, user?.email]
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);
  const allowlist = Array.isArray(runtime?.allowlist) ? runtime.allowlist : [];
  const allowlisted = allowlist.includes("*")
    || identifiers.some((identifier) => allowlist.includes(identifier))
    || (!runtime?.requireAllowlist && allowlist.length === 0);

  return {
    enabled: Boolean(runtime?.enabled && allowlisted),
    generationAvailable: Boolean(runtime?.providerReady),
    dailyLimit: Number(runtime?.dailyLimit || 3),
    retentionDays: Number(runtime?.retentionDays || 7),
    costVersion: avatar3dCostVersion,
    referenceGenerationEstimatedCostFen: Number(
      runtime?.referenceGenerationEstimatedCostFen || 200
    ),
    defaultQualityPreset: avatar3dDefaultQualityPreset,
    qualityPresets: publicAvatar3dQualityCatalog(runtime),
  };
}

export function requireAvatar3d(req, _res, next) {
  if (!avatar3dFeatureForUser(req.user).enabled) {
    next(new HttpError(404, "Avatar feature is not available."));
    return;
  }
  next();
}

export function assertAvatar3dQuota({ dailyUsed, dailyLimit, hasActiveJob }) {
  if (hasActiveJob) {
    throw new HttpError(409, "Another avatar task is already active.", {
      code: "ACTIVE_JOB_EXISTS",
    });
  }
  if (Number(dailyUsed) >= Number(dailyLimit)) {
    throw new HttpError(429, "Daily avatar generation limit reached.", {
      code: "DAILY_LIMIT_REACHED",
    });
  }
}
