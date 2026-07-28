import { config as appConfig } from "./config.js";
import { HttpError } from "./http-error.js";

const createPath = "/api/v1/services/aigc/image-generation/generation";
const providerName = "wan-multiview";
const supportedModel = "wan2.7-image-pro";
const defaultLogger = { error: (entry) => console.error(JSON.stringify(entry)) };
const silentLogger = { error: () => {} };
const processingStatuses = new Set(["PENDING", "RUNNING"]);
const knownStatuses = new Set([
  ...processingStatuses,
  "SUCCEEDED",
  "FAILED",
  "CANCELED",
  "UNKNOWN",
]);

const isHttpsUrl = (value) => {
  if (typeof value !== "string") return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && Boolean(parsed.hostname);
  } catch {
    return false;
  }
};

const assertInputs = ({ imageUrl, prompt }) => {
  if (!isHttpsUrl(imageUrl)) {
    throw new HttpError(400, "Avatar source image must use HTTPS.", {
      code: "INVALID_IMAGE_URL",
    });
  }
  if (
    typeof prompt !== "string"
    || !prompt.trim()
    || Array.from(prompt).length > 5000
  ) {
    throw new HttpError(400, "Avatar reference prompt is invalid.", {
      code: "INVALID_MULTIVIEW_PROMPT",
    });
  }
};

const safeWanMultiviewErrorCode = (code) => {
  const normalized = String(code || "").toLowerCase();
  if (/datainspectionfailed|contentinspection|inappropriate|moderation|sensitive/.test(normalized)) {
    return "AVATAR_PHOTO_REJECTED";
  }
  if (/invalidapikey|unauthorized|forbidden|permission|arrearage|quota|throttl/.test(normalized)) {
    return "PROVIDER_UNAVAILABLE";
  }
  return "REFERENCE_GENERATION_FAILED";
};

const normalizeProviderStatus = (value) => {
  const normalized = String(value || "UNKNOWN").toUpperCase();
  return knownStatuses.has(normalized) ? normalized : "UNKNOWN";
};

const normalizeUsageCount = (value) => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.trunc(count) : 0;
};

const safeDiagnosticCode = (value) => {
  const normalized = typeof value === "string" ? value.trim() : "";
  return /^[A-Za-z0-9._-]{1,120}$/.test(normalized) ? normalized : "UNKNOWN";
};

const logProviderHttpError = ({ logger, operation, status, providerCode, productCode }) => {
  try {
    logger?.error?.({
      type: "avatar_3d_provider_http_error",
      provider: providerName,
      operation,
      httpStatus: Number(status || 0),
      providerCode: safeDiagnosticCode(providerCode),
      productCode,
    });
  } catch {
    // Diagnostics must never change the Provider call outcome.
  }
};

const clampProgress = (value, fallback) => {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return fallback;
  return Math.max(0, Math.min(100, progress));
};

const extractImageUrls = (output) => {
  const imageUrls = [];
  const choices = Array.isArray(output.choices) ? output.choices : [];
  for (const choice of choices) {
    const content = Array.isArray(choice?.message?.content) ? choice.message.content : [];
    for (const item of content) {
      if (item?.type === "image" && isHttpsUrl(item.image)) {
        imageUrls.push(item.image);
        if (imageUrls.length === 4) return imageUrls;
      }
    }
  }
  return imageUrls;
};

export function buildWanMultiviewCreateRequest({
  imageUrl,
  prompt,
  runtime = appConfig.dashscope,
}) {
  assertInputs({ imageUrl, prompt });
  const model = String(runtime?.wanMultiviewModel || supportedModel).trim();
  if (model !== supportedModel) {
    throw new HttpError(503, "Avatar reference generation is temporarily unavailable.", {
      provider: providerName,
      code: "PROVIDER_UNAVAILABLE",
    });
  }
  return {
    model,
    input: {
      messages: [{
        role: "user",
        content: [{ image: imageUrl }, { text: prompt.trim() }],
      }],
    },
    parameters: {
      size: "2K",
      n: 4,
      enable_sequential: true,
      watermark: false,
    },
  };
}

