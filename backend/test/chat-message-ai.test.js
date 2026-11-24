import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { createChatMessageAI } from "../src/chat-message-ai.js";
import { createSafeErrorResponse } from "../src/request-observability.js";
import { registerChatMessageAIRoutes } from "../src/routes/chat-message-ai-routes.js";

const ids = { userId: randomUUID(), threadId: randomUUID(), messageId: randomUUID(), attachmentId: randomUUID() };
const audio = Buffer.from("fixture-audio-bytes");
const audioMetadata = { checksum_sha256: "a".repeat(64), byte_size: audio.length, duration_ms: 2000 };
const settings = {
  translationEnabled: true,
  transcriptionEnabled: true,
  transcriptionUrl: "https://voice.example.invalid/v1/audio/transcriptions",
  transcriptionApiKey: "local-voice-key",
  transcriptionModel: "voice-fixture",
};
const textRuntime = { baseUrl: "https://text.example.invalid/v1", apiKey: "local-text-key", model: "text-fixture" };
const respondTranslation = () => Response.json({ choices: [{ finish_reason: "stop", message: { content: "English translation" } }] });
const hasCode = (status, code) => error => error.status === status && error.details?.code === code;

const visibleFixture = async (sql, args) => {
  assert.match(sql, /t\.user_id = \?/);
  assert.match(sql, /m\.deleted_at IS NULL AND m\.recalled_at IS NULL/);
  assert.match(sql, /t\.kind IN \('direct', 'group'\)/);
  if (args[0] !== ids.userId || args[1] !== ids.threadId || args[2] !== ids.messageId) return [];
  if (sql.includes("chat_attachment_references")) {
    assert.match(sql, /r\.message_id = m\.id/);
    assert.match(sql, /a\.id = \? AND a\.kind = 'audio'/);
    if (args[3] !== ids.attachmentId) return [];
    return sql.startsWith("SELECT a.content") ? [{ content: audio, ...audioMetadata }] : [{ ...audioMetadata }];
  }
  return [{ content: "仅此条消息" }];
};

