import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { z } from "zod";

export const hashEvaluationValue = value => crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item)).digest("hex");
const hash = hashEvaluationValue;
const unknown = { code: "LIVE_EVAL_RESPONSE_UNKNOWN", message: "Provider response or charged usage could not be confirmed; no retries or later calls." };
const safeError = code => ({ code, message: code === unknown.code ? unknown.message : "Live evaluation stopped; inspect the private report for bounded evidence." });

// The CLI accepts named, reviewed profiles, never an arbitrary provider URL.
// Relay profiles require an independently confirmed endpoint and model. An
// unpriced profile must explicitly omit cost estimates; these are evaluation-only settings.
export function resolveEvaluationProvider(runtime) {
  const endpoint = new URL(runtime?.baseUrl);
  const profile = runtime.profile || "direct-deepseek-flash";
  if (endpoint.search || endpoint.hash || endpoint.username || endpoint.password ||
    typeof runtime.apiKey !== "string" || !runtime.apiKey || typeof runtime.model !== "string") {
    throw new Error("Live evaluation requires a verified provider profile and exact permitted runtime");
  }
  if (profile === "direct-deepseek-flash" && endpoint.origin === "https://api.deepseek.com" &&
    ["/chat/completions", "/v1/chat/completions"].includes(endpoint.pathname) && /^(?:deepseek-v4(?:\.1)?-flash|deepseek-flash)$/.test(runtime.model)) {
    return { endpoint, acceptsResponseModel: model => /^(?:deepseek-v4(?:\.1)?-flash|deepseek-flash)$/.test(model), requiresPrices: true };
  }
  if (profile === "fusheng-gpt-6.1-sol" && runtime.baseUrl === "https://fushengyunsuan.cn/v1/chat/completions" && runtime.model === "gpt-6.1-sol") {
    return { endpoint, acceptsResponseModel: model => model === "gpt-6.1-sol", requiresPrices: false };
  }
  throw new Error("Live evaluation requires a verified provider profile and exact permitted runtime");
}

export const priceSchema = z.object({ inputYuanPerMillion: z.number().finite().min(2).max(1000), outputYuanPerMillion: z.number().finite().min(8).max(1000) }).strict();
export const costFen = (input, output, prices) => Math.ceil((input * prices.inputYuanPerMillion + output * prices.outputYuanPerMillion) / 10000);
export function resolveEvaluationCostContract({ runtime, maxCostFen, prices }) {
  const { requiresPrices } = resolveEvaluationProvider(runtime);
  if (!requiresPrices) {
    if (maxCostFen !== null || prices !== null) throw new Error("Unpriced evaluation requires explicit null cost cap and prices");
    return { maxCostFen: null, prices: null };
  }
  return { maxCostFen: z.number().int().min(1).max(1000).parse(maxCostFen), prices: priceSchema.parse(prices) };
}
const parseUsage = value => {
  const result = z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative(), total_tokens: z.number().int().nonnegative() }).passthrough().safeParse(value);
  if (!result.success || result.data.total_tokens < result.data.prompt_tokens + result.data.completion_tokens) return null;
  return { prompt: result.data.prompt_tokens, completion: result.data.completion_tokens, total: result.data.total_tokens };
};

async function readBoundedResponse(response, maxBytes) {
  if (!response.body?.getReader) throw new Error("No bounded provider response stream");
  const declared = response.headers.get("content-length");
  if (/^\d+$/.test(declared || "") && Number(declared) > maxBytes) throw new Error("Oversized response");
  const reader = response.body.getReader();
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error("Oversized response"); }
      chunks.push(Buffer.from(value));
    }
  } finally { reader.releaseLock(); }
  return JSON.parse(Buffer.concat(chunks, length).toString("utf8"));
}

