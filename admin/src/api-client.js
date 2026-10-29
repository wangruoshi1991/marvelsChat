import { AdminApiError } from "../admin-core.js";

const apiOrigin = typeof window !== "undefined" && window.location.protocol === "file:" ? "http://127.0.0.1:4390" : "";

function requestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `admin-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createApiClient({ getToken = () => "", baseOrigin = apiOrigin, fetchImpl = globalThis.fetch, timeoutMs = 20_000 } = {}) {
  return async function apiClient(path, options = {}) {
    if (!path.startsWith("/api/")) throw new Error("Admin API paths must start with /api/");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const headers = { Accept: "application/json", ...(options.headers || {}) };
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    headers["X-Request-ID"] ||= requestId();
    try {
      const response = await fetchImpl(`${baseOrigin}${path}`, { ...options, headers, signal: controller.signal });
      const request = response.headers?.get?.("X-Request-ID") || headers["X-Request-ID"];
      const raw = await response.text();
      let payload = null;
      try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { message: raw }; }
      if (!response.ok) {
        const error = payload?.error || payload || {};
        throw new AdminApiError(error.message || `请求失败（${response.status}）`, { status: response.status, details: error.details || error, requestId: error.requestId || request });
      }
      return payload?.data ?? payload;
    } catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (error?.name === "AbortError") throw new AdminApiError("请求超时。", { isTimeout: true });
      throw new AdminApiError("无法连接后台服务。", { isNetworkError: true });
    } finally { clearTimeout(timer); }
  };
}

export { AdminApiError };
