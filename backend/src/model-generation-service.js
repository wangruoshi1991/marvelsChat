import { config as appConfig } from "./config.js";
import { HttpError } from "./http-error.js";

const allowedFormats = new Set(["glb", "obj", "fbx", "stl", "usdz", "3mf"]);
const statusMap = {
  PENDING: "processing",
  IN_PROGRESS: "processing",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELED: "cancelled",
  CANCELLED: "cancelled",
};

const sanitizeText = (value, max = 600) =>
  String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/\b(script|iframe|javascript:|onerror|onload)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);

const normalizeFormats = (formats = ["glb"]) => {
  const values = (Array.isArray(formats) ? formats : [])
    .map((format) => String(format || "").trim().toLowerCase())
    .filter((format) => allowedFormats.has(format));
  return Array.from(new Set(values)).slice(0, 3);
};

const withTimeout = async ({ timeoutMs, work }) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "3D model provider request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

export function getMeshyRuntimeStatus(runtimeConfig = appConfig.meshy) {
  const missing = [];
  if (!runtimeConfig?.baseUrl) missing.push("MESHY_API_BASE_URL");
  if (!runtimeConfig?.apiKey) missing.push("MESHY_API_KEY");

  return {
    configured: missing.length === 0,
    missing,
    provider: "meshy",
    baseUrl: runtimeConfig?.baseUrl || "",
    timeoutMs: runtimeConfig?.timeoutMs || 60000,
    hasApiKey: Boolean(runtimeConfig?.apiKey),
  };
}

export function buildMeshyCreateRequest({
  inputType = "text",
  prompt = "",
  imageUrl = "",
  targetFormats = ["glb"],
  topology = "triangle",
  poseMode = "",
} = {}) {
  const formats = normalizeFormats(targetFormats);
  const safeFormats = formats.length ? formats : ["glb"];
  const safePrompt = sanitizeText(prompt, 600);

  if (inputType === "image") {
    return {
      path: "/openapi/v1/image-to-3d",
      body: {
        image_url: String(imageUrl || "").trim(),
        ...(safePrompt ? { texture_prompt: safePrompt } : {}),
        should_texture: true,
        enable_pbr: true,
        moderation: true,
        target_formats: safeFormats,
        ...(poseMode ? { pose_mode: poseMode } : {}),
      },
    };
  }

  return {
    path: "/openapi/v2/text-to-3d",
    body: {
      mode: "preview",
      prompt: safePrompt,
      ai_model: "latest",
      model_type: "standard",
      topology: ["triangle", "quad"].includes(topology) ? topology : "triangle",
      moderation: true,
      target_formats: safeFormats,
      ...(poseMode ? { pose_mode: poseMode } : {}),
    },
  };
}

export function normalizeMeshyTask(task = {}) {
  const rawStatus = String(task.status || "").toUpperCase();
  const modelUrls = task.model_urls && typeof task.model_urls === "object" ? task.model_urls : {};

  return {
    providerTaskId: task.id || "",
    status: statusMap[rawStatus] || "processing",
    providerStatus: rawStatus || "UNKNOWN",
    progress: Number.isFinite(Number(task.progress)) ? Math.max(0, Math.min(100, Number(task.progress))) : 0,
    thumbnailUrl: task.thumbnail_url || task.alpha_thumbnail_url || "",
    modelUrls,
    raw: task,
  };
}

async function parseProviderResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      payload.error?.message ||
      payload.message ||
      payload.msg ||
      "3D model provider request failed";
    throw new HttpError(response.status, message, {
      provider: "meshy",
      configured: true,
    });
  }
  return payload;
}

export async function submitMeshyModelJob({
  config = appConfig.meshy,
  inputType,
  prompt,
  imageUrl = "",
  targetFormats = ["glb"],
  topology = "triangle",
  poseMode = "",
  fetchImpl = fetch,
} = {}) {
  const status = getMeshyRuntimeStatus(config);
  if (!status.configured) {
    throw new HttpError(503, `3D model provider is not configured: ${status.missing.join(", ")}`, status);
  }

  const request = buildMeshyCreateRequest({ inputType, prompt, imageUrl, targetFormats, topology, poseMode });
  const payload = await withTimeout({
    timeoutMs: status.timeoutMs,
    work: (signal) => fetchImpl(`${status.baseUrl}${request.path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(request.body),
      signal,
    }).then(parseProviderResponse),
  });
  const providerTaskId = payload.result || payload.id || "";
  if (!providerTaskId) {
    throw new HttpError(502, "3D model provider did not return a task id", {
      provider: "meshy",
    });
  }

  return {
    provider: "meshy",
    providerTaskId,
    status: "provider_submitted",
    requestPayload: request.body,
    resultPayload: payload,
  };
}

export async function fetchMeshyModelJob({
  config = appConfig.meshy,
  providerTaskId,
  inputType = "text",
  fetchImpl = fetch,
} = {}) {
  const status = getMeshyRuntimeStatus(config);
  if (!status.configured) {
    throw new HttpError(503, `3D model provider is not configured: ${status.missing.join(", ")}`, status);
  }
  const path = inputType === "image"
    ? `/openapi/v1/image-to-3d/${encodeURIComponent(providerTaskId)}`
    : `/openapi/v2/text-to-3d/${encodeURIComponent(providerTaskId)}`;
  const payload = await withTimeout({
    timeoutMs: status.timeoutMs,
    work: (signal) => fetchImpl(`${status.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
      signal,
    }).then(parseProviderResponse),
  });

  return normalizeMeshyTask(payload);
}
