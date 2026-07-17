import { getModelRuntimeStatus } from "./agent-runtime.js";
import { getOssRuntimeStatus } from "./asset-storage-service.js";
import { config } from "./config.js";

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

export const getDashscopeRuntimeStatus = (runtime = config.dashscope) => {
  const missing = [];
  if (!runtime?.apiKey) missing.push("DASHSCOPE_API_KEY");
  if (!runtime?.workspaceId) missing.push("DASHSCOPE_WORKSPACE_ID");
  return {
    provider: "aliyun-model-studio",
    configured: missing.length === 0,
    missing,
  };
};

export const getAvatarFeatureRuntimeStatus = (runtime = config.avatar3d) => ({
  provider: "avatar-3d-web",
  configured: Boolean(runtime?.enabled),
  missing: runtime?.enabled ? [] : ["AVATAR_3D_ENABLED"],
});

export function buildAgentReadiness({
  modelStatus = getModelRuntimeStatus(),
  dashscopeStatus = getDashscopeRuntimeStatus(),
  ossStatus = getOssRuntimeStatus(),
  avatarFeatureStatus = getAvatarFeatureRuntimeStatus(),
} = {}) {
  const model = providerStatus(modelStatus, "new-api");
  const dashscope = providerStatus(dashscopeStatus, "aliyun-model-studio");
  const oss = providerStatus(ossStatus, "oss");
  const avatarWeb = providerStatus(avatarFeatureStatus, "avatar-3d-web");
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
      configured: dashscope.configured && oss.configured && avatarWeb.configured,
      requiredEnv: [
        "AVATAR_3D_ENABLED",
        "DASHSCOPE_API_KEY",
        "DASHSCOPE_WORKSPACE_ID",
        ...ossRequired,
      ],
      missingEnv: [...avatarWeb.missing, ...dashscope.missing, ...oss.missing],
      optionalEnv: [
        "DASHSCOPE_API_BASE_URL",
        "DASHSCOPE_WANX_BASE_URL",
        "DASHSCOPE_TRIPO_MODEL",
        "DASHSCOPE_WANX_MODEL",
      ],
      capabilityNeeds: ["https_avatar_web"],
      providers: { avatarWeb, dashscope, oss },
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
