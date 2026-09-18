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

export const profileLanguageOptions = [
  ["zh", "中文"],
  ["en", "英语"],
  ["ja", "日语"],
  ["ko", "韩语"],
  ["fr", "法语"],
  ["de", "德语"],
  ["es", "西班牙语"],
  ["pt", "葡萄牙语"],
  ["ru", "俄语"],
  ["ar", "阿拉伯语"],
];

export function hasAdminPermission(user, permission) {
  if (user?.role !== "admin") return false;
  const permissions = Array.isArray(user.adminPermissions) ? user.adminPermissions : [];
  return permissions.includes("*") || permissions.includes(permission);
}

export function canManageAdminAccount(user, targetRole = "user", requestedRole = "user") {
  return (targetRole !== "admin" && requestedRole !== "admin") || hasAdminPermission(user, "*");
}

export const shouldClearAdminSession = (error) => error?.status === 401;

export function buildAdminProfileUpdate(values) {
  const result = {};
  for (const [field, label, limit] of [
    ["nickname", "昵称", 80],
    ["bio", "简介", 500],
    ["community", "社区", 120],
    ["activityArea", "活动区域", 120],
    ["headline", "身份标题", 80],
    ["publicLocation", "公开城市", 120],
  ]) {
    result[field] = String(values[field] ?? "").trim();
    if (result[field].length > limit) throw new Error(`${label}最多 ${limit} 个字符。`);
  }
  if (!result.nickname) throw new Error("请输入昵称。");

  const years = String(values.experienceYears ?? "").trim();
  if (years !== "" && (!/^\d+$/.test(years) || Number(years) > 80)) {
    throw new Error("从业年限请填写 0 至 80 的整数，或留空清除。");
  }
  result.experienceYears = years === "" ? null : Number(years);

  const languages = values.languages;
  const supportedLanguages = new Set(profileLanguageOptions.map(([code]) => code));
  if (!Array.isArray(languages) || languages.length > 10
    || new Set(languages).size !== languages.length
    || languages.some((code) => !supportedLanguages.has(code))) {
    throw new Error("请从列表中选择语言，每种语言只能选择一次。");
  }
  result.languages = [...languages];
  return result;
}

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
export const mediaRetrievalDiagnosticGuidance = (diagnostic = {}) => {
  if (diagnostic.stage === "timeout" || diagnostic.stage === "transport") return "检查服务出口、DNS 和供应商连通性；先核对账单，勿自动重复调用。";
  if (diagnostic.stage === "http-response") {
    if (diagnostic.httpStatus === 401 || diagnostic.httpStatus === 403) return "核对供应商凭据、工作空间和模型授权；请勿在后台粘贴密钥。";
    if (diagnostic.httpStatus === 429) return "核对供应商配额、并发及限流；确认恢复后再人工重试。";
    if (diagnostic.providerCode === "Arrearage") return "核对供应商账户余额与账单。";
    return "根据 HTTP 状态和供应商错误代码核对模型、参数及服务状态。";
  }
  if (["descriptor-validation", "query-validation", "response-json"].includes(diagnostic.stage)) return "核对模型输出协议及列出的字段；保持校验开启，不使用原始输出绕过规则。";
  if (diagnostic.stage === "embedding-validation") return "核对向量模型、输出维度及部署配置，确认与现有索引一致。";
  return "该记录没有可验证的供应商诊断，需在后续明确授权的调用中采集。";
};
