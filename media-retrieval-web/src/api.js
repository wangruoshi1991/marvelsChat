import {
  assertMediaRetrievalPublicError,
  assertMediaRetrievalSearchResponse,
  getMediaRetrievalPublicError,
} from "../../shared/media-retrieval-public-contract.js";

const configuredApiTarget = typeof __MIAOXUN_MEDIA_RETRIEVAL_API_TARGET__ === "string"
  ? __MIAOXUN_MEDIA_RETRIEVAL_API_TARGET__
  : "";

const apiOrigin = typeof window !== "undefined" && window.location.protocol === "file:" ? configuredApiTarget : "";

export class MediaRetrievalApiError extends Error {
  constructor(status, code = "", message = "", retryable = undefined) {
    const contract = getMediaRetrievalPublicError(code);
    super(message || contract.message || `Request failed: ${status}`);
    this.name = "MediaRetrievalApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable ?? contract.retryable;
  }
}

const asHeaders = (token, headers = {}) => ({
  Accept: "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
  ...headers,
});

const isMediaRetrievalPath = (routePath) =>
  routePath.startsWith("/api/station/media-retrieval/") || routePath.startsWith("/api/agent-runs/");

const safePublicErrorFromResponse = ({ status, payload }) => {
  try {
    return assertMediaRetrievalPublicError(payload?.error, { status });
  } catch {
    const fallback = getMediaRetrievalPublicError("retrieval_service_unavailable");
    return {
      code: "retrieval_service_unavailable",
      message: fallback.message,
      retryable: fallback.retryable,
    };
  }
};

const request = async ({ path, token, method = "GET", body, headers = {} }) => {
  let response;
  try {
    response = await fetch(`${apiOrigin}${path}`, {
      method,
      headers: asHeaders(token, body === undefined ? headers : {
        "Content-Type": "application/json",
        ...headers,
      }),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch {
    throw new MediaRetrievalApiError(0, "network_unavailable", "Network unavailable");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (isMediaRetrievalPath(path)) {
      const publicError = safePublicErrorFromResponse({ status: response.status, payload });
      throw new MediaRetrievalApiError(
        response.status,
        publicError.code,
        publicError.message,
        publicError.retryable,
      );
    }
    throw new MediaRetrievalApiError(
      response.status,
      String(payload?.error?.code || ""),
      String(payload?.error?.message || ""),
      payload?.error?.retryable,
    );
  }
  return payload?.data;
};

export const mediaRetrievalApi = {
  login: ({ identifier, password }) => request({
    path: "/api/auth/login",
    method: "POST",
    body: { identifier, password },
  }),
  status: (token) => request({ path: "/api/station/media-retrieval/status", token }),
  enable: (token, idempotencyKey) => request({
    path: "/api/station/media-retrieval/enable",
    token,
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: { consentVersion: "media-retrieval-consent-v1" },
  }),
  search: async (token, input) => {
    const data = await request({
      path: "/api/station/media-retrieval/search",
      token,
      method: "POST",
      body: input,
    });
    try {
      return assertMediaRetrievalSearchResponse(data);
    } catch {
      throw new MediaRetrievalApiError(503, "retrieval_service_unavailable");
    }
  },
  reindex: (token, input, idempotencyKey) => request({
    path: "/api/station/media-retrieval/reindex",
    token,
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: input,
  }),
  deleteIndex: (token, idempotencyKey) => request({
    path: "/api/station/media-retrieval/index",
    token,
    method: "DELETE",
    headers: { "Idempotency-Key": idempotencyKey },
  }),
  events: (token, runId, afterSequence = 0) => request({
    path: `/api/agent-runs/${encodeURIComponent(runId)}/events?afterSequence=${encodeURIComponent(afterSequence)}`,
    token,
  }),
  mediaPreview: async (token, mediaAssetId) => {
    let response;
    try {
      response = await fetch(`${apiOrigin}/api/station/media-assets/${encodeURIComponent(mediaAssetId)}/file`, {
        headers: asHeaders(token),
      });
    } catch {
      return null;
    }
    if (!response.ok) return null;
    return URL.createObjectURL(await response.blob());
  },
};
