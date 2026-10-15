import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { costFen, hashEvaluationValue, resolveEvaluationCostContract, resolveEvaluationProvider, runBoundedLiveEvaluation } from "../scripts/live-eval-provider.js";

const fusheng = { profile: "fusheng-gpt-6.1-sol", baseUrl: "https://fushengyunsuan.cn/v1/chat/completions", model: "gpt-6.1-sol", apiKey: "synthetic-test-key" };
const direct = { profile: "direct-deepseek-flash", baseUrl: "https://api.deepseek.com/chat/completions", model: "deepseek-v4-flash", apiKey: "synthetic-test-key" };
const prices = { inputYuanPerMillion: 2, outputYuanPerMillion: 8 };
const readRecords = async file => (await fs.readFile(file, "utf8")).trim().split("\n").map(line => JSON.parse(line));
const receipt = (overrides = {}) => new Response(JSON.stringify({ model: fusheng.model,
  usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
  choices: [{ finish_reason: "stop", message: { content: "Synthetic result" } }], ...overrides }));

async function setup(t, { count = 2, priced = false } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "live-eval-provider-test-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const runtime = priced ? direct : fusheng;
  const body = JSON.stringify({ model: runtime.model, messages: [{ role: "user", content: "Public synthetic request" }], max_tokens: 128 });
  const requestBytes = Buffer.byteLength(body);
  return { runtime, prepared: Array.from({ length: count }, (_, index) => ({ item: { id: `case-${index}`, tags: ["synthetic"] }, body, requestBytes,
    reservedCostFen: priced ? costFen(requestBytes, 128, prices) : null, promptHash: hashEvaluationValue(body) })),
  maxCostFen: priced ? 100 : null, prices: priced ? prices : null, maxCalls: count,
  maxOutputTokens: 128, maxRequestBytes: 1024, maxResponseBytes: 1024, timeoutMs: 100,
  reportPath: path.join(directory, "report.jsonl"), grade: (_item, output) => ({ passed: output === "Synthetic result", failures: [] }) };
}

test("reviewed relay profile permits only its exact endpoint and requested and served model", () => {
  const provider = resolveEvaluationProvider(fusheng);
  assert.equal(provider.endpoint.toString(), fusheng.baseUrl);
  assert.equal(provider.acceptsResponseModel("gpt-6.1-sol"), true);
  assert.equal(provider.acceptsResponseModel("gpt-6.1-sol-20261014"), false);
  for (const changes of [
    { profile: "other-relay" }, { model: "gpt-6.1" }, { model: "GPT-6.1-SOL" },
    { baseUrl: "https://api.cicadas.top/v1/chat/completions" },
    { baseUrl: "https://fushengyunsuan.cn/chat/completions" },
    { baseUrl: "https://fushengyunsuan.cn/v1/chat/completions/" },
    { baseUrl: "https://fushengyunsuan.cn/v1/chat/completions?group=vip" },
    { baseUrl: "https://fushengyunsuan.cn/v1/chat/completions#fragment" },
    { baseUrl: "https://user@fushengyunsuan.cn/v1/chat/completions" },
    { baseUrl: "https://fushengyunsuan.cn:443/v1/chat/completions" },
  ]) assert.throws(() => resolveEvaluationProvider({ ...fusheng, ...changes }));
});

test("unpriced relay requires explicit nulls and direct profile retains its finite budget contract", () => {
  assert.deepEqual(resolveEvaluationCostContract({ runtime: fusheng, maxCostFen: null, prices: null }), { maxCostFen: null, prices: null });
  for (const options of [{}, { maxCostFen: null }, { prices: null }, { maxCostFen: 100, prices }, { maxCostFen: null, prices }]) {
    assert.throws(() => resolveEvaluationCostContract({ runtime: fusheng, ...options }));
  }
  assert.deepEqual(resolveEvaluationCostContract({ runtime: direct, maxCostFen: 100, prices }), { maxCostFen: 100, prices });
  for (const options of [{ maxCostFen: null, prices: null }, { maxCostFen: Infinity, prices }, { maxCostFen: 0, prices },
    { maxCostFen: 100, prices: { inputYuanPerMillion: 0, outputYuanPerMillion: 0 } }]) {
    assert.throws(() => resolveEvaluationCostContract({ runtime: direct, ...options }));
  }
});