test("registered routes enforce auth and exact schema, and process only selected stored input", async t => {
  const calls = [];
  const service = createChatMessageAI({ settings, textRuntime, queryFn: visibleFixture, fetchImpl: async (url, options) => {
    calls.push({ url: url.href, options });
    return url.host.startsWith("text") ? respondTranslation() : Response.json({ text: "语音内容" });
  } });
  assert.deepEqual(service.availability, { translate: true, transcribe: true, translateTranscript: true });
  const app = express();
  app.use(express.json());
  registerChatMessageAIRoutes(app, {
    authenticate(req, res, next) {
      if (!req.get("Authorization")) return res.sendStatus(401);
      req.user = { id: req.get("Authorization") };
      next();
    },
    asyncHandler: handler => (req, res, next) => handler(req, res).catch(next),
    service,
  });
  app.use((error, _req, res, _next) => {
    const result = createSafeErrorResponse(error, { production: true, requestId: "local" });
    res.status(result.status).json(result.body);
  });
  const server = app.listen(0, "127.0.0.1");
  t.after(() => server.close());
  await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}/api/threads/${ids.threadId}/messages/${ids.messageId}`;
  const call = (path, body, owner = ids.userId) => fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(owner ? { Authorization: owner } : {}) },
    body: JSON.stringify(body),
  });

  assert.equal((await call("/translate", { language: "en" }, null)).status, 401);
  const missing = await call("/translate", { language: "en" }, randomUUID());
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).error.details.code, "CHAT_MESSAGE_AI_NOT_FOUND");
  assert.equal((await call("/translate", { language: "es" })).status, 400);
  assert.equal((await call("/translate", { language: "en", text: "arbitrary source" })).status, 400);
  assert.equal((await call("/transcribe", { attachmentId: ids.attachmentId, url: "https://arbitrary.invalid/" })).status, 400);
  assert.equal((await call("/transcribe", { attachmentId: randomUUID() })).status, 404);
  assert.equal(calls.length, 0);

  const translated = await call("/translate", { language: "en" });
  assert.equal(translated.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await translated.json(), { data: { text: "English translation" } });
  assert.equal(calls[0].url, "https://text.example.invalid/v1/chat/completions");
  assert.equal(calls[0].options.redirect, "error");
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.messages[1].content, "仅此条消息");
  assert.equal(payload.tools, undefined);

  const transcript = await call("/transcribe", { attachmentId: ids.attachmentId });
  const { data: transcriptData } = await transcript.json();
  assert.equal(transcriptData.text, "语音内容");
  assert.match(transcriptData.transcriptId, /^[a-f0-9-]{36}$/);
  assert.equal(calls[1].url, settings.transcriptionUrl);
  const form = calls[1].options.body;
  assert.equal(form.get("model"), "voice-fixture");
  assert.equal(form.get("language"), null);
  assert.equal(form.get("file").name, "voice.m4a");
  assert.deepEqual(Buffer.from(await form.get("file").arrayBuffer()), audio);
  const voiceBody = { language: "en", attachmentId: ids.attachmentId, transcriptId: transcriptData.transcriptId };
  assert.equal((await call("/translate", { ...voiceBody, text: "untrusted" })).status, 400);
  assert.equal((await call("/translate", { language: "en", transcriptId: transcriptData.transcriptId })).status, 400);
  assert.equal((await call("/translate", { language: "en", attachmentId: ids.attachmentId })).status, 400);
  assert.deepEqual(await (await call("/translate", voiceBody)).json(), { data: { text: "English translation" } });
  assert.equal(JSON.parse(calls[2].options.body).messages[1].content, "语音内容");
  await call("/translate", voiceBody);
  assert.equal(calls.length, 3);
});

test("disabled and unsafe provider configuration cannot make a request", async () => {
  let calls = 0;
  const disabled = createChatMessageAI({
    settings: { ...settings, translationEnabled: false, transcriptionUrl: "https://username:secret@example.invalid/audio" },
    textRuntime,
    queryFn: visibleFixture,
    fetchImpl: async () => { calls += 1; },
  });
  const unavailable = hasCode(503, "CHAT_MESSAGE_AI_UNAVAILABLE");
  assert.deepEqual(disabled.availability, { translate: false, transcribe: false, translateTranscript: false });
  await assert.rejects(disabled.translate({ userId: ids.userId, threadId: ids.threadId, messageId: ids.messageId, language: "zh" }), unavailable);
  await assert.rejects(disabled.transcribe(ids), unavailable);
  assert.equal(calls, 0);
});

test("private provider errors, oversized or malformed results and unfinished responses are rejected", async () => {
  for (const response of [
    () => new Response("Private provider error", { status: 429 }),
    () => new Response("a".repeat(128 * 1024 + 1)),
    () => new Response("{invalid"),
    () => Response.json({ choices: [{ finish_reason: "length", message: { content: "incomplete" } }] }),
  ]) {
    const service = createChatMessageAI({ settings, textRuntime, queryFn: visibleFixture, fetchImpl: async () => response() });
    await assert.rejects(service.translate({ userId: ids.userId, threadId: ids.threadId, messageId: ids.messageId, language: "zh" }), error =>
      hasCode(502, "CHAT_MESSAGE_AI_PROVIDER_FAILED")(error) && !/Private provider/.test(error.message));
  }
});

test("access is rechecked after provider return", async () => {
  let removed = false;
  const service = createChatMessageAI({
    settings, textRuntime,
    queryFn: async (...args) => removed ? [] : visibleFixture(...args),
    fetchImpl: async () => {
      removed = true;
      return Response.json({ text: "result for removed message" });
    },
  });
  await assert.rejects(service.transcribe(ids), hasCode(404, "CHAT_MESSAGE_AI_NOT_FOUND"));
});

test("provider timeout includes a stalled response body", async () => {
  const keepEventLoop = setTimeout(() => {}, 200);
  try {
    const service = createChatMessageAI({
      settings, textRuntime,
      queryFn: visibleFixture,
      timeoutMs: 20,
      fetchImpl: async (_url, options) => new Response(new ReadableStream({
        start(controller) {
          options.signal.addEventListener("abort", () => controller.error(options.signal.reason), { once: true });
        },
      })),
    });
    await assert.rejects(service.translate({ userId: ids.userId, threadId: ids.threadId, messageId: ids.messageId, language: "zh" }), hasCode(504, "CHAT_MESSAGE_AI_TIMEOUT"));
  } finally {
    clearTimeout(keepEventLoop);
  }
});


test("transcript translation reuses server-owned text and coalesces concurrent and repeated translations", async () => {
  const calls = [];
  let finish;
  const service = createChatMessageAI({ settings, textRuntime, queryFn: visibleFixture,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      if (url.host.startsWith("voice")) return Response.json({ text: "server transcript" });
      return new Promise(resolve => { finish = () => resolve(respondTranslation()); });
    },
  });
  const { transcriptId } = await service.transcribe(ids);
  const input = { ...ids, transcriptId, language: "en", text: "client forged text" };
  const first = service.translate(input);
  const second = service.translate(input);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[1].options.body).messages[1].content, "server transcript");
  finish();
  assert.deepEqual(await first, { text: "English translation" });
  assert.deepEqual(await second, { text: "English translation" });
  assert.deepEqual(await service.translate(input), { text: "English translation" });
  assert.equal(calls.length, 2);
});

test("transcript receipts bind account, message, thread and attachment and fail closed after expiry or restart", async () => {
  let calls = 0;
  const service = createChatMessageAI({ settings, textRuntime, transcriptTtlMs: 30,
    queryFn: async (sql) => sql.startsWith("SELECT a.content") ? [{ content: audio, ...audioMetadata }] : [{ ...audioMetadata }],
    fetchImpl: async () => { calls += 1; return Response.json({ text: "bound transcript" }); },
  });
  const { transcriptId } = await service.transcribe(ids);
  const expired = hasCode(409, "CHAT_MESSAGE_AI_TRANSCRIPT_EXPIRED");
  for (const key of ["userId", "threadId", "messageId", "attachmentId"]) {
    await assert.rejects(service.translate({ ...ids, [key]: randomUUID(), transcriptId, language: "en" }), expired);
  }
  await assert.rejects(service.translate({ ...ids, transcriptId: randomUUID(), language: "en" }), expired);
  await new Promise(resolve => setTimeout(resolve, 40));
  await assert.rejects(service.translate({ ...ids, transcriptId, language: "en" }), expired);
  const restarted = createChatMessageAI({ settings, textRuntime, queryFn: visibleFixture, fetchImpl: async () => { calls += 1; } });
  await assert.rejects(restarted.translate({ ...ids, transcriptId, language: "en" }), expired);
  assert.equal(calls, 1);
});

test("transcript translation respects both feature gates and metadata ownership before and after provider calls", async () => {
  for (const disabled of [{ translationEnabled: false }, { transcriptionEnabled: false }]) {
    let calls = 0;
    const service = createChatMessageAI({ settings: { ...settings, ...disabled }, textRuntime, queryFn: visibleFixture,
      fetchImpl: async () => { calls += 1; },
    });
    assert.equal(service.availability.translateTranscript, false);
    await assert.rejects(service.translate({ ...ids, transcriptId: randomUUID(), language: "en" }), hasCode(503, "CHAT_MESSAGE_AI_UNAVAILABLE"));
    assert.equal(calls, 0);
  }
  for (const revoke of ["delete", "checksum"]) {
    let changed = false;
    const service = createChatMessageAI({ settings, textRuntime,
      queryFn: async (...args) => {
        const rows = await visibleFixture(...args);
        return changed ? revoke === "delete" ? [] : rows.map(row => ({ ...row, checksum_sha256: "b".repeat(64) })) : rows;
      },
      fetchImpl: async url => {
        if (url.host.startsWith("voice")) return Response.json({ text: "transcript" });
        changed = true;
        return respondTranslation();
      },
    });
    const { transcriptId } = await service.transcribe(ids);
    await assert.rejects(service.translate({ ...ids, transcriptId, language: "en" }), hasCode(404, "CHAT_MESSAGE_AI_NOT_FOUND"));
  }
});

test("transcript retention is bounded per owner and transcripts over source limit never receive a translation receipt", async () => {
  const service = createChatMessageAI({ settings, textRuntime, queryFn: visibleFixture,
    fetchImpl: async url => url.host.startsWith("voice") ? Response.json({ text: "transcript" }) : respondTranslation(),
  });
  const first = await service.transcribe(ids);
  let newest;
  for (let i = 0; i < 20; i += 1) newest = await service.transcribe(ids);
  await assert.rejects(service.translate({ ...ids, transcriptId: first.transcriptId, language: "en" }), hasCode(409, "CHAT_MESSAGE_AI_TRANSCRIPT_EXPIRED"));
  assert.deepEqual(await service.translate({ ...ids, transcriptId: newest.transcriptId, language: "en" }), { text: "English translation" });
  const oversized = createChatMessageAI({ settings, textRuntime, queryFn: visibleFixture,
    fetchImpl: async () => Response.json({ text: "x".repeat(6001) }),
  });
  assert.equal((await oversized.transcribe(ids)).transcriptId, undefined);
});