export function normalizeWanMultiviewTask(payload = {}) {
  const output = payload?.output && typeof payload.output === "object" ? payload.output : {};
  const providerStatus = normalizeProviderStatus(output.task_status);
  const taskId = typeof output.task_id === "string" ? output.task_id : "";
  const requestId = typeof payload?.request_id === "string" ? payload.request_id : null;
  const usageCount = normalizeUsageCount(payload?.usage?.image_count);

  if (providerStatus === "SUCCEEDED") {
    const imageUrls = extractImageUrls(output);
    const complete = imageUrls.length >= 2;
    return {
      state: complete ? "succeeded" : "failed",
      taskId,
      providerStatus,
      progress: 100,
      imageUrls,
      usageCount,
      requestId,
      errorCode: complete ? null : "REFERENCE_SET_INCOMPLETE",
    };
  }

  if (processingStatuses.has(providerStatus)) {
    return {
      state: "processing",
      taskId,
      providerStatus,
      progress: clampProgress(output.progress, providerStatus === "PENDING" ? 10 : 60),
      imageUrls: [],
      usageCount,
      requestId,
      errorCode: null,
    };
  }

  return {
    state: "failed",
    taskId,
    providerStatus,
    progress: 100,
    imageUrls: [],
    usageCount,
    requestId,
    errorCode: providerStatus === "CANCELED"
      ? "REFERENCE_GENERATION_CANCELED"
      : safeWanMultiviewErrorCode(output.code || payload?.code),
  };
}

const providerHeaders = (runtime, { async = false } = {}) => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${runtime.apiKey}`,
  ...(async ? { "X-DashScope-Async": "enable" } : {}),
});

const assertConfigured = (runtime) => {
  if (!isHttpsUrl(runtime?.wanBaseUrl) || !runtime?.apiKey) {
    throw new HttpError(503, "Avatar reference generation is temporarily unavailable.", {
      provider: providerName,
      code: "PROVIDER_UNAVAILABLE",
    });
  }
};

const requestJson = async ({
  runtime,
  fetchImpl,
  logger,
  operation,
  url,
  options,
  transportCode,
}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(runtime.timeoutMs || 60000));
  let response;
  let payload;
  try {
    response = await fetchImpl(url, { ...options, signal: controller.signal });
    try {
      const parsed = await response.json();
      payload = parsed && typeof parsed === "object" ? parsed : {};
    } catch (error) {
      if (controller.signal.aborted) throw error;
      payload = {};
    }
  } catch {
    throw new HttpError(502, "Avatar reference service did not confirm the request.", {
      provider: providerName,
      code: transportCode,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response?.ok || payload.code) {
    const statusCode = Number(response?.status || 0);
    const errorCode = [401, 403, 429].includes(statusCode)
      ? "PROVIDER_UNAVAILABLE"
      : safeWanMultiviewErrorCode(payload.code);
    logProviderHttpError({
      logger,
      operation,
      status: statusCode,
      providerCode: payload.code || payload?.output?.code,
      productCode: errorCode,
    });
    throw new HttpError(502, "Avatar reference service is unavailable.", {
      provider: providerName,
      code: errorCode,
    });
  }
  return payload;
};

export function createWanMultiviewAdapter({
  runtime = appConfig.dashscope,
  fetchImpl = fetch,
  logger = silentLogger,
} = {}) {
  const submitWanMultiviewJob = async ({ imageUrl, prompt }) => {
    const request = buildWanMultiviewCreateRequest({ imageUrl, prompt, runtime });
    assertConfigured(runtime);
    const payload = await requestJson({
      runtime,
      fetchImpl,
      logger,
      operation: "submit_references",
      url: `${String(runtime.wanBaseUrl).replace(/\/+$/, "")}${createPath}`,
      options: {
        method: "POST",
        headers: providerHeaders(runtime, { async: true }),
        body: JSON.stringify(request),
      },
      transportCode: "WAN_MULTIVIEW_SUBMISSION_UNKNOWN",
    });
    const normalized = normalizeWanMultiviewTask(payload);
    if (!normalized.taskId) {
      throw new HttpError(502, "Avatar reference service returned no task.", {
        provider: providerName,
        code: "WAN_MULTIVIEW_SUBMISSION_UNKNOWN",
      });
    }
    return normalized;
  };

  const fetchWanMultiviewJob = async ({ taskId }) => {
    assertConfigured(runtime);
    if (typeof taskId !== "string" || !taskId.trim() || taskId.length > 160) {
      throw new HttpError(400, "Avatar reference task is invalid.", {
        code: "INVALID_PROVIDER_TASK_ID",
      });
    }
    const payload = await requestJson({
      runtime,
      fetchImpl,
      logger,
      operation: "fetch_references",
      url: `${String(runtime.wanBaseUrl).replace(/\/+$/, "")}/api/v1/tasks/${encodeURIComponent(taskId.trim())}`,
      options: { method: "GET", headers: providerHeaders(runtime) },
      transportCode: "WAN_MULTIVIEW_STATUS_UNAVAILABLE",
    });
    return normalizeWanMultiviewTask(payload);
  };

  return { submitWanMultiviewJob, fetchWanMultiviewJob };
}

const wanMultiviewAdapter = createWanMultiviewAdapter({ logger: defaultLogger });
export const submitWanMultiviewJob = wanMultiviewAdapter.submitWanMultiviewJob;
export const fetchWanMultiviewJob = wanMultiviewAdapter.fetchWanMultiviewJob;
