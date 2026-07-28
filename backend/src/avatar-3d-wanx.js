import { config as appConfig } from "./config.js";
import { HttpError } from "./http-error.js";

const createPath = "/api/v1/services/aigc/image2image/image-synthesis";
const processingStatuses = new Set(["PENDING", "RUNNING"]);

export const avatarCartoonInstruction = "将照片中的人物转换为精致的三维潮玩人物风格，保留可识别的脸部特征、发型、服装款式和主色，全身完整入镜，自然站立，正面视角，纯色干净背景，不添加文字、水印、道具或其他人物。";

const safeWanxErrorCode = (code) => {
  const normalized = String(code || "").toLowerCase();
  if (normalized.includes("datainspectionfailed")) return "AVATAR_PHOTO_REJECTED";
  if (/invalidapikey|unauthorized|forbidden|permission|arrearage|quota|throttl/.test(normalized)) {
    return "PROVIDER_UNAVAILABLE";
  }
  return "STYLE_GENERATION_FAILED";
};

export function buildWanxCreateRequest({ imageUrl, runtime = appConfig.dashscope }) {
  return {
    model: runtime.wanxModel || "wanx2.1-imageedit",
    input: {
      function: "stylization_all",
      prompt: avatarCartoonInstruction,
      base_image_url: imageUrl,
    },
    parameters: { n: 1 },
  };
}

export function normalizeWanxTask(payload = {}) {
  const output = payload?.output && typeof payload.output === "object" ? payload.output : {};
  const providerStatus = String(output.task_status || "UNKNOWN").toUpperCase();
  const taskId = String(output.task_id || "");
  if (providerStatus === "SUCCEEDED") {
    const first = Array.isArray(output.results) && output.results[0] ? output.results[0] : {};
    return {
      state: first.url ? "succeeded" : "failed",
      taskId,
      providerStatus,
      progress: 100,
      imageUrl: first.url || null,
      usageCount: Number(payload?.usage?.image_count || 0),
      errorCode: first.url ? null : "STYLE_RESULT_MISSING",
    };
  }
  if (processingStatuses.has(providerStatus)) {
    return {
      state: "processing",
      taskId,
      providerStatus,
      progress: providerStatus === "PENDING" ? 10 : 60,
      imageUrl: null,
      usageCount: 0,
      errorCode: null,
    };
  }
  return {
    state: "failed",
    taskId,
    providerStatus,
    progress: 100,
    imageUrl: null,
    usageCount: 0,
    errorCode: safeWanxErrorCode(output.code || payload.code),
  };
}

const providerHeaders = (runtime, { async = false } = {}) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${runtime.apiKey}`,
  ...(async ? { "X-DashScope-Async": "enable" } : {}),
  ...(runtime.workspaceId ? { "X-DashScope-WorkSpace": runtime.workspaceId } : {}),
});

const assertConfigured = (runtime) => {
  if (!runtime?.wanxBaseUrl || !runtime?.apiKey || !runtime?.workspaceId) {
    throw new HttpError(503, "Cartoon style generation is temporarily unavailable.", {
      provider: "wanx",
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
    throw new HttpError(502, "Cartoon style service did not confirm the request.", {
      provider: "wanx",
      code: transportCode,
    });
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok || payload.code) {
    throw new HttpError(502, "Cartoon style service is unavailable.", {
      provider: "wanx",
      code: safeWanxErrorCode(payload.code),
    });
  }
  return payload;
};

export function createWanxAdapter({ runtime = appConfig.dashscope, fetchImpl = fetch } = {}) {
  const submitWanxStyleJob = async ({ imageUrl }) => {
    assertConfigured(runtime);
    const payload = await requestJson({
      runtime,
      fetchImpl,
      url: `${runtime.wanxBaseUrl}${createPath}`,
      options: {
        method: "POST",
        headers: providerHeaders(runtime, { async: true }),
        body: JSON.stringify(buildWanxCreateRequest({ imageUrl, runtime })),
      },
      transportCode: "WANX_SUBMISSION_UNKNOWN",
    });
    const normalized = normalizeWanxTask(payload);
    if (!normalized.taskId) {
      throw new HttpError(502, "Cartoon style service returned no task.", {
        provider: "wanx",
        code: "WANX_SUBMISSION_UNKNOWN",
      });
    }
    return normalized;
  };

  const fetchWanxStyleJob = async ({ taskId }) => {
    assertConfigured(runtime);
    const payload = await requestJson({
      runtime,
      fetchImpl,
      url: `${runtime.wanxBaseUrl}/api/v1/tasks/${encodeURIComponent(taskId)}`,
      options: { method: "GET", headers: providerHeaders(runtime) },
      transportCode: "WANX_STATUS_UNAVAILABLE",
    });
    return normalizeWanxTask(payload);
  };

  return { submitWanxStyleJob, fetchWanxStyleJob };
}

const wanxAdapter = createWanxAdapter();
export const submitWanxStyleJob = wanxAdapter.submitWanxStyleJob;
export const fetchWanxStyleJob = wanxAdapter.fetchWanxStyleJob;
