import { config as appConfig } from "./config.js";
import { HttpError } from "./http-error.js";

const viewOrder = ["front", "left", "back", "right"];
const createPath = "/api/v1/services/aigc/video-generation/3d-generation";
const processingStatuses = new Set(["PENDING", "RUNNING"]);

const photoType = (mimeType) => mimeType === "image/png" ? "png" : "jpeg";

const clampProgress = (value, fallback) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(100, number));
};

const safeProviderErrorCode = (code) => {
  const normalized = String(code || "").toLowerCase();
  if (/invalidapikey|unauthorized|forbidden|permission|arrearage|quota|throttl/.test(normalized)) {
    return "PROVIDER_UNAVAILABLE";
  }
  return "TRIPO_GENERATION_FAILED";
};

export function buildTripoCreateRequest({
  photos,
  geometryQuality = "standard",
  textureQuality = "standard",
  runtime = appConfig.dashscope,
}) {
  const inputs = Array.isArray(photos) ? photos : [];
  if (inputs.length < 1 || inputs.length > 4 || !inputs.some((photo) => photo.view === "front")) {
    throw new HttpError(400, "Avatar photos are invalid.");
  }
  if (
    !["standard", "ultra"].includes(geometryQuality)
    || !["standard", "detailed"].includes(textureQuality)
  ) {
    throw new HttpError(400, "Avatar quality parameters are invalid.", {
      code: "INVALID_QUALITY_PARAMETERS",
    });
  }
  const input = inputs.length === 1
    ? { image: inputs[0].url }
    : {
        images: viewOrder.map((view) => {
          const photo = inputs.find((item) => item.view === view);
          return photo ? { type: photoType(photo.mimeType), file_token: photo.url } : {};
        }),
      };

  return {
    model: runtime.tripoModel || "Tripo/Tripo-H3.1",
    input,
    parameters: {
      geometry_quality: geometryQuality,
      texture_quality: textureQuality,
      pbr: true,
      texture: true,
    },
  };
}

export function normalizeTripoTask(payload = {}) {
  const output = payload?.output && typeof payload.output === "object" ? payload.output : {};
  const providerStatus = String(output.task_status || "UNKNOWN").toUpperCase();
  const taskId = String(output.task_id || "");
  const result = Array.isArray(output.results) && output.results[0] ? output.results[0] : {};
  if (providerStatus === "SUCCEEDED") {
    const hasModel = Boolean(result.pbr_model_url);
    return {
      state: hasModel ? "succeeded" : "failed",
      taskId,
      providerStatus,
      progress: 100,
      pbrModelUrl: result.pbr_model_url || null,
      renderedImageUrl: result.rendered_image_url || null,
      usageCount: Number(payload?.usage?.count || 0),
      errorCode: hasModel ? null : "TRIPO_RESULT_MISSING",
    };
  }
  if (processingStatuses.has(providerStatus)) {
    return {
      state: "processing",
      taskId,
      providerStatus,
      progress: clampProgress(output.progress, providerStatus === "PENDING" ? 10 : 60),
      pbrModelUrl: null,
      renderedImageUrl: null,
      usageCount: 0,
      errorCode: null,
    };
  }
  return {
    state: "failed",
    taskId,
    providerStatus,
    progress: 100,
    pbrModelUrl: null,
    renderedImageUrl: null,
    usageCount: 0,
    errorCode: safeProviderErrorCode(output.code || payload.code),
  };
}

const providerHeaders = (runtime, { async = false } = {}) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${runtime.apiKey}`,
  ...(async ? { "X-DashScope-Async": "enable" } : {}),
  ...(runtime.workspaceId ? { "X-DashScope-WorkSpace": runtime.workspaceId } : {}),
});

const assertConfigured = (runtime) => {
  if (!runtime?.baseUrl || !runtime?.apiKey) {
    throw new HttpError(503, "3D generation is temporarily unavailable.", {
      provider: "tripo",
      code: "PROVIDER_UNAVAILABLE",
    });
  }
};

const requestJson = async ({ runtime, fetchImpl, url, options, transportCode }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(runtime.timeoutMs || 60000));
  let response;
  let payload;
  try {
    response = await fetchImpl(url, { ...options, signal: controller.signal });
    try {
      payload = await response.json();
    } catch (error) {
      if (controller.signal.aborted) throw error;
      payload = {};
    }
  } catch {
    throw new HttpError(502, "3D generation service did not confirm the request.", {
      provider: "tripo",
      code: transportCode,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok || payload.code) {
    throw new HttpError(502, "3D generation service is unavailable.", {
      provider: "tripo",
      code: safeProviderErrorCode(payload.code),
    });
  }
  return payload;
};

export function createTripoAdapter({ runtime = appConfig.dashscope, fetchImpl = fetch } = {}) {
  const submitTripoJob = async ({
    photos,
    geometryQuality = "standard",
    textureQuality = "standard",
  }) => {
    assertConfigured(runtime);
    const payload = await requestJson({
      runtime,
      fetchImpl,
      url: `${runtime.baseUrl}${createPath}`,
      options: {
        method: "POST",
        headers: providerHeaders(runtime, { async: true }),
        body: JSON.stringify(buildTripoCreateRequest({
          photos,
          geometryQuality,
          textureQuality,
          runtime,
        })),
      },
      transportCode: "TRIPO_SUBMISSION_UNKNOWN",
    });
    const normalized = normalizeTripoTask(payload);
    if (!normalized.taskId) {
      throw new HttpError(502, "3D generation service returned no task.", {
        provider: "tripo",
        code: "TRIPO_SUBMISSION_UNKNOWN",
      });
    }
    return normalized;
  };

  const fetchTripoJob = async ({ taskId }) => {
    assertConfigured(runtime);
    const payload = await requestJson({
      runtime,
      fetchImpl,
      url: `${runtime.baseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`,
      options: { method: "GET", headers: providerHeaders(runtime) },
      transportCode: "TRIPO_STATUS_UNAVAILABLE",
    });
    return normalizeTripoTask(payload);
  };

  return { submitTripoJob, fetchTripoJob };
}

const tripoAdapter = createTripoAdapter();
export const submitTripoJob = tripoAdapter.submitTripoJob;
export const fetchTripoJob = tripoAdapter.fetchTripoJob;
