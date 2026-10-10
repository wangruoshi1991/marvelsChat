export const isAnthropicModelProvider = baseUrl => /\/anthropic(?:\/|$)/i.test(baseUrl || "");

// Conversation and query parsing share one endpoint contract. A request
// failure never switches protocols or providers.
export const resolveModelCompletionEndpoint = baseUrl => {
  if (!baseUrl) return "";
  if (isAnthropicModelProvider(baseUrl)) {
    if (/\/v1\/messages$/i.test(baseUrl)) return baseUrl;
    return baseUrl + "/v1/messages";
  }
  if (/\/chat\/completions$/i.test(baseUrl)) return baseUrl;
  if (/\/(v1|v4|api\/paas\/v4)$/i.test(baseUrl)) return baseUrl + "/chat/completions";
  return baseUrl + "/v1/chat/completions";
};

export const isModelQueryConfigured = runtime => {
  if (!runtime?.apiKey || !runtime?.model) return false;
  try {
    const endpoint = new URL(resolveModelCompletionEndpoint(runtime.baseUrl));
    return endpoint.protocol === "https:" && !endpoint.username && !endpoint.password &&
      !endpoint.search && !endpoint.hash;
  } catch { return false; }
};
