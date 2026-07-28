import { getModelRuntimeStatus } from "./agent-runtime.js";
import { getOssRuntimeStatus } from "./asset-storage-service.js";

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

export function buildAgentReadiness({
  modelStatus = getModelRuntimeStatus(),
  ossStatus = getOssRuntimeStatus(),
} = {}) {
  const model = providerStatus(modelStatus, "new-api");
  const oss = providerStatus(ossStatus, "oss");
  const ossRequired = ["OSS_BUCKET", "OSS_ENDPOINT", "OSS_ACCESS_KEY_ID", "OSS_ACCESS_KEY_SECRET"];

  return {
    "miaoxun-butler": readiness({
      configured: true,
      capabilityNeeds: ["agent_orchestration"],
    }),
    "virtual-character": readiness({
      configured: true,
      capabilityNeeds: ["production_avatar_assets"],
    }),
    "site-builder": readiness({
      configured: true,
      optionalEnv: ["NEW_API_BASE_URL", "NEW_API_KEY", "NEW_API_MODEL"],
      missingOptionalEnv: model.missing,
      providers: { model },
    }),
    "model-3d": readiness({
      configured: true,
      optionalEnv: ["NEW_API_BASE_URL", "NEW_API_KEY", "NEW_API_MODEL"],
      missingOptionalEnv: model.missing,
      capabilityNeeds: ["avatar_generation_guidance_only"],
      providers: { model },
    }),
    "album-manager": readiness({
      configured: oss.configured,
      requiredEnv: ossRequired,
      missingEnv: oss.missing,
      capabilityNeeds: ["vision_captioning"],
      providers: { oss },
    }),
    "file-preprocessor": readiness({
      configured: true,
      requiredEnv: ossRequired,
      missingEnv: oss.missing,
      capabilityNeeds: ["document_parsers"],
      providers: { oss },
    }),
    "comic-diary": readiness({
      configured: true,
      capabilityNeeds: ["image_generation", "comic_rendering"],
    }),
    "video-production": readiness({
      configured: false,
      requiredEnv: ossRequired,
      missingEnv: oss.missing,
      capabilityNeeds: ["video_generation_provider", "render_queue"],
      providers: { oss },
    }),
  };
}
