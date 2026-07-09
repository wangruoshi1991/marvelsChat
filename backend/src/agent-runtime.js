import { getAgent } from "../../agents/registry.js";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";

const isAnthropicProvider = () => /\/anthropic(?:\/|$)/i.test(config.newApi.baseUrl || "");

const completionEndpoint = () => {
  if (!config.newApi.baseUrl) return "";
  if (isAnthropicProvider()) {
    if (/\/v1\/messages$/i.test(config.newApi.baseUrl)) return config.newApi.baseUrl;
    return `${config.newApi.baseUrl}/v1/messages`;
  }
  if (/\/chat\/completions$/i.test(config.newApi.baseUrl)) return config.newApi.baseUrl;
  if (/\/(v1|v4|api\/paas\/v4)$/i.test(config.newApi.baseUrl)) {
    return `${config.newApi.baseUrl}/chat/completions`;
  }
  return `${config.newApi.baseUrl}/v1/chat/completions`;
};

const isGlmModel = (model) => /^glm-/i.test(model || "");
const supportsGlmThinkingMode = (model) => /^glm-4\.5/i.test(model || "");
const providerName = () => {
  if (isAnthropicProvider()) return `anthropic:${config.newApi.model || "unknown"}`;
  return isGlmModel(config.newApi.model) ? `glm:${config.newApi.model}` : "new-api";
};
const isProviderReady = () => Boolean(config.newApi.baseUrl && config.newApi.apiKey && config.newApi.model);

const buildMessages = (plan) => [
  { role: "system", content: plan.system },
  ...(plan.history || []),
  { role: "user", content: plan.user },
];

const normalizeAnthropicMessages = (messages) => {
  const normalized = [];
  for (const message of messages) {
    const role = message.role === "assistant" ? "assistant" : "user";
    const content = String(message.content || "").trim();
    if (!content) continue;

    const last = normalized[normalized.length - 1];
    if (last?.role === role) {
      last.content = `${last.content}\n\n${content}`;
    } else {
      normalized.push({ role, content });
    }
  }
  return normalized.length ? normalized : [{ role: "user", content: "请继续。" }];
};

const completionBody = (plan) => {
  const body = {
    model: config.newApi.model,
    messages: buildMessages(plan),
    temperature: 0.4,
  };

  if (supportsGlmThinkingMode(config.newApi.model)) {
    body.thinking = { type: "disabled" };
  }

  return body;
};

const anthropicBody = (plan) => ({
  model: config.newApi.model,
  max_tokens: 1200,
  temperature: 0.4,
  system: plan.system,
  messages: normalizeAnthropicMessages([...(plan.history || []), { role: "user", content: plan.user }]),
});

const parseAnthropicReply = (payload) => {
  if (typeof payload?.content === "string") return payload.content.trim();
  if (!Array.isArray(payload?.content)) return "";
  return payload.content
    .map((part) => {
      if (typeof part === "string") return part;
      if (part?.type === "text" && typeof part.text === "string") return part.text;
      return "";
    })
    .join("")
    .trim();
};

const normalizeUsage = (usage = {}) => ({
  prompt_tokens: usage.prompt_tokens ?? usage.input_tokens ?? null,
  completion_tokens: usage.completion_tokens ?? usage.output_tokens ?? null,
  total_tokens:
    usage.total_tokens ??
    ((usage.input_tokens ?? usage.prompt_tokens) != null && (usage.output_tokens ?? usage.completion_tokens) != null
      ? Number(usage.input_tokens ?? usage.prompt_tokens) + Number(usage.output_tokens ?? usage.completion_tokens)
      : null),
});

const callNewApi = async (plan) => {
  const endpoint = completionEndpoint();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.newApi.timeoutMs);
  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        ...(isAnthropicProvider()
          ? {
              "x-api-key": config.newApi.apiKey,
              "anthropic-version": "2023-06-01",
            }
          : {
              Authorization: `Bearer ${config.newApi.apiKey}`,
            }),
      },
      body: JSON.stringify(isAnthropicProvider() ? anthropicBody(plan) : completionBody(plan)),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new HttpError(504, "Model provider request timed out", {
        endpoint,
        provider: providerName(),
        model: config.newApi.model,
        timeoutMs: config.newApi.timeoutMs,
      });
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const providerMessage =
      payload.error?.message ||
      payload.error?.error ||
      payload.message ||
      payload.msg ||
      "New API request failed";
    throw new HttpError(response.status, providerMessage, {
      configured: true,
      endpoint,
      provider: providerName(),
      model: config.newApi.model,
      hasApiKey: Boolean(config.newApi.apiKey),
    });
  }

  return {
    reply: isAnthropicProvider() ? parseAnthropicReply(payload) : payload.choices?.[0]?.message?.content?.trim() || "",
    usage: normalizeUsage(payload.usage),
  };
};

export function getModelRuntimeStatus() {
  const missing = [];
  if (!config.newApi.baseUrl) missing.push("NEW_API_BASE_URL");
  if (!config.newApi.apiKey) missing.push("NEW_API_KEY");
  if (!config.newApi.model) missing.push("NEW_API_MODEL");

  return {
    configured: missing.length === 0,
    missing,
    provider: config.newApi.model ? providerName() : "not-configured",
    baseUrl: config.newApi.baseUrl || "",
    endpoint: completionEndpoint(),
    model: config.newApi.model || "",
    timeoutMs: config.newApi.timeoutMs,
    hasApiKey: Boolean(config.newApi.apiKey),
  };
}

export async function testModelRuntime({ input = "请用一句话回复：妙讯模型连通测试" } = {}) {
  const status = getModelRuntimeStatus();
  if (!status.configured) {
    throw new HttpError(503, `Model provider is not configured: ${status.missing.join(", ")}`, status);
  }

  const startedAt = Date.now();
  const completion = await callNewApi({
    system: "你是妙讯后台的模型连通性测试助手。只需确认模型是否可用，回答要简短。",
    user: input,
  });

  return {
    ...status,
    ok: true,
    latencyMs: Date.now() - startedAt,
    reply: completion.reply,
    tokenUsage: {
      prompt: completion.usage.prompt_tokens ?? null,
      completion: completion.usage.completion_tokens ?? null,
      total: completion.usage.total_tokens ?? null,
    },
  };
}

export async function runAgent({ agentId, input, user, thread = null, messages = [], appContext = null }) {
  const agent = await getAgent(agentId);
  if (!agent) throw new HttpError(404, `Agent ${agentId} is not registered`);

  const startedAt = Date.now();
  const plan = await agent.plan({ input, user, thread, messages, appContext });
  const providerReady = isProviderReady();

  if (!providerReady) {
    throw new HttpError(503, `Model provider is not configured: ${getModelRuntimeStatus().missing.join(", ")}`, {
      ...getModelRuntimeStatus(),
      agentId,
    });
  }

  const completion = await callNewApi(plan);
  if (!completion.reply) {
    throw new HttpError(502, "Model provider returned an empty reply", {
      provider: providerName(),
      model: config.newApi.model,
      endpoint: completionEndpoint(),
    });
  }

  return {
    agentId,
    provider: providerName(),
    reply: completion.reply,
    latencyMs: Date.now() - startedAt,
    tokenUsage: {
      prompt: completion.usage.prompt_tokens ?? null,
      completion: completion.usage.completion_tokens ?? null,
      total: completion.usage.total_tokens ?? null,
    },
  };
}