// Internal shared bounded transport. Callers prepare public prompts and fixed
// graders; this layer owns budgets, durable dispatch, receipts and no retry.
export async function runBoundedLiveEvaluation({ runtime, prepared, maxCostFen, maxCalls, prices, reportPath,
  maxOutputTokens, maxRequestBytes, maxResponseBytes, timeoutMs, fetchImpl = globalThis.fetch, now = () => Date.now(),
  metadata = {}, summaryMetadata = {}, grade,
}) {
  ({ maxCostFen, prices } = resolveEvaluationCostContract({ runtime, maxCostFen, prices }));
  const priced = prices !== null;
  z.number().int().min(1).max(16).parse(maxCalls);
  z.number().int().min(128).max(4096).parse(maxOutputTokens);
  z.number().int().min(1024).max(65536).parse(maxRequestBytes);
  z.number().int().min(1024).max(131072).parse(maxResponseBytes);
  z.number().int().min(100).max(60000).parse(timeoutMs);
  const { endpoint, acceptsResponseModel } = resolveEvaluationProvider(runtime);
  if (!prepared.length || prepared.length > maxCalls || new Set(prepared.map(value => value.item.id)).size !== prepared.length) throw new Error("Call cap must cover unique cases");
  for (const request of prepared) {
    if (!Number.isInteger(request.requestBytes) || request.requestBytes < 1 || request.requestBytes > maxRequestBytes ||
      request.reservedCostFen !== (priced ? costFen(request.requestBytes, maxOutputTokens, prices) : null) ||
      (!request.prepare && Buffer.byteLength(request.body, "utf8") !== request.requestBytes)) throw new Error("Invalid request reservation");
  }
  if (priced && prepared.reduce((sum, item) => sum + item.reservedCostFen, 0) > maxCostFen) throw new Error("Worst-case evaluation reservation exceeds the explicit cost cap");
  const outcomes = new Map();
  const report = await fs.open(path.resolve(reportPath), "wx", 0o600);
  const append = async record => { await report.writeFile(JSON.stringify(record) + "\n"); await report.sync(); };
  const results = []; let estimatedCostFen = priced ? 0 : null, reservedCostFen = priced ? 0 : null, calls = 0, unknownCalls = 0, fatal = null;
  try {
    await append({ type: "run_start", version: 1, at: new Date(now()).toISOString(), ...metadata, requestedModel: runtime.model, providerProfile: runtime.profile,
      maxCostFen, maxCalls, maxOutputTokens, maxRequestBytes, maxResponseBytes, prices, retryCount: 0 });
    for (const reservedRequest of prepared) {
      let request = reservedRequest;
      if (reservedRequest.prepare) {
        const dynamic = await reservedRequest.prepare(outcomes);
        if (!dynamic) {
          const result = { caseId: request.item.id, tags: request.item.tags, passed: false, failures: ["prior_clarification_failed"] };
          results.push(result); await append({ type: "case_grade", ...result }); continue;
        }
        request = { ...reservedRequest, ...dynamic, reservedCostFen: reservedRequest.reservedCostFen };
        if (Buffer.byteLength(request.body, "utf8") !== request.requestBytes || request.requestBytes > reservedRequest.requestBytes || request.requestBytes > maxRequestBytes) {
          fatal = safeError("LIVE_EVAL_REQUEST_OUTSIDE_RESERVED_CONTRACT"); break;
        }
      }
      if (calls >= maxCalls || (priced && estimatedCostFen + reservedCostFen + request.reservedCostFen > maxCostFen)) { fatal = safeError("LIVE_EVAL_BUDGET_EXHAUSTED"); break; }
      if (priced) reservedCostFen += request.reservedCostFen;
      calls += 1;
      // Append+fsync dispatch BEFORE fetch. Unknown calls retain the reservation
      // in this append-only new report; a rerun cannot silently replay this file.
      await append({ type: "dispatch", at: new Date(now()).toISOString(), caseId: request.item.id, callNumber: calls,
        requestHash: hash(request.body), promptHash: request.promptHash, requestBytes: request.requestBytes, reservedCostFen: request.reservedCostFen });
      const startedAt = now(); const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let payload, response;
      try {
        response = await fetchImpl(endpoint.toString(), { method: "POST", redirect: "error", headers: { "Content-Type": "application/json", Authorization: `Bearer ${runtime.apiKey}` }, body: request.body, signal: controller.signal });
        payload = await readBoundedResponse(response, maxResponseBytes);
      } catch {
        fatal = safeError(unknown.code);
        unknownCalls += 1;
        await append({ type: "unknown", at: new Date(now()).toISOString(), caseId: request.item.id, callNumber: calls,
          retainedReservationFen: request.reservedCostFen, error: fatal });
        break;
      } finally { clearTimeout(timer); }
      const usage = parseUsage(payload?.usage);
      const responseModel = typeof payload?.model === "string" && payload.model.length > 0 && payload.model.length <= 200 ? payload.model : null;
      if (!response.ok || !usage || !responseModel) {
        fatal = safeError(unknown.code);
        unknownCalls += 1;
        await append({ type: "unknown", at: new Date(now()).toISOString(), caseId: request.item.id, callNumber: calls,
          httpStatus: response.status, responseModel, usage, retainedReservationFen: request.reservedCostFen, error: fatal });
        break;
      }
      if (!acceptsResponseModel(responseModel)) {
        // A different model is outside the reviewed profile. Preserve any cost
        // reservation and stop without attributing it to the requested model.
        fatal = safeError("LIVE_EVAL_RECEIPT_OUTSIDE_RESERVED_CONTRACT");
        unknownCalls += 1;
        await append({ type: "unknown", at: new Date(now()).toISOString(), caseId: request.item.id, callNumber: calls,
          responseModel, usage, retainedReservationFen: request.reservedCostFen, error: fatal });
        break;
      }
      const costUpperBoundFen = priced ? costFen(usage.prompt, usage.completion, prices) : null;
      if (priced) { estimatedCostFen += costUpperBoundFen; reservedCostFen -= request.reservedCostFen; }
      const choice = payload.choices?.[0]; const rawOutput = choice?.message?.content;
      await append({ type: "receipt", at: new Date(now()).toISOString(), caseId: request.item.id, callNumber: calls, responseModel, usage,
        finishReason: typeof choice?.finish_reason === "string" ? choice.finish_reason.slice(0, 40) : null,
        costUpperBoundFen, latencyMs: Math.max(0, now() - startedAt), rawOutput: typeof rawOutput === "string" ? rawOutput : null });
      if ((priced && costUpperBoundFen > request.reservedCostFen) || usage.completion > maxOutputTokens || usage.prompt > request.requestBytes) {
        fatal = safeError("LIVE_EVAL_RECEIPT_OUTSIDE_RESERVED_CONTRACT"); break;
      }
      if (typeof rawOutput !== "string" || choice.finish_reason !== "stop") {
        const result = { caseId: request.item.id, tags: request.item.tags, passed: false, failures: ["incomplete_or_missing_output"] };
        results.push(result); await append({ type: "case_grade", ...result }); continue;
      }
      const graded = grade(request.item, rawOutput);
      outcomes.set(request.item.id, { rawOutput, ...graded });
      const result = { caseId: request.item.id, tags: request.item.tags, passed: graded.passed, failures: graded.failures };
      results.push(result); await append({ type: "case_grade", ...result });
    }
    const summary = { passed: !fatal && results.length === prepared.length && results.every(item => item.passed),
      completedCases: results.length, expectedCases: prepared.length, calls, unknownCalls, estimatedCostFen, retainedReservationFen: reservedCostFen, error: fatal,
      results, ...summaryMetadata };
    await append({ type: "run_finish", at: new Date(now()).toISOString(), ...summary });
    return summary;
  } finally { await report.close(); }
}
