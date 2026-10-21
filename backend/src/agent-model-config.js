import { HttpError } from "./http-error.js";

// Agent 文本模型的集中配置入口。所有角色共用同一地址和 Key；这里只选模型，
// 不读取 Agent 私有凭据、不切换供应商，也不负责授权、预算或执行器能力。
// 推荐值仅供显式填写 NEW_API_*；createAgentModelConfig 不会自动应用此 profile。
export const RECOMMENDED_AGENT_MODEL_PROFILE = Object.freeze({
  id: "fusheng-gpt-6.1-sol",
  protocol: "openai-compatible-chat-completions",
  baseUrl: "https://fushengyunsuan.cn/v1",
  model: "gpt-6.1-sol",
  planningModel: "gpt-6.1-sol",
  requiredEnvironment: Object.freeze(["NEW_API_BASE_URL", "NEW_API_KEY", "NEW_API_MODEL"]),
  optionalEnvironment: Object.freeze(["NEW_API_PLANNING_MODEL", "NEW_API_TIMEOUT_MS", "NEW_API_WORKSPACE_TIMEOUT_MS"]),
});

// chat：各 Agent 明确声明的普通对话、媒体检索原文解析。
// planning：管家分派/协调、建站/漫画等结构化 plan、相册带工具的 plan。
// contribute：显式协作文本成果，与规划共用模型角色，不回退普通聊天。
// 视觉、图文向量及 3D 生成使用各自既有配置，不进入此文本角色映射。
export const AGENT_MODEL_ROLE_POLICY = Object.freeze({
  chat: "chat",
  discussWorkspace: "chat",
  plan: "planning",
  dispatch: "planning",
  coordinate: "planning",
  contribute: "planning",
  mediaQueryParsing: "chat",
});

export function createAgentModelConfig(env = process.env) {
  const timeout = (name, fallback) => {
    const raw = env[name];
    if (raw === undefined || String(raw).trim() === "") return fallback;
    if (!/^[1-9]\d*$/.test(String(raw).trim())) throw new Error(`${name} must be a positive integer in milliseconds.`);
    const value = Number(raw);
    if (!Number.isSafeInteger(value) || value > 1_200_000) throw new Error(`${name} must not exceed 1200000 milliseconds.`);
    return value;
  };
  return {
    baseUrl: (env.NEW_API_BASE_URL || "").replace(/\/+$/, ""),
    apiKey: env.NEW_API_KEY || "",
    model: env.NEW_API_MODEL || "",
    planningModel: (env.NEW_API_PLANNING_MODEL || "").trim(),
    timeoutMs: timeout("NEW_API_TIMEOUT_MS", 30000),
    workspaceTimeoutMs: timeout("NEW_API_WORKSPACE_TIMEOUT_MS", 180000),
  };
}

export function resolveAgentModelRoute(modelConfig, role = "chat") {
  if (!["chat", "planning"].includes(role)) {
    throw new HttpError(422, "Unsupported model role.", { code: "AI_MODEL_ROLE_UNSUPPORTED" });
  }
  const planningModel = String(modelConfig?.planningModel || "").trim();
  return role === "planning" && planningModel
    ? { model: planningModel, source: "NEW_API_PLANNING_MODEL" }
    : { model: modelConfig?.model || "", source: "NEW_API_MODEL" };
}

export function resolveAgentModelRole({ mode = "plan" } = {}) {
  if (!["plan", "coordinate", "dispatch", "chat", "contribute", "discussWorkspace"].includes(mode)) {
    throw new HttpError(422, "Agent does not support the requested execution mode.", { code: "AI_AGENT_MODE_UNSUPPORTED" });
  }
  return AGENT_MODEL_ROLE_POLICY[mode];
}
