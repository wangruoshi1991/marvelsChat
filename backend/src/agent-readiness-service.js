import { getModelRuntimeStatus } from "./agent-runtime.js";
import { getOssRuntimeStatus } from "./asset-storage-service.js";
import { buildMediaRetrievalRuntimeStatus } from "./media-retrieval-runtime-status.js";

const unique = (items = []) =>
  Array.from(new Set(items.map((item) => String(item || "").trim()).filter(Boolean)));

const missingFrom = (status) => unique(Array.isArray(status?.missing) ? status.missing : []);

const providerStatus = (status, provider) => ({
  provider: status?.provider || provider,
  configured: Boolean(status?.configured),
  missing: missingFrom(status),
});

const readiness = ({
  configured,
  requiredEnv = [],
  missingEnv = [],
  optionalEnv = [],
  missingOptionalEnv = [],
  capabilityNeeds = [],
  providers = {},
}) => ({
  configured: Boolean(configured),
  requiredEnv: unique(requiredEnv),
  missingEnv: unique(missingEnv),
  optionalEnv: unique(optionalEnv),
  missingOptionalEnv: unique(missingOptionalEnv),
  capabilityNeeds: unique(capabilityNeeds),
  providers,
});

export async function buildAgentReadiness({
  modelStatus = getModelRuntimeStatus(),
  ossStatus = getOssRuntimeStatus(),
  mediaRetrievalStatus,
} = {}) {
  const model = providerStatus(modelStatus, "new-api");
  const oss = providerStatus(ossStatus, "oss");
  const modelRequired = ["NEW_API_BASE_URL", "NEW_API_KEY", "NEW_API_MODEL"];
  const ossRequired = ["OSS_BUCKET", "OSS_ENDPOINT", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"];
  const retrieval =
    mediaRetrievalStatus || await buildMediaRetrievalRuntimeStatus();

  return {
    "miaoxun-butler": readiness({
      configured: model.configured,
      requiredEnv: modelRequired,
      missingEnv: model.missing,
      capabilityNeeds: ["agent_orchestration"],
      providers: { model },
    }),
    "virtual-character": readiness({
      configured: model.configured,
      requiredEnv: modelRequired,
      missingEnv: model.missing,
      capabilityNeeds: ["production_avatar_assets"],
      providers: { model },
    }),
    "site-builder": readiness({
      configured: model.configured,
      requiredEnv: modelRequired,
      missingEnv: model.missing,
      providers: { model },
    }),
    "model-3d": readiness({
      configured: model.configured,
      requiredEnv: modelRequired,
      missingEnv: model.missing,
      capabilityNeeds: ["avatar_generation_guidance_only"],
      providers: { model },
    }),
    "album-manager": readiness({
      configured: model.configured && oss.configured,
      requiredEnv: [...modelRequired, ...ossRequired],
      missingEnv: [...model.missing, ...oss.missing],
      capabilityNeeds: ["vision_captioning"],
      providers: { model, oss },
    }),
    "file-preprocessor": readiness({
      configured: model.configured,
      requiredEnv: modelRequired,
      missingEnv: model.missing,
      optionalEnv: ossRequired,
      missingOptionalEnv: oss.missing,
      capabilityNeeds: ["document_parsers"],
      providers: { model, oss },
    }),
    "comic-diary": readiness({
      configured: model.configured,
      requiredEnv: modelRequired,
      missingEnv: model.missing,
      capabilityNeeds: ["image_generation", "comic_rendering"],
      providers: { model },
    }),
    "video-production": readiness({
      configured: false,
      requiredEnv: [...modelRequired, ...ossRequired],
      missingEnv: [...model.missing, ...oss.missing],
      capabilityNeeds: ["video_generation_provider", "render_queue"],
      providers: { model, oss },
    }),
    "media-retrieval": readiness({
      configured: retrieval.readiness.state === "ready",
      capabilityNeeds: retrieval.routeEligibility.reasonCodes,
    }),
  };
}
