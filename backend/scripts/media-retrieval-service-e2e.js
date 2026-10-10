import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { config } from "../src/config.js";
import { query, withTransaction, closeDatabase } from "../src/db.js";
import { createMediaRetrievalRepository } from "../src/media-retrieval-repository.js";
import { createMediaRetrievalProvider } from "../src/media-retrieval-provider.js";
import { createMediaRetrievalUserService } from "../src/media-retrieval-user-service.js";
import { createMediaRetrievalVisualResolver } from "../src/media-retrieval-visual-resolver.js";
import { processMediaRetrievalJob } from "../src/media-retrieval-service.js";
import { loadOwnedMediaBytes, normalizeImageForProvider, normalizeImageForReranking, extractRepresentativeFrames, extractVideoFramesAtTimestamps } from "../src/media-retrieval-media.js";
import { createAlbumAssistantAccessService } from "../src/album-assistant-access-service.js";
import { createAlbumAssistantTools } from "../src/album-assistant-tools.js";
import { getAgent } from "../../agents/registry.js";
import { runAgent } from "../src/agent-runtime.js";
import path from "node:path";
import { parseArgs } from "node:util";
import express from "express";
import { authenticate, hashToken, createPlainToken } from "../src/auth.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { registerStationMediaRetrievalRoutes } from "../src/routes/station-media-retrieval-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { RERANK_PROMPT_VERSION, RERANK_TEMPERATURE } from "../src/media-retrieval-prompts.js";
import { MEDIA_RETRIEVAL_LIMITS } from "../src/media-retrieval-constants.js";
import visualSuite from "../../agents/media-retrieval/visual-verification-suite.json" with { type: "json" };
const { values } = parseArgs({ options: { report: { type: "string" }, fixtures: { type: "string" }, "allow-paid": { type: "boolean" } } });
assert.ok(values["allow-paid"], "Explicit --allow-paid is required");
assert.ok(values.report && values.fixtures, "--report and --fixtures are required");
const fixtureDir = path.resolve(values.fixtures);
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1");
assert.ok(database.pathname.endsWith("_migration_test"));
const reportPath = path.resolve(values.report);
const report = { type: "isolated-db-real-model-service-and-agent", storageTransport: "local-public-bytes-no-OSS",
  runtimeGate: "injected-service-test-not-production-readiness", passed: [], providerCalls: [], failure: null };
const owner = crypto.randomUUID(), outsider = crypto.randomUUID(), albumId = crypto.randomUUID();
let server;
let httpResultRoute;
let originalControls;
const ownerToken = createPlainToken(), outsiderToken = createPlainToken();
const fixtureDefinitions = [
  { id: crypto.randomUUID(), kind: "image", path: path.join(fixtureDir, "fresh-dog.jpg"), mimeType: "image/jpeg", caption: "public dog" },
  { id: crypto.randomUUID(), kind: "image", path: path.join(fixtureDir, "fresh-camera.jpg"), mimeType: "image/jpeg", caption: "public camera" },
  { id: crypto.randomUUID(), kind: "video", path: path.join(fixtureDir, "public-flower.mp4"), mimeType: "video/mp4", caption: "public moving flower" },
];
const expectedHashes = [visualSuite.assets.find(asset => asset.id === "fresh-dog").sha256,
  visualSuite.assets.find(asset => asset.id === "fresh-camera").sha256,
  "0cd83d944a6ca7822b4a8306cecc60a36e859b041f6702c6a1ad9ead78924451"];
