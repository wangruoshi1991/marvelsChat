export class AdminApiError extends Error {
  constructor(message, {
    status,
    details,
    requestId,
    isNetworkError = false,
    isTimeout = false,
  } = {}) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
    this.details = details;
    this.requestId = requestId;
    this.isNetworkError = isNetworkError;
    this.isTimeout = isTimeout;
  }
}

export const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

export const friendlyAdminErrorMessage = (
  error,
  { fallback = "操作失败，请稍后再试。", apiLabel = "后台服务" } = {},
) => {
  if (error?.isTimeout) return "后台服务响应超时，请稍后重试。";
  if (error?.isNetworkError) return `无法连接后台服务：${apiLabel}`;

  const message = String(error?.message || "");
  if (!message) return fallback;
  if (error?.name === "TypeError" || /failed to fetch|network|load failed/i.test(message)) {
    return `无法连接后台服务：${apiLabel}`;
  }
  if (/postgres|database|db:migrate|migrated|migration|relation .* does not exist/i.test(message)) {
    return "妙讯服务正在初始化，请稍后再试。";
  }
  if (/invalid email or password|invalid account or password/i.test(message)) return "账号或密码不正确。";
  if (/already registered/i.test(message)) return "账号或邮箱已存在。";
  if (/disabled/i.test(message)) return "账号已停用。";
  if (/admin permission/i.test(message)) return "当前账号没有后台权限。";
  if (/disable your own/i.test(message)) return "不能停用当前登录的管理员账号。";
  if (/remove your own/i.test(message)) return "不能移除当前登录账号的管理员权限。";
  if (/logout to revoke/i.test(message)) return "当前管理员请使用退出后台。";
  if (/change your own password/i.test(message)) return "请在账号设置中修改自己的密码。";
  return message;
};

const parsePayload = (text) => {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AdminApiError("后台服务返回了无效响应。");
  }
};

export function createAdminApiRequest({
  baseOrigin = "",
  getToken = () => "",
  fetchImpl = globalThis.fetch,
  timeoutMs = 20_000,
  createRequestId = () => globalThis.crypto.randomUUID(),
} = {}) {
  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }

  return async (path, options = {}) => {
    if (!/^\/api(?:[/?#]|$)/.test(path)) {
      throw new TypeError("Admin API paths must start with /api.");
    }

    const token = String(getToken() || "");
    const hasBody = options.body !== undefined;
    const headers = {
      ...(hasBody ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
      "X-Request-ID": createRequestId(),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(`${baseOrigin}${path}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      const text = response.status === 204 ? "" : await response.text();
      const payload = parsePayload(text);
      if (!response.ok) {
        throw new AdminApiError(
          payload.error?.message || `Request failed: ${response.status}`,
          {
            status: response.status,
            details: payload.error?.details,
            requestId: payload.error?.requestId || response.headers?.get?.("X-Request-ID") || "",
          },
        );
      }
      return payload.data;
    } catch (error) {
      if (error instanceof AdminApiError) throw error;
      if (error?.name === "AbortError") {
        throw new AdminApiError("后台服务响应超时，请稍后重试。", {
          isNetworkError: true,
          isTimeout: true,
        });
      }
      throw new AdminApiError("无法连接后台服务。", {
        isNetworkError: true,
      });
    } finally {
      clearTimeout(timeout);
    }
  };
}
