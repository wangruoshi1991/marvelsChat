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

const parseToolCalls = (payload) => {
  const calls = isAnthropicProvider()
    ? (Array.isArray(payload.content) ? payload.content : []).filter(part => part?.type === "tool_use")
    : payload.choices?.[0]?.message?.tool_calls ?? [];
  if (!Array.isArray(calls) || calls.length > 2) throw new HttpError(502, "Model provider returned invalid tool calls");
  return calls.map(call => isAnthropicProvider()
    ? { id: call.id, name: call.name, arguments: call.input }
    : { id: call?.id, name: call?.function?.name, arguments: call?.function?.arguments });
};

const callNewApi = async (plan, { conversation = null, tools = null, finalTurn = false } = {}) => {
  const endpoint = completionEndpoint();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.newApi.timeoutMs);
  let response;
  let payload;

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
      body: JSON.stringify(isAnthropicProvider()
        ? { ...anthropicBody(plan),
            ...(conversation ? { messages: conversation } : {}),
            ...(tools ? { tools: tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.parameters })),
              tool_choice: { type: finalTurn ? "none" : "auto" } } : {}) }
        : { ...completionBody(plan),
            ...(conversation ? { messages: conversation } : {}),
            ...(tools ? { tools: tools.map(tool => ({ type: "function", function: tool })), tool_choice: finalTurn ? "none" : "auto" } : {}) }),
      signal: controller.signal,
    });
    const responseText = await response.text();
    try {
      payload = JSON.parse(responseText);
    } catch {
      throw new HttpError(502, "Model provider returned an invalid JSON response");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new HttpError(502, "Model provider returned an invalid response envelope");
    }
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
    assistant: isAnthropicProvider()
      ? { role: "assistant", content: payload.content }
      : payload.choices?.[0]?.message,
    toolCalls: parseToolCalls(payload),
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

export async function runAgent({ agentId, input, user, thread = null, messages = [], appContext = null, tools = null }) {
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

  const conversation = isAnthropicProvider()
    ? normalizeAnthropicMessages([...(plan.history || []), { role: "user", content: plan.user }])
    : buildMessages(plan);
  let completion;
  const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
  let calls = 0;
  for (let turn = 0; turn < (tools ? 3 : 1); turn += 1) {
    const finalTurn = turn === 2 || tools?.metadata().outcome != null;
    completion = await callNewApi(plan, {
      conversation, tools: tools?.definitions, finalTurn,
    });
    for (const key of Object.keys(usage)) {
      usage[key] = usage[key] == null || completion.usage[key] == null ? null : usage[key] + completion.usage[key];
    }
    if (!completion.toolCalls.length) break;
    if (!tools || finalTurn || calls + completion.toolCalls.length > 2) {
      throw new HttpError(502, "Model provider exceeded the allowed tool calls");
    }
    conversation.push(completion.assistant);
    const results = [];
    for (const call of completion.toolCalls) {
      if (typeof call.id !== "string" || !call.id || !tools.definitions.some(tool => tool.name === call.name)) {
        throw new HttpError(502, "Model provider returned an unauthorized tool call");
      }
      let args;
      try { args = typeof call.arguments === "string" ? JSON.parse(call.arguments) : call.arguments; }
      catch { throw new HttpError(502, "Model provider returned invalid tool arguments"); }
      const result = await tools.execute(call.name, args);
      calls += 1;
      if (isAnthropicProvider()) results.push({ type: "tool_result", tool_use_id: call.id, content: JSON.stringify(result) });
      else conversation.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
    if (isAnthropicProvider()) conversation.push({ role: "user", content: results });
  }
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
      prompt: usage.prompt_tokens,
      completion: usage.completion_tokens,
      total: usage.total_tokens,
    },
    ...(tools ? { albumAssistant: tools.metadata() } : {}),
  };
}
