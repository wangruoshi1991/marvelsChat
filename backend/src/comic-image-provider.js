import { config as runtimeConfig } from "./config.js";
import { HttpError } from "./http-error.js";
import { cicadasImageAdapter } from "./cicadas-image-adapter.js";
import { ComicImageProviderRejection, comicImageRejectionStatuses as rejectionStatuses } from "./comic-image-provider-errors.js";
export { ComicImageProviderRejection } from "./comic-image-provider-errors.js";

const maximumImageBytes = 16 * 1024 * 1024;
const imageMimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const dimensionIsValid = (value) => Number.isInteger(value) && value > 0 && value <= 4096;
const bytesAreValid = (bytes) => bytes instanceof Uint8Array && bytes.byteLength > 0;
const safeProviderName = (value) => /^[a-z][a-z0-9-]{0,79}$/.test(value || "") ? value : "unconfigured";
const usageFields = new Set(["images", "inputTokens", "outputTokens", "totalTokens"]);
const usageIsValid = (usage) => usage === null || usage === undefined || (
  typeof usage === "object" && !Array.isArray(usage)
  && Object.entries(usage).every(([key, value]) => usageFields.has(key) && Number.isSafeInteger(value) && value >= 0)
);
const identifierIsValid = (value, maximum, secret) => typeof value === "string" && value.length > 0 && value.length <= maximum
  // eslint-disable-next-line no-control-regex -- Provider identifiers must reject control characters.
  && value === value.trim() && !/[\u0000-\u001f\u007f]/.test(value) && (!secret || !value.includes(secret));

const providerError = (code, { status = 502, outcomeUnknown = false } = {}) => {
  const error = new HttpError(status, code === "COMIC_IMAGE_PROVIDER_UNAVAILABLE"
    ? "漫画图片生成服务尚未就绪。" : outcomeUnknown
      ? "图片生成结果未知，请核实本次任务后再决定下一步。" : "漫画图片生成请求或结果无效。", { code });
  error.outcomeUnknown = outcomeUnknown;
  return error;
};

const allowedUrl = (value, allowedHosts) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !String(value).includes("?") && !String(value).includes("#")
      && (!url.port || url.port === "443") && allowedHosts.includes(url.hostname);
  } catch {
    return false;
  }
};

const verifiedAdapters = Object.freeze({ "cicadas-openai-images": cicadasImageAdapter });
export function createComicImageProvider({ config = runtimeConfig.mediaGeneration, fetchImpl = globalThis.fetch, adapters = verifiedAdapters } = {}) {
  const settings = Object.freeze({ ...config });
  const provider = safeProviderName(settings.provider);
  const adapter = Object.hasOwn(adapters, provider) ? adapters[provider] : null;
  const contractVerified = Boolean(adapter?.contractVerified === true && typeof adapter.generateFrame === "function"
    && Array.isArray(adapter.allowedHosts) && adapter.allowedHosts.length > 0
    && adapter.allowedHosts.every(host => typeof host === "string" && /^[a-z0-9.-]+$/.test(host)));
  const readiness = () => {
    const missing = [];
    if (settings.enabled !== true) missing.push("MEDIA_GENERATION_ENABLED");
    if (provider === "unconfigured") missing.push("MEDIA_GENERATION_PROVIDER");
    if (!settings.apiBaseUrl || !allowedUrl(settings.apiBaseUrl, contractVerified ? adapter.allowedHosts : [urlHostname(settings.apiBaseUrl)])) missing.push("MEDIA_GENERATION_API_BASE_URL");
    if (!settings.apiKey) missing.push("MEDIA_GENERATION_API_KEY");
    if (!settings.imageModel) missing.push("MEDIA_GENERATION_IMAGE_MODEL");
    if (!Number.isInteger(settings.timeoutMs) || settings.timeoutMs <= 0 || settings.timeoutMs > 300000) missing.push("MEDIA_GENERATION_TIMEOUT_MS");
    for (const issue of adapter?.configurationIssues?.(settings) || []) if (!missing.includes(issue)) missing.push(issue);
    return { configured: missing.length === 0 && contractVerified, provider, missing, contractVerified };
  };

  const generateFrame = async (input) => {
    if (!readiness().configured) throw providerError("COMIC_IMAGE_PROVIDER_UNAVAILABLE", { status: 503 });
    if (typeof input?.prompt !== "string" || !input.prompt.trim() || input.prompt.length > 12000
      || !Array.isArray(input.selectedImages) || input.selectedImages.length > 4
      || input.selectedImages.some(image => !bytesAreValid(image?.bytes) || image.bytes.byteLength > maximumImageBytes || !imageMimeTypes.has(image.mimeType))
      || !dimensionIsValid(input.width) || !dimensionIsValid(input.height)
      || typeof input.idempotencyKey !== "string" || !input.idempotencyKey.trim() || input.idempotencyKey.length > 200) {
      throw providerError("COMIC_IMAGE_PROVIDER_INVALID_INPUT", { status: 400 });
    }
    const controller = new AbortController();
    let timeout;
    let result;
    try {
      result = await Promise.race([
        Promise.resolve().then(() => adapter.generateFrame(input, {
          config: settings,
          signal: controller.signal,
          fetchImpl: (url, options = {}) => {
            if (!allowedUrl(url, adapter.allowedHosts)) throw providerError("COMIC_IMAGE_PROVIDER_INVALID_INPUT", { status: 400 });
            return fetchImpl(url, { ...options, redirect: "manual", signal: controller.signal });
          },
        })),
        new Promise((_resolve, reject) => {
          timeout = setTimeout(() => { controller.abort(); reject(providerError("COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN", { outcomeUnknown: true })); }, settings.timeoutMs);
        }),
      ]);
    } catch (error) {
      if (error instanceof ComicImageProviderRejection && Object.hasOwn(rejectionStatuses, error.code)) {
        throw providerError(error.code, { status: rejectionStatuses[error.code] });
      }
      // Once an adapter has received the frame the port cannot prove whether a
      // remote request was accepted; never replay it or expose its raw error.
      throw providerError("COMIC_IMAGE_PROVIDER_OUTCOME_UNKNOWN", { outcomeUnknown: true });
    } finally {
      clearTimeout(timeout);
    }
    if (result?.bytes?.byteLength > maximumImageBytes) throw providerError("COMIC_IMAGE_PROVIDER_RESPONSE_TOO_LARGE");
    if (!bytesAreValid(result?.bytes) || !imageMimeTypes.has(result.mimeType)
      || !dimensionIsValid(result.width) || !dimensionIsValid(result.height)
      || !identifierIsValid(result.model, 160, settings.apiKey)
      || (result.providerRequestId !== null && !identifierIsValid(result.providerRequestId, 200, settings.apiKey))
      || !usageIsValid(result.usage)) {
      throw providerError("COMIC_IMAGE_PROVIDER_INVALID_RESPONSE");
    }
    return { bytes: Buffer.from(result.bytes), mimeType: result.mimeType, width: result.width, height: result.height,
      providerRequestId: result.providerRequestId, model: result.model, usage: result.usage ? { ...result.usage } : null };
  };
  return { readiness, generateFrame };
}

// URL parsing here is intentionally non-throwing so raw configuration cannot
// leak through readiness or a public unavailability response.
function urlHostname(value) {
  try { return new URL(value).hostname; } catch { return ""; }
}

export const comicImageProvider = createComicImageProvider();
export const getComicImageProviderStatus = () => comicImageProvider.readiness();
