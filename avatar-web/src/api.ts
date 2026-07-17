import type {
  AvatarBootstrap,
  AvatarCreateJobInput,
  AvatarCreateJobResult,
  AvatarJob,
  AvatarModel,
  AvatarPreparedPhoto,
  AvatarSession,
} from "./types";

interface ApiErrorInput {
  status: number;
  code?: string | null;
  requestId?: string | null;
}

export class AvatarApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly requestId: string | null;

  constructor({ status, code = null, requestId = null }: ApiErrorInput) {
    super("Avatar API request failed");
    this.name = "AvatarApiError";
    this.status = status;
    this.code = code;
    this.requestId = requestId;
  }
}

type ApiEnvelope<T> = { data: T };

const parsePayload = async (response: Response): Promise<Record<string, unknown> | null> => {
  if (response.status === 204) return null;
  try {
    return await response.json() as Record<string, unknown>;
  } catch {
    return null;
  }
};

const errorProjection = (response: Response, payload: Record<string, unknown> | null) => {
  const error = payload?.error as Record<string, unknown> | undefined;
  const details = error?.details as Record<string, unknown> | undefined;
  return new AvatarApiError({
    status: response.status,
    code: typeof details?.code === "string"
      ? details.code
      : typeof error?.code === "string" ? error.code : null,
    requestId: typeof error?.requestId === "string"
      ? error.requestId
      : response.headers.get("x-request-id"),
  });
};

export function createAvatarApi(fetcher: typeof fetch = globalThis.fetch) {
  let csrfToken = "";

  const request = async <T>(
    path: string,
    {
      method = "GET",
      body,
      requiresCsrf = false,
      headers: extraHeaders = {},
    }: {
      method?: string;
      body?: unknown;
      requiresCsrf?: boolean;
      headers?: Record<string, string>;
    } = {},
  ): Promise<T> => {
    const headers: Record<string, string> = { ...extraHeaders };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (requiresCsrf && csrfToken) headers["X-CSRF-Token"] = csrfToken;
    const response = await fetcher(path, {
      method,
      credentials: "same-origin",
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await parsePayload(response);
    if (!response.ok) throw errorProjection(response, payload);
    return (payload as ApiEnvelope<T> | null)?.data as T;
  };

  const login = async (credentials: { identifier: string; password: string }) => {
    const session = await request<AvatarSession>("/api/avatar-3d/session", {
      method: "POST",
      body: credentials,
    });
    csrfToken = session.csrfToken;
    return session;
  };

  const bootstrap = async () => {
    const data = await request<AvatarBootstrap>("/api/avatar-3d/bootstrap");
    csrfToken = data.csrfToken;
    return data;
  };

  const logout = async () => {
    try {
      await request<void>("/api/avatar-3d/session", {
        method: "DELETE",
        requiresCsrf: true,
      });
    } finally {
      csrfToken = "";
    }
  };

  return {
    login,
    bootstrap,
    logout,
    preparePhoto: (input: { originalFilename: string; mimeType: string; byteSize: number }) =>
      request<AvatarPreparedPhoto>("/api/avatar-3d/photos", {
        method: "POST",
        body: input,
        requiresCsrf: true,
      }),
    uploadPhoto: async (upload: AvatarPreparedPhoto["upload"], file: File) => {
      const response = await fetcher(upload.url, {
        method: upload.method,
        headers: upload.headers,
        body: file,
      });
      if (!response.ok) throw new AvatarApiError({ status: response.status });
    },
    completePhoto: (photoId: string) => request<AvatarPreparedPhoto["photo"]>(
      `/api/avatar-3d/photos/${encodeURIComponent(photoId)}/complete`,
      { method: "POST", body: {}, requiresCsrf: true },
    ),
    deletePhoto: (photoId: string) => request<void>(
      `/api/avatar-3d/photos/${encodeURIComponent(photoId)}`,
      { method: "DELETE", requiresCsrf: true },
    ),
    createJob: (input: AvatarCreateJobInput, idempotencyKey: string) =>
      request<AvatarCreateJobResult>("/api/avatar-3d/jobs", {
        method: "POST",
        body: input,
        requiresCsrf: true,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    listJobs: (limit = 10) => request<AvatarJob[]>(`/api/avatar-3d/jobs?limit=${limit}`),
    getJob: (jobId: string) => request<AvatarJob>(
      `/api/avatar-3d/jobs/${encodeURIComponent(jobId)}`,
    ),
    confirmStyle: (jobId: string) => request<AvatarJob>(
      `/api/avatar-3d/jobs/${encodeURIComponent(jobId)}/confirm-style`,
      { method: "POST", body: { accepted: true }, requiresCsrf: true },
    ),
    cancelJob: (jobId: string) => request<AvatarJob>(
      `/api/avatar-3d/jobs/${encodeURIComponent(jobId)}/cancel`,
      { method: "POST", body: {}, requiresCsrf: true },
    ),
    getModel: (modelId: string) => request<AvatarModel>(
      `/api/avatar-3d/models/${encodeURIComponent(modelId)}`,
    ),
    deleteModel: (modelId: string) => request<void>(
      `/api/avatar-3d/models/${encodeURIComponent(modelId)}`,
      { method: "DELETE", requiresCsrf: true },
    ),
    photoFileUrl: (photoId: string) =>
      `/api/avatar-3d/photos/${encodeURIComponent(photoId)}/file`,
    stylePreviewUrl: (jobId: string) =>
      `/api/avatar-3d/jobs/${encodeURIComponent(jobId)}/style-preview`,
    modelFileUrl: (modelId: string) =>
      `/api/avatar-3d/models/${encodeURIComponent(modelId)}/file`,
    modelThumbnailUrl: (modelId: string) =>
      `/api/avatar-3d/models/${encodeURIComponent(modelId)}/thumbnail`,
  };
}

export type AvatarApi = ReturnType<typeof createAvatarApi>;
export const avatarApi = createAvatarApi();