test("unpriced receipts persist real usage, never a fabricated zero-cost estimate, with private durable dispatch", async t => {
  const options = await setup(t); let calls = 0;
  const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async (url, request) => {
    const log = await readRecords(options.reportPath);
    assert.equal(log.at(-1).type, "dispatch");
    assert.equal(log.at(-1).callNumber, calls + 1);
    assert.equal(log.at(-1).reservedCostFen, null);
    assert.equal(url, fusheng.baseUrl);
    assert.equal(request.method, "POST");
    assert.equal(request.redirect, "error");
    assert.equal(request.headers.Authorization, `Bearer ${fusheng.apiKey}`);
    calls += 1;
    return receipt();
  } });
  assert.equal(summary.passed, true);
  assert.equal(summary.calls, 2);
  assert.equal(summary.unknownCalls, 0);
  assert.equal(summary.estimatedCostFen, null);
  assert.equal(summary.retainedReservationFen, null);
  const log = await readRecords(options.reportPath);
  assert.equal(log[0].maxCostFen, null);
  assert.equal(log[0].prices, null);
  assert.equal(log[0].retryCount, 0);
  for (const record of log.filter(value => value.type === "receipt")) {
    assert.deepEqual(record.usage, { prompt: 20, completion: 10, total: 30 });
    assert.equal(record.costUpperBoundFen, null);
  }
  assert.equal(JSON.stringify(log).includes(fusheng.apiKey), false);
  assert.equal(JSON.stringify(log).includes("Public synthetic request"), false);
  assert.equal((await fs.stat(options.reportPath)).mode & 0o777, 0o600);
});

test("one explicit finite batch may contain sixteen calls, while seventeen rejects before dispatch", async t => {
  const options = await setup(t, { count: 16 }); let calls = 0;
  const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async () => { calls += 1; return receipt(); } });
  assert.equal(summary.passed, true); assert.equal(calls, 16);
  const tooMany = await setup(t, { count: 17 });
  await assert.rejects(runBoundedLiveEvaluation({ ...tooMany, fetchImpl: async () => { calls += 1; return receipt(); } }));
  assert.equal(calls, 16);
  await assert.rejects(fs.stat(tooMany.reportPath), { code: "ENOENT" });
});

test("unpriced unknown network, HTTP, usage or JSON receipt stops subsequent calls without retry", async t => {
  for (const kind of ["network", "http", "usage", "json"]) {
    const options = await setup(t); let calls = 0;
    const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async () => {
      calls += 1;
      if (kind === "network") throw new TypeError("Synthetic transport interruption");
      if (kind === "http") return new Response(JSON.stringify({ error: "Synthetic provider rejection" }), { status: 429 });
      if (kind === "json") return new Response("invalid json");
      return receipt({ usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 29 } });
    } });
    assert.equal(calls, 1, kind);
    assert.equal(summary.passed, false);
    assert.equal(summary.unknownCalls, 1);
    assert.equal(summary.estimatedCostFen, null);
    assert.equal(summary.retainedReservationFen, null);
    assert.equal(summary.error.code, "LIVE_EVAL_RESPONSE_UNKNOWN");
    assert.equal((await readRecords(options.reportPath)).filter(value => value.type === "unknown").length, 1);
  }
});

test("unpriced receipt from another model is unknown and cannot advance the batch", async t => {
  const options = await setup(t); let calls = 0;
  const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async () => { calls += 1; return receipt({ model: "gpt-6.1" }); } });
  assert.equal(calls, 1);
  assert.equal(summary.unknownCalls, 1);
  assert.equal(summary.error.code, "LIVE_EVAL_RECEIPT_OUTSIDE_RESERVED_CONTRACT");
  assert.equal((await readRecords(options.reportPath)).some(value => value.type === "receipt"), false);
});

