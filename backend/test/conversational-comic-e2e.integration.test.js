import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after } from "node:test";
import express from "express";
import sharp from "sharp";
import { query, withTransaction, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { getAgent } from "../../agents/registry.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { registerChatContentPreviewRoutes } from "../src/routes/chat-content-preview-routes.js";
import { createChatContentPreviewService } from "../src/chat-content-preview-service.js";
import { registerStationComicRoutes } from "../src/routes/station-comic-routes.js";
import { registerStationPostRoutes } from "../src/routes/station-post-routes.js";
import { registerStationMediaRoutes } from "../src/routes/station-media-routes.js";
import { createComicRenderRepository } from "../src/comic-render-repository.js";
import { createComicRenderStorage } from "../src/comic-render-storage.js";
import { createComicRenderExecutor } from "../src/comic-render-executor.js";
import { createAITaskRepository } from "../src/ai-task-repository.js";
import { createAITaskRunner } from "../src/ai-task-runner.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

// Explicit fixture model and object storage; no supplier/cloud credentials or
// outbound requests. All HTTP auth, ownership, transactions and worker code run.
const enabled = process.env.RUN_CONVERSATIONAL_COMIC_INTEGRATION === "1";
const integration = (name, run) => test(name, {
  skip: !enabled && "Requires RUN_CONVERSATIONAL_COMIC_INTEGRATION=1 and migrated disposable loopback *_migration_test database",
}, run);
const owners = [], publications = [], objects = new Map();
const headers = {
  "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6",
  "X-Miaoxun-Chat-Content": "1", "X-Miaoxun-Comic-Render": "1",
};
let server, origin, decision, textCalls = 0, imageCalls = 0, imageBytes;
const repository = createComicRenderRepository();
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const fixtureRuntime = async options => {
  await options.beforeModelCall();
  textCalls++;
  return { reply: JSON.stringify(decision), provider: "fixture-conversational-comic",
    latencyMs: 1, tokenUsage: { prompt: 2, completion: 3, total: 5 } };
};
const fetchObject = async ({ objectKey }) => {
  const object = objects.get(objectKey);
  assert.ok(object, "Fixture object must be stored before it is readable");
  return new Response(object.body, { headers: { "content-type": object.contentType, "content-length": String(object.body.length) } });
};

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname));
  assert.match(url.pathname, /_migration_test$/);
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  imageBytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: "#507a9d" } }).png().toBuffer();
  const app = express(); app.use(express.json());
  registerMessageRoutes(app, { authenticate, asyncHandler, getOnlineUserIds: () => [],
    sendRealtimeToUser() {}, runAgentRuntime: fixtureRuntime });
  registerChatContentPreviewRoutes(app, { authenticate, asyncHandler,
    service: createChatContentPreviewService({ assertReady: async () => {} }) });
  registerStationComicRoutes(app, { authenticate, asyncHandler });
  registerStationPostRoutes(app, { authenticate, asyncHandler });
  registerStationMediaRoutes(app, { authenticate, asyncHandler, fetchMediaObject: fetchObject });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (!enabled) return;
  if (server) await new Promise(resolve => server.close(resolve));
  await cleanupPublishedAgentConsent({ userIds: owners });
  await query("DELETE FROM station_post_media WHERE post_id IN (SELECT id FROM station_posts WHERE user_id=ANY(?::text[]))", [owners]);
  await query("DELETE FROM users WHERE id=ANY(?::text[])", [owners]);
  await query("DELETE FROM comic_render_cleanup_journal WHERE user_id=ANY(?::text[])", [owners]);
  for (const publication of publications.reverse()) await publication.cleanup();
  await closeDatabase();
});