for (const [index, fixture] of fixtureDefinitions.entries()) {
  fixture.bytes = await fs.readFile(fixture.path);
  assert.equal(crypto.createHash("sha256").update(fixture.bytes).digest("hex"), expectedHashes[index],
    "Only the human-reviewed public fixture bytes may be sent to the model");
}
const originals = new Map();
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  const body = JSON.parse(options.body);
  const entry = { modelId: body.model, status: "dispatched", latencyMs: null, usage: null };
  report.providerCalls.push(entry);
  await checkpoint();
  const started = Date.now();
  try {
    const response = await nativeFetch(url, options);
    if (response.ok) {
      entry.status = "http-succeeded";
      const payload = await response.clone().json();
      entry.usage = payload.usage || null;
    } else entry.status = "failed-billing-unknown";
    return response;
  } catch (error) { entry.status = "failed-billing-unknown"; throw error; }
  finally { entry.latencyMs = Date.now() - started; await checkpoint(); }
};
const file = await fs.open(reportPath, "wx", 0o600); await file.close();
async function checkpoint() {
  const tmp = reportPath + "." + crypto.randomUUID() + ".tmp";
  const handle = await fs.open(tmp, "wx", 0o600);
  try { await handle.writeFile(JSON.stringify(report)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(tmp, reportPath);
}
const repository = createMediaRetrievalRepository({ query, withTransaction });
const provider = createMediaRetrievalProvider({ config });
report.queryParsingProvenance = provider.getQueryParsingProvenance();
report.providerConfiguration = provider.getIndexingProvenance();
report.rerank = { promptVersion: RERANK_PROMPT_VERSION, temperature: RERANK_TEMPERATURE,
  batchSize: MEDIA_RETRIEVAL_LIMITS.rerankBatchSize };
const assertAccess = async () => {
  const rows = await query("SELECT enabled, granted_scopes FROM user_agents WHERE user_id=? AND agent_id='album-manager'", [owner]);
  assert.equal(rows[0]?.enabled, true);
  assert.ok(rows[0].granted_scopes.includes("album:read"));
};
const media = {
  loadOwnedMediaBytes: async ({ asset }) => {
    assert.equal(asset.userId, owner);
    assert.ok(originals.has(asset.storageKey));
    return loadOwnedMediaBytes({ asset, fetchOssObject: async ({ objectKey }) => new Response(originals.get(objectKey)) });
  },
  normalizeImageForProvider, normalizeImageForReranking, extractRepresentativeFrames, extractVideoFramesAtTimestamps,
  createEphemeralProviderUrl: async ({ bytes, mimeType }) => ({
    url: "data:" + mimeType + ";base64," + bytes.toString("base64"), cleanup: async () => {},
  }),
};
const getRuntimeStatus = async () => ({ routeEligibility: { canRouteNewRun: true },
  publicAvailability: { state: "available", canStartRun: true, reasonCodes: [] } });
const service = createMediaRetrievalUserService({ repository, provider, getRuntimeStatus,
  resolveCandidateVisuals: createMediaRetrievalVisualResolver({ repository, media }) });
const access = createAlbumAssistantAccessService({ withTransaction, getRuntimeStatus });
try {
  assert.ok((await query("SELECT current_database() AS name"))[0].name.endsWith("_migration_test"));
  assert.equal(Number((await query("SELECT COUNT(*) AS count FROM users"))[0].count), 0,
    "Use a dedicated empty database, never a shared QA database");
  originalControls = (await query("SELECT lifecycle,agent_enabled,provider_calls_enabled,index_requests_enabled,user_daily_request_limit,user_monthly_budget_fen,global_daily_budget_fen,caption_reserve_fen,embedding_reserve_fen FROM media_retrieval_operator_controls WHERE id=TRUE"))[0];
  assert.ok(originalControls);
  await query("UPDATE media_retrieval_operator_controls SET agent_enabled=TRUE,provider_calls_enabled=TRUE,index_requests_enabled=TRUE,lifecycle='limited_release',user_daily_request_limit=NULL,user_monthly_budget_fen=NULL,global_daily_budget_fen=NULL,caption_reserve_fen=1,embedding_reserve_fen=1 WHERE id=TRUE");
  for (const userId of [owner, outsider]) await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'not-a-login-hash',?,?)",
    [userId, userId + "@example.invalid", "public fixture " + userId, String(crypto.randomInt(100000000000,999999999999))]);
  for (const userId of [owner, outsider]) await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?,?,'QA')",
    [userId, "public fixture " + userId]);
  await query("INSERT INTO station_albums(id,user_id,title) VALUES(?,?,'公开验收相册')", [albumId, owner]);
  for (const [index, definition] of fixtureDefinitions.entries()) {
    const bytes = definition.bytes;
    const storageKey = "public-test/" + definition.id;
    originals.set(storageKey, bytes);
    await query("INSERT INTO station_media_assets(id,user_id,kind,storage_provider,storage_key,caption,status,mime_type,byte_size,album_id) VALUES(?,?,?,'test',?,?,'uploaded',?,?,?)",
      [definition.id, owner, definition.kind, storageKey, definition.caption, definition.mimeType, bytes.length, index === 0 ? albumId : null]);
  }
  const agent = await getAgent("album-manager");
  await access({ userId: owner, agent, body: { enabled: true, albumAIConsentVersion: "media-retrieval-consent-v1" }, idempotencyKey: crypto.randomUUID() });
  report.passed.push("transactional-consent-agent-thread-and-index-queue");
  const workerId = "public-service-qa";
  for (let count = 0; count < 3; count += 1) {
    const job = await repository.claimNextMediaRetrievalJob({ workerId });
    assert.ok(job);
    const outcome = await processMediaRetrievalJob({ job, repository, provider, media, workerId });
    assert.equal(outcome.status, "succeeded", "every public source must index completely");
  }
  report.passed.push("real-image-and-moving-video-indexing");
  const key = crypto.randomUUID();
  const args = { userId: owner, query: "穿着灰色针织衫的黑色巴哥犬", kind: "image", albumId, idempotencyKey: key };
  const found = await service.searchMediaRetrieval(args);
  assert.deepEqual(found.results.map(item => item.mediaAssetId), [fixtureDefinitions[0].id]);
  const callsBeforeReplay = report.providerCalls.length;
  assert.deepEqual(await service.searchMediaRetrieval(args), found);
  assert.equal(report.providerCalls.length, callsBeforeReplay);
  assert.equal(await repository.getMediaRetrievalSearchResponse({ userId: outsider, agentRunId: found.agentRunId }), null);
  report.passed.push("owner-album-scope-and-idempotent-replay-no-model-redispatch");
  const video = await service.searchMediaRetrieval({ userId: owner, query: "绿叶间的红色花苞", kind: "video", idempotencyKey: crypto.randomUUID() });
  assert.equal(video.results[0].mediaAssetId, fixtureDefinitions[2].id);
  assert.ok(Number.isSafeInteger(video.results[0].matchedFrameTimestampMs));
  report.videoTimestampMs = video.results[0].matchedFrameTimestampMs;
  report.passed.push("exact-video-frame-original-read-and-visual-judging");
  const tools = createAlbumAssistantTools({ userId: owner, inputMessageId: crypto.randomUUID(), service, assertAccess,
    listAlbums: (userId, name) => query("SELECT id,title FROM station_albums WHERE user_id=? AND (?='' OR title ILIKE ?) ORDER BY created_at DESC LIMIT 51",
      [userId, name || "", "%" + (name || "") + "%"]) });
  const input = "帮我在公开验收相册找穿着灰色针织衫的黑色巴哥犬照片";
  await runAgent({ agentId: "album-manager", input, user: { id: owner, displayName: "公开验收" },
    messages: [{ senderType: "user", content: input }], tools });
  assert.equal(tools.metadata().outcome, "found");
  assert.equal(tools.metadata().retrievalRunIds.length, 1);
  report.passed.push("real-dialogue-model-list-album-search-tool-and-real-retrieval");
  const app = express(); app.use(express.json({ limit: "1mb" }));
  const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  const logger = { error: () => {} };
  registerMessageRoutes(app, { authenticate, asyncHandler, getOnlineUserIds: () => [],
    sendRealtimeToUser: () => {}, logger, retrievalRepository: repository, retrievalService: service });
  registerStationMediaRetrievalRoutes(app, { authenticate, asyncHandler, service });
  app.use(createRequestErrorHandler({ production: true, logger }));
  server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  for (const [id, token] of [[owner, ownerToken], [outsider, outsiderToken]]) {
    await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES(?,?,?,CURRENT_TIMESTAMP+INTERVAL '1 hour')", [crypto.randomUUID(), id, hashToken(token)]);
  }
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (route, { token = ownerToken, body, expected = 200 } = {}) => {
    const response = await nativeFetch(base + route, { method: body ? "POST" : "GET", headers: {
      Authorization: "Bearer " + token, "Content-Type": "application/json", "X-Miaoxun-Retrieval-Contract": "2",
    }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(180000) });
    const result = await response.json();
    report.httpStatus = response.status;
    report.httpErrorCode = typeof result.error?.code === "string" && /^[A-Z_a-z]{1,80}$/.test(result.error.code) ? result.error.code : null;
    assert.equal(response.status, expected); return result.data;
  };
  const thread = (await query("SELECT id FROM chat_threads WHERE user_id=? AND agent_id='album-manager'", [owner]))[0];
  const messageBody = { content: input, clientMessageId: crypto.randomUUID() };
  const messageRoute = "/api/threads/" + thread.id + "/messages";
  report.httpStage = "message-post";
  const conversation = await api(messageRoute, { body: messageBody, expected: 201 });
  report.httpStage = "agent-found";
  const agentMessage = conversation.messages.find(message => message.senderType === "agent");
  assert.equal(agentMessage.metadata.albumAssistant.outcome, "found");
  httpResultRoute = messageRoute + "/" + agentMessage.id + "/media-results";
  report.httpStage = "result-read";
  const actualResults = await api(httpResultRoute);
  assert.deepEqual(actualResults.map(item => item.mediaAssetId), [fixtureDefinitions[0].id]);
  const beforeHttpReplay = report.providerCalls.length;
  report.httpStage = "message-replay";
  const replay = await api(messageRoute, { body: messageBody, expected: 200 });
  assert.equal(replay.messages.find(message => message.senderType === "agent").id, agentMessage.id);
  assert.equal(report.providerCalls.length, beforeHttpReplay);
  report.httpStage = "cross-owner-read";
  await api(httpResultRoute, { token: outsiderToken, expected: 404 });
  await api("/api/station/media-retrieval/status", { token: "", expected: 401 });
  report.passed.push("authenticated-chat-HTTP-result-read-replay-and-cross-owner-denial");
  const empty = await service.searchMediaRetrieval({ userId: owner, query: "a passenger airplane above clouds", idempotencyKey: crypto.randomUUID() });
  assert.deepEqual(empty.results, []);
  report.passed.push("unrelated-query-empty-without-fabricated-result");
  await access({ userId: owner, agent, body: { enabled: false }, idempotencyKey: crypto.randomUUID() });
  const beforeRevokedSearch = report.providerCalls.length;
  await assert.rejects(service.searchMediaRetrieval({ userId: owner, query: "a black pug", idempotencyKey: crypto.randomUUID() }),
    error => error.code === "retrieval_consent_required");
  report.passed.push("revocation-stops-new-model-dispatch");
  assert.equal(report.providerCalls.length, beforeRevokedSearch);
  await api(httpResultRoute, { expected: 403 });
  report.passed.push("revoked-chat-result-HTTP-denial");
  report.ledger = await query("SELECT operation,disposition,COUNT(*)::int AS count FROM media_retrieval_cost_ledger WHERE user_id=? GROUP BY operation,disposition ORDER BY operation,disposition", [owner]);
} catch (error) {
  report.failure = { name: error.name, code: error.code || null, stagePassedCount: report.passed.length,
    errorMessage: error.name === "AssertionError" ? "E2E assertion failed" : "E2E stage failed",
    assertionActual: typeof error.actual === "number" || ["found", "empty", "error"].includes(error.actual) ? error.actual : null,
    assertionExpected: typeof error.expected === "number" || ["found", "empty", "error"].includes(error.expected) ? error.expected : null };
  process.exitCode = 2;
} finally {
  if (server) await new Promise(resolve => server.close(resolve));
  report.ledger = await query("SELECT operation,disposition,COUNT(*)::int AS count FROM media_retrieval_cost_ledger WHERE user_id=? GROUP BY operation,disposition ORDER BY operation,disposition", [owner]);
  await query("DELETE FROM agent_runs WHERE user_id IN (?,?)", [owner, outsider]);
  await query("DELETE FROM users WHERE id IN (?,?)", [owner, outsider]);
  if (originalControls) await query("UPDATE media_retrieval_operator_controls SET lifecycle=?,agent_enabled=?,provider_calls_enabled=?,index_requests_enabled=?,user_daily_request_limit=?,user_monthly_budget_fen=?,global_daily_budget_fen=?,caption_reserve_fen=?,embedding_reserve_fen=? WHERE id=TRUE",
    [originalControls.lifecycle,originalControls.agent_enabled,originalControls.provider_calls_enabled,originalControls.index_requests_enabled,
      originalControls.user_daily_request_limit,originalControls.user_monthly_budget_fen,originalControls.global_daily_budget_fen,
      originalControls.caption_reserve_fen,originalControls.embedding_reserve_fen]);
  const residue = await query("SELECT (SELECT COUNT(*) FROM users WHERE id IN (?,?))::int AS users,(SELECT COUNT(*) FROM station_media_assets WHERE user_id IN (?,?))::int AS assets,(SELECT COUNT(*) FROM media_retrieval_segments WHERE user_id IN (?,?))::int AS segments",
    [owner, outsider, owner, outsider, owner, outsider]);
  report.residue = residue[0];
  await checkpoint();
  await closeDatabase();
}
console.log(JSON.stringify({ passed: report.passed, failure: report.failure, calls: report.providerCalls.length, residue: report.residue }));
