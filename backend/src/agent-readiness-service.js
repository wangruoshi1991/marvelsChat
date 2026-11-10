import { getModelRuntimeStatus } from "./agent-runtime.js";
import { getOssRuntimeStatus } from "./asset-storage-service.js";
import { buildMediaRetrievalRuntimeStatus } from "./media-retrieval-runtime-status.js";
import { getComicImageProviderStatus } from "./comic-image-provider.js";
import { getAITaskWorkerStatus } from "./ai-task-worker-status-repository.js";

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
  mediaImageStatus = getComicImageProviderStatus(),
  aiTaskWorkerStatus,
} = {}) {
  const model = providerStatus(modelStatus, "new-api");
  const oss = providerStatus(ossStatus, "oss");
  const modelRequired = ["NEW_API_BASE_URL", "NEW_API_KEY", "NEW_API_MODEL"];
  const ossRequired = ["OSS_BUCKET", "OSS_ENDPOINT", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"];
  const imageRequired = ["MEDIA_GENERATION_ENABLED", "MEDIA_GENERATION_PROVIDER", "MEDIA_GENERATION_API_BASE_URL", "MEDIA_GENERATION_API_KEY", "MEDIA_GENERATION_IMAGE_MODEL"];
  const image = { ...providerStatus(mediaImageStatus, "unconfigured"), contractVerified: mediaImageStatus?.contractVerified === true };
  image.configured = image.configured && image.contractVerified;
  const workerStatus = aiTaskWorkerStatus || await getAITaskWorkerStatus();
  const worker = {
    provider: "ai-task-worker",
    configured: workerStatus?.state === "ready" && workerStatus?.capabilities?.includes("comic_render") === true,
    state: workerStatus?.state === "ready" ? "ready" : "unavailable",
    capabilities: unique(workerStatus?.capabilities),
    missing: [],
  };
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
    "ui-agent": readiness({
      configured: model.configured,
      requiredEnv: modelRequired,
      missingEnv: model.missing,
      capabilityNeeds: ["ui_preference_preview"],
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
      configured: model.configured && image.configured && worker.configured && oss.configured,
      requiredEnv: [...modelRequired, ...imageRequired, ...ossRequired],
      missingEnv: [...model.missing, ...image.missing, ...oss.missing],
      capabilityNeeds: ["image_generation", "comic_rendering"],
      providers: { model, image, worker, oss },
    }),
    "video-production": readiness({
      configured: model.configured,
      requiredEnv: modelRequired,
      missingEnv: model.missing,
      capabilityNeeds: ["video_generation_provider", "render_queue"],
      providers: { model },
    }),
    "media-retrieval": readiness({
      configured: retrieval.readiness.state === "ready",
      capabilityNeeds: retrieval.routeEligibility.reasonCodes,
    }),
  };
}