async function owner() {
  const userId = crypto.randomUUID(), threadId = crypto.randomUUID(), token = crypto.randomBytes(32).toString("hex");
  const agent = await getAgent("comic-diary"); owners.push(userId);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'fixture-only',?,?)",
    [userId, `${userId}@example.invalid`, `Comic ${userId}`, String(crypto.randomInt(100000000000, 999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,'Comic fixture','C')", [userId]);
  await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES (?,'comic-diary',true,?::jsonb)", [userId, JSON.stringify(agent.permissions)]);
  await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES (?,?,'Comic fixture','comic-diary','agent')", [threadId, userId]);
  await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,clock_timestamp()+INTERVAL '1 hour')", [crypto.randomUUID(), userId, hashToken(token)]);
  publications.push(await seedPublishedAgentConsent({ userId, agentKeys: ["comic-diary"] }));
  return { userId, threadId, token };
}
async function api(path, { owner: actor, method = "GET", body, expected = 200, extraHeaders = {}, binary = false } = {}) {
  const response = await fetch(`${origin}${path}`, { method, headers: { ...headers,
    ...(actor ? { Authorization: `Bearer ${actor.token}` } : {}),
    ...(body ? { "content-type": "application/json" } : {}), ...extraHeaders },
  ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
  if (expected === 204) { assert.equal(response.status, 204); return null; }
  const payload = binary && response.ok ? Buffer.from(await response.arrayBuffer()) : await response.json();
  assert.equal(response.status, expected, JSON.stringify(payload));
  return binary ? { bytes: payload, headers: response.headers } : payload.data;
}
const messagesPath = f => `/api/threads/${f.threadId}/messages`;
const confirm = (f, p, key = crypto.randomUUID()) => api(`/api/chat-content-previews/${p.id}/confirm`, {
  owner: f, method: "POST", body: { revision: p.revision, snapshotHash: p.snapshotHash, idempotencyKey: key },
});
function comicProposal(mediaAssetIds = []) {
  return { type: "content_preview", kind: "comic", reply: "故事已整理好，确认后生成四张画面。",
    snapshot: { title: "纸船", summary: "小猫修好纸船，和小狗一起放船。", style: "slice-of-life", frameCount: 4,
      frames: Array.from({ length: 4 }, (_, index) => ({ index: index + 1, title: `第${index + 1}格`, scene: `雨后的小溪，第${index + 1}个场景`,
        caption: "一起放纸船", dialogue: "出发吧", mood: "温暖", camera: "中景", mediaAssetIds })) } };
}
async function propose(f, proposal, refs = []) {
  decision = proposal;
  const input = { content: "请按讨论的故事生成四格漫画，选中的图片作为角色参考。", clientMessageId: crypto.randomUUID(), contextRefs: refs };
  const sent = await api(messagesPath(f), { owner: f, method: "POST", body: input, expected: 201 });
  const output = sent.messages.at(-1);
  assert.equal(output.metadata.contentPreview.version, 1);
  assert.deepEqual(Object.keys(output.metadata.contentPreview).sort(), ["id", "version"]);
  const preview = await api(`/api/chat-content-previews/${output.metadata.contentPreview.id}`, { owner: f });
  return { input, output, preview };
}
async function runWorker(onImage) {
  const storage = createComicRenderStorage({ bucket: "fixture-conversational-comic", query, transaction: withTransaction,
    putObject: async ({ objectKey, body, contentType }) => objects.set(objectKey, { body, contentType }),
    inspectObject: async ({ objectKey }) => ({ contentType: objects.get(objectKey).contentType, contentLength: objects.get(objectKey).body.length }),
    deleteObject: async ({ objectKey }) => objects.delete(objectKey), fetchObject,
    bindAsset: repository.bindComicFrameAssetInTransaction });
  const provider = { generateFrame: async args => {
    imageCalls++;
    await onImage?.(args);
    return { bytes: imageBytes, mimeType: "image/png", providerRequestId: `fixture-${imageCalls}`, model: "fixture-only", usage: null };
  } };
  const logs = [];
  const runner = createAITaskRunner({ repository: createAITaskRepository(),
    executors: { comic_render: createComicRenderExecutor({ repository, storage, provider }) },
    logger: { error: line => logs.push(line) } });
  assert.equal(await runner.runOnce(), true);
  assert.deepEqual(logs, []);
  assert.equal(await runner.runOnce(), false, "A completed or interrupted request is never automatically dispatched twice");
}

integration("chat proposal → one confirmation → four private frames → owner detail → one recoverable post", async () => {
  const f = await owner(), outsider = await owner();
  const sourceId = crypto.randomUUID(), sourceKey = `fixture/${sourceId}`;
  objects.set(sourceKey, { body: imageBytes, contentType: "image/png" });
  await query(`INSERT INTO station_media_assets(id,user_id,kind,status,original_filename,caption,mime_type,byte_size,storage_provider,storage_key)
    VALUES (?,?,'image','uploaded','角色参考.png','按用户描述使用参考图','image/png',?,'oss',?)`, [sourceId, f.userId, imageBytes.length, sourceKey]);
  const beforeCalls = textCalls;
  const { input, preview } = await propose(f, comicProposal([sourceId]), [{ kind: "station-photo", id: sourceId }]);
  assert.equal(preview.status, "pending");
  assert.equal((await query("SELECT id FROM station_diary_entries WHERE user_id=?", [f.userId])).length, 0);
  assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id=?", [f.userId])).length, 0);
  const replay = await api(messagesPath(f), { owner: f, method: "POST", body: input });
  assert.equal(replay.messages.at(-1).metadata.contentPreview.id, preview.id);
  assert.equal(textCalls - beforeCalls, 1);
  await api(`/api/chat-content-previews/${preview.id}`, { owner: outsider, expected: 404 });
  await api(`/api/chat-content-previews/${preview.id}`, { expected: 401 });
  const [first, second] = await Promise.all([confirm(f, preview), confirm(f, preview)]);
  assert.equal(first.status, "confirmed"); assert.deepEqual(first.result, second.result);
  assert.equal(textCalls - beforeCalls, 1, "Confirmation must not call the text model again");
  assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id=? AND kind='comic_render'", [f.userId])).length, 1);
  assert.equal((await query("SELECT id FROM station_diary_entries WHERE user_id=?", [f.userId])).length, 0, "A comic is independent of a diary");
  const beforeImages = imageCalls;
  await runWorker(args => {
    assert.equal(args.selectedImages.length, 1);
    assert.equal(args.selectedImages[0].id, sourceId);
    assert.ok(args.selectedImages[0].bytes.length > 0, "Image provider receives actual reference bytes");
  });
  assert.equal(imageCalls - beforeImages, 4);
  const detail = await api(`/api/station/comic-diaries/${first.result.comicDiaryId}`, { owner: f });
  assert.equal(detail.comicDiary.id, first.result.comicDiaryId);
  const task = detail.tasks.find(item => item.id === first.result.comicRenderTaskId);
  assert.equal(task.status, "succeeded"); assert.deepEqual(task.frames.map(frame => frame.frameIndex), [1, 2, 3, 4]);
  const ids = task.frames.map(frame => frame.mediaAssetId);
  for (const id of ids) {
    const filePath = `/api/station/media-assets/${id}/file`;
    await api(filePath, { owner: outsider, expected: 404 });
    await api(filePath, { expected: 401 });
    const file = await api(filePath, { owner: f, binary: true });
    assert.equal((await sharp(file.bytes).metadata()).format, "webp");
    assert.equal(file.headers.get("cache-control"), "private, no-store");
    assert.equal(file.headers.get("vary"), "Authorization");
  }
  const clientRequestId = crypto.randomUUID();
  const postBody = { clientRequestId, body: "雨后一起放纸船", visibility: "private", mediaAssetIds: ids };
  const posted = await api("/api/station/posts", { owner: f, method: "POST", body: postBody, expected: 201 });
  const postedAgain = await api("/api/station/posts", { owner: f, method: "POST", body: postBody, expected: 201 });
  assert.equal(postedAgain.id, posted.id);
  const receipt = await api(`/api/station/post-submissions/${clientRequestId}`, { owner: f });
  assert.equal(receipt.status, "submitted"); assert.equal(receipt.post.id, posted.id);
  assert.equal(receipt.post.visibility, "private"); assert.deepEqual(receipt.post.media.map(item => item.id), ids);
  assert.equal((await query("SELECT id FROM station_posts WHERE user_id=?", [f.userId])).length, 1);
  assert.deepEqual(await api(`/api/station/post-submissions/${clientRequestId}`, { owner: outsider }), { status: "not_submitted" });
  // Source recall and revoked execution permission cannot erase an owned work.
  await api(`${messagesPath(f)}/${preview.inputMessageId}`, { owner: f, method: "DELETE" });
  await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='comic-diary'", [f.userId]);
  const retained = await api(`/api/station/comic-diaries/${first.result.comicDiaryId}`, { owner: f });
  assert.equal(retained.tasks[0].frames.filter(frame => frame.mediaAssetId).length, 4);
  const restored = await confirm(f, preview);
  assert.deepEqual(restored.result, first.result, "Accepted confirmation replay survives expiry and revoked execution access");
});

integration("diary confirmation saves only the confirmed text, without a comic or image task", async () => {
  const f = await owner(); const callsBefore = textCalls, imagesBefore = imageCalls;
  const snapshot = { title: "雨后的纸船", body: "今天和朋友一起修好了纸船，放进雨后的小溪。", mood: "开心" };
  const { preview } = await propose(f, { type: "content_preview", kind: "diary", reply: "日记草稿已整理，请确认保存。", snapshot });
  const saved = await confirm(f, preview); const replay = await confirm(f, preview);
  assert.deepEqual(saved.result, replay.result);
  const [entry] = await query("SELECT title,body,mood,source FROM station_diary_entries WHERE id=? AND user_id=?", [saved.result.diaryEntryId, f.userId]);
  assert.deepEqual(entry, { ...snapshot, source: "agent" });
  assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id=?", [f.userId])).length, 0);
  assert.equal((await query("SELECT id FROM station_comic_diaries WHERE user_id=?", [f.userId])).length, 0);
  assert.equal(textCalls - callsBefore, 1); assert.equal(imageCalls, imagesBefore);
});

integration("uncertain image response stops later frames and read recovery never dispatches again", async () => {
  const f = await owner();
  const { preview } = await propose(f, comicProposal());
  const confirmed = await confirm(f, preview);
  const beforeImages = imageCalls;
  await runWorker(() => { throw new TypeError('Explicit fixture connection closed after dispatch'); });
  assert.equal(imageCalls - beforeImages, 1);
  const detail = await api(`/api/station/comic-diaries/${confirmed.result.comicDiaryId}`, { owner: f });
  const task = detail.tasks.find(item => item.id === confirmed.result.comicRenderTaskId);
  assert.equal(task.status, 'interrupted');
  assert.deepEqual(task.frames.map(frame => frame.status), ['unknown', 'skipped', 'skipped', 'skipped']);
  await api(`/api/chat-content-previews/${preview.id}`, { owner: f });
  await confirm(f, preview);
  assert.equal(imageCalls - beforeImages, 1, 'Refreshing or replaying confirmation must not rerun unknown work');
  assert.equal((await query("SELECT id FROM ai_tasks WHERE user_id=?", [f.userId])).length, 1);
});

integration("ordinary discussion and clarification remain chat messages without creative side effects", async () => {
  const f = await owner();
  for (const answer of [{ type: 'reply', reply: '可以先讨论故事发生在哪里。' }, { type: 'clarify', question: '希望故事的主角是谁？' }]) {
    decision = answer;
    const sent = await api(messagesPath(f), { owner: f, method: 'POST', expected: 201,
      body: { content: '先讨论一下雨后小溪的故事', clientMessageId: crypto.randomUUID() } });
    assert.equal(sent.messages.at(-1).metadata.contentPreview, undefined);
    assert.equal(sent.messages.at(-1).content, answer.reply || answer.question);
  }
  assert.equal((await query('SELECT id FROM chat_content_previews WHERE user_id=?', [f.userId])).length, 0);
  assert.equal((await query('SELECT id FROM ai_tasks WHERE user_id=?', [f.userId])).length, 0);
  assert.equal((await query('SELECT id FROM station_diary_entries WHERE user_id=?', [f.userId])).length, 0);
});