test("bounded transport aborts a timed out request and stops the batch", async t => {
  const options = await setup(t); let calls = 0;
  const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async (_url, request) => {
    calls += 1;
    return new Promise((_resolve, reject) => request.signal.addEventListener("abort", () => reject(new Error("Synthetic abort")), { once: true }));
  } });
  assert.equal(calls, 1);
  assert.equal(summary.unknownCalls, 1);
  assert.equal(summary.error.code, "LIVE_EVAL_RESPONSE_UNKNOWN");
});

test("bounded response stream cancels an oversized body and stops without retry", async t => {
  const options = await setup(t); let calls = 0, cancelled = false;
  const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async () => {
    calls += 1;
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(1025)); }, cancel() { cancelled = true; } }));
  } });
  assert.equal(calls, 1); assert.equal(cancelled, true);
  assert.equal(summary.unknownCalls, 1);
  assert.equal(summary.error.code, "LIVE_EVAL_RESPONSE_UNKNOWN");
});

test("absence of pricing does not remove request byte or served token limits", async t => {
  const invalid = await setup(t); let calls = 0;
  invalid.prepared[0].requestBytes = 1025;
  await assert.rejects(runBoundedLiveEvaluation({ ...invalid, fetchImpl: async () => { calls += 1; return receipt(); } }), /Invalid request reservation/);
  assert.equal(calls, 0);
  for (const usage of [
    { prompt_tokens: 20, completion_tokens: 129, total_tokens: 149 },
    { prompt_tokens: 1025, completion_tokens: 10, total_tokens: 1035 },
  ]) {
    const options = await setup(t);
    const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async () => { calls += 1; return receipt({ usage }); } });
    assert.equal(summary.calls, 1);
    assert.equal(summary.unknownCalls, 0);
    assert.equal(summary.error.code, "LIVE_EVAL_RECEIPT_OUTSIDE_RESERVED_CONTRACT");
  }
  assert.equal(calls, 2);
});

test("dynamic continuation stays inside its byte reservation and cannot invent a cost reservation", async t => {
  const options = await setup(t); let calls = 0;
  options.prepared[1] = { ...options.prepared[1], prepare: async () => ({ body: "x".repeat(1025), requestBytes: 1025, reservedCostFen: 1 }) };
  const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async () => { calls += 1; return receipt(); } });
  assert.equal(calls, 1);
  assert.equal(summary.error.code, "LIVE_EVAL_REQUEST_OUTSIDE_RESERVED_CONTRACT");
  assert.equal(summary.estimatedCostFen, null);
});

test("direct transport accounts finite cost and retains unknown dispatch reservation", async t => {
  const options = await setup(t, { priced: true }); let calls = 0;
  const summary = await runBoundedLiveEvaluation({ ...options, fetchImpl: async () => {
    calls += 1;
    if (calls === 2) throw new TypeError("Synthetic interruption");
    return receipt({ model: "deepseek-v4.1-flash" });
  } });
  assert.equal(summary.estimatedCostFen, costFen(20, 10, prices));
  assert.equal(summary.retainedReservationFen, options.prepared[1].reservedCostFen);
  assert.equal(summary.unknownCalls, 1);
  const excessive = await setup(t, { priced: true });
  await assert.rejects(runBoundedLiveEvaluation({ ...excessive, maxCostFen: 1, fetchImpl: async () => { calls += 1; return receipt(); } }), /explicit cost cap/);
  assert.equal(calls, 2);
});

test("report is append-only within one run and an existing file cannot replay dispatch", async t => {
  const options = await setup(t); let calls = 0;
  await fs.writeFile(options.reportPath, "Preserve previous report", { mode: 0o600 });
  await assert.rejects(runBoundedLiveEvaluation({ ...options, fetchImpl: async () => { calls += 1; return receipt(); } }), { code: "EEXIST" });
  assert.equal(calls, 0);
  assert.equal(await fs.readFile(options.reportPath, "utf8"), "Preserve previous report");
});
