import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, after, beforeEach } from "node:test";
import express from "express";
import { query, closeDatabase } from "../src/db.js";
import { authenticate, hashToken } from "../src/auth.js";
import { registerMessageRoutes } from "../src/routes/message-routes.js";
import { registerUIPreferenceRoutes } from "../src/routes/ui-preference-routes.js";
import { registerAppRoutes } from "../src/routes/app-routes.js";
import { createUIPreferenceService } from "../src/ui-preference-service.js";
import { HttpError } from "../src/http-error.js";
import { createAgentReleaseRepository } from "../src/agent-release-repository.js";
import { createProductCatalogRepository } from "../src/product-catalog-repository.js";
import { recordDiscardedUIAgentMessageReceipt } from "../src/message-repository.js";
import { readAppUIPreferences } from "../src/ui-preferences-app-store.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

const enabled = process.env.RUN_AI_TASK_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "Requires migrated disposable PostgreSQL", timeout: 15000 }, work);
const owner = crypto.randomUUID();
const token = crypto.randomBytes(32).toString("hex");
const threadId = crypto.randomUUID();
let server;
let origin;
let fixture;
let calls = [];
let beforeResponse = async () => {};
let modelReply;
let modelFailure;
const modelReceipt = { provider: "isolated-contract-fixture", latencyMs: 2,
  tokenUsage: { prompt: 12, completion: 8, total: 20 } };
const releaseRepository = createAgentReleaseRepository();
const productRepository = createProductCatalogRepository();

before(async () => {
  if (!enabled) return;
  assert.equal(new URL(process.env.DATABASE_URL).hostname, "127.0.0.1");
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES (?,?,'test-only','UI chat fixture',?)",
    [owner, `${owner}@example.invalid`, String(crypto.randomInt(100000000000, 999999999999))]);
  await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES (?,'UI chat fixture','T')", [owner]);
  await query("INSERT INTO auth_sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,clock_timestamp() + INTERVAL '1 hour')",
    [crypto.randomUUID(), owner, hashToken(token)]);
  await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES (?,?,'UI Agent','ui-agent','agent')", [threadId, owner]);
  fixture = await seedPublishedAgentConsent({ userId: owner, agentKeys: ["ui-agent"] });
  const run = async options => {
    calls.push(options);
    await options.beforeModelCall?.();
    assert.equal(options.agentId, "ui-agent");
    assert.equal(options.mode, "plan");
    await beforeResponse();
    await options.afterModelCall?.(modelReceipt);
    if (modelFailure) throw modelFailure;
    return { reply: modelReply, ...modelReceipt };
  };
  const service = createUIPreferenceService({ run });
  const app = express();
  app.use(express.json());
  const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  registerMessageRoutes(app, { authenticate, asyncHandler, getOnlineUserIds: () => [], sendRealtimeToUser() {},
    logger: { error() {} }, runAgentRuntime: async () => { throw new Error("UI Agent must not use specialist dispatch or ordinary chat"); },
    uiPreferences: service });
  registerUIPreferenceRoutes(app, { authenticate, asyncHandler, service });
  registerAppRoutes(app, { authenticate, asyncHandler, getOnlineUserIds: () => [] });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  await new Promise(resolve => { server = app.listen(0, "127.0.0.1", resolve); });
  origin = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  if (!enabled) return;
  calls = [];
  modelFailure = null;
  beforeResponse = async () => {};
  modelReply = JSON.stringify({ schemaVersion: 1, intent: "调整妙页圆角", rationale: "按用户要求调整卡片圆角。",
    affectedSurfaces: ["miao"], patch: { surfaces: { miao: { cardRadius: 20 } } } });
  await query("DELETE FROM ui_preference_previews WHERE user_id = ?", [owner]);
  await query("DELETE FROM chat_messages WHERE user_id = ?", [owner]);
  await query("UPDATE user_profiles SET station_config = '{}'::jsonb WHERE user_id = ?", [owner]);
  const publication = fixture.publications[0];
  await releaseRepository.transition({ releaseId: publication.releaseId, toStatus: "published", actorUserId: owner });
  const product = await productRepository.transitionProduct({ productId: publication.productId,
    productVersionId: publication.productVersionId, toStatus: "published", actorUserId: owner });
  await productRepository.createEntitlement({ userId: owner, productId: publication.productId,
    productVersionId: publication.productVersionId, grantedScopes: product.dependencies.flatMap(item => item.scopes),
    consentVersion: "explicit-integration-test-consent-v1", idempotencyKey: `ui-chat-consent-${crypto.randomUUID()}` });
});

after(async () => {
  if (!enabled) return;
  if (server) await new Promise(resolve => server.close(resolve));
  await cleanupPublishedAgentConsent({ userIds: [owner] });
  await query("DELETE FROM users WHERE id = ?", [owner]);
  await fixture?.cleanup();
  await closeDatabase();
});

async function request(path, body, headers = {}) {
  const response = await fetch(`${origin}${path}`, { method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "X-Miaoxun-AI-Contract": "1",
      "X-Miaoxun-Agent-Workspace": "6", "X-Miaoxun-UI-Preferences": "1", ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: response.status, ...await response.json() };
}
const send = (body, headers) => request(`/api/threads/${threadId}/messages`,
  { content: "把妙页卡片圆角改为20", clientMessageId: crypto.randomUUID(), ...body }, headers);

async function assertKnownFailedReceipt(inputMessageId) {
  const [audit] = await query(`SELECT status,provider,token_prompt,token_completion,token_total
    FROM agent_runs WHERE input_message_id = ?`, [inputMessageId]);
  assert.deepEqual(audit, { status: "error", provider: modelReceipt.provider,
    token_prompt: 12, token_completion: 8, token_total: 20 });
}

integration("UI Agent conversation creates a real protected preview, never applies it, and replays without another model call", async () => {
  const clientMessageId = crypto.randomUUID();
  const first = await send({ clientMessageId });
  assert.equal(first.status, 201, JSON.stringify(first));
  const output = first.data.messages.at(-1);
  assert.equal(output.content, "请先查看界面调整预览，确认后才会应用。");
  assert.ok(output.metadata.uiPreferencePreview.id);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, "把妙页卡片圆角改为20");
  assert.equal((await readAppUIPreferences(owner)).revision, 0);
  const preview = await request(`/api/ui/preferences/previews/${output.metadata.uiPreferencePreview.id}`);
  assert.equal(preview.status, 200);
  assert.equal(preview.data.preferences.surfaces.miao.cardRadius, 20);
  assert.equal(preview.data.status, "pending");
  const replay = await send({ clientMessageId });
  assert.equal(replay.status, 200);
  assert.equal(replay.data.messages.at(-1).id, output.id);
  assert.equal(calls.length, 1);
  const [audit] = await query("SELECT provider,token_prompt,token_completion,token_total FROM agent_runs WHERE input_message_id = ?", [first.data.messages[0].id]);
  assert.deepEqual(audit, { provider: "isolated-contract-fixture", token_prompt: 12, token_completion: 8, token_total: 20 });
  const confirmed = await request("/api/ui/preferences/confirm", { previewId: preview.data.id, baseRevision: 0 });
  assert.equal(confirmed.status, 200);
  assert.equal((await readAppUIPreferences(owner)).revision, 1);
});

integration("UI Agent rejects old clients and unsupported input before storing a message or invoking a model", async () => {
  const old = await send({}, { "X-Miaoxun-UI-Preferences": "0" });
  assert.equal(old.status, 426);
  const attached = await send({ attachmentIds: [crypto.randomUUID()] });
  assert.equal(attached.status, 400);
  const long = await send({ content: "界".repeat(1201) });
  assert.equal(long.status, 422);
  assert.equal(calls.length, 0);
  assert.deepEqual(await query("SELECT id FROM chat_messages WHERE user_id = ?", [owner]), []);
});

integration("an in-flight UI Agent message retry cannot dispatch a second preview", async () => {
  let started;
  let release;
  const entered = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { release = resolve; });
  beforeResponse = async () => { started(); await pending; };
  const clientMessageId = crypto.randomUUID();
  const first = send({ clientMessageId });
  await entered;
  try {
    const duplicate = await send({ clientMessageId });
    assert.equal(duplicate.status, 409);
    assert.equal(calls.length, 1);
  } finally { release(); }
  assert.equal((await first).status, 201);
  assert.equal((await query("SELECT id FROM ui_preference_previews WHERE user_id = ?", [owner])).length, 1);
});

integration("a UI preference revision changed during the response creates no stale chat preview", async () => {
  beforeResponse = async () => query("UPDATE user_profiles SET station_config = '{\"uiPreferences\":{\"schemaVersion\":1,\"revision\":1}}'::jsonb WHERE user_id = ?", [owner]);
  const response = await send();
  assert.equal(response.status, 201);
  assert.match(response.data.messages.at(-1).content, /界面偏好已发生变化/);
  assert.equal(response.data.messages.at(-1).metadata.uiPreferencePreview, undefined);
  assert.deepEqual(await query("SELECT id FROM ui_preference_previews WHERE user_id = ?", [owner]), []);
  await assertKnownFailedReceipt(response.data.messages[0].id);
});

integration("UI Agent does not deliver a preview when authorization is withdrawn during the model response", async () => {
  beforeResponse = async () => productRepository.disableEntitlement({ userId: owner,
    productId: fixture.publications[0].productId, productVersionId: fixture.publications[0].productVersionId,
    idempotencyKey: `ui-chat-revoke-${crypto.randomUUID()}` });
  const response = await send();
  assert.equal(response.status, 201);
  assert.equal(response.data.messages.at(-1).metadata.uiPreferencePreview, undefined);
  assert.deepEqual(await query("SELECT id FROM ui_preference_previews WHERE user_id = ?", [owner]), []);
  assert.equal((await readAppUIPreferences(owner)).revision, 0);
  await assertKnownFailedReceipt(response.data.messages[0].id);
});

integration("UI Agent rejects malformed model patches with an explicit message instead of emitting JSON to chat", async () => {
  modelReply = JSON.stringify({ schemaVersion: 1, intent: "运行代码", rationale: "无效建议", affectedSurfaces: ["miao"], patch: { javascript: "run()" } });
  const result = await send();
  assert.equal(result.status, 201);
  assert.match(result.data.messages.at(-1).content, /界面调整建议无效/);
  assert.equal(result.data.messages.at(-1).metadata.uiPreferencePreview, undefined);
  assert.deepEqual(await query("SELECT id FROM ui_preference_previews WHERE user_id = ?", [owner]), []);
  await assertKnownFailedReceipt(result.data.messages[0].id);
  assert.equal(JSON.stringify(result).includes("run()"), false);
  const [stored] = await query("SELECT COUNT(*)::int AS count FROM chat_messages WHERE user_id = ? AND content LIKE '%run()%'", [owner]);
  assert.equal(stored.count, 0);
});

integration("a received but unusable UI completion retains known provider usage without a preview", async () => {
  modelFailure = new HttpError(502, "Incomplete fixture completion", { code: "AI_MODEL_INCOMPLETE" });
  const response = await send();
  assert.equal(response.status, 201);
  assert.deepEqual(await query("SELECT id FROM ui_preference_previews WHERE user_id = ?", [owner]), []);
  await assertKnownFailedReceipt(response.data.messages[0].id);
});

for (const field of ["recalled_at", "deleted_at"]) {
  integration(`UI Agent discards a response when its original input becomes ${field} and audits known usage without an output`, async () => {
    let inputId;
    beforeResponse = async () => {
      const [input] = await query("SELECT id FROM chat_messages WHERE user_id = ? AND sender_type = 'user'", [owner]);
      inputId = input.id;
      await query(`UPDATE chat_messages SET ${field} = clock_timestamp() WHERE id = ?`, [inputId]);
    };
    const response = await send();
    assert.equal(response.status, 404);
    assert.deepEqual(await query("SELECT id FROM ui_preference_previews WHERE user_id = ?", [owner]), []);
    assert.deepEqual(await query("SELECT id FROM chat_messages WHERE user_id = ? AND sender_type = 'agent'", [owner]), []);
    assert.equal((await readAppUIPreferences(owner)).revision, 0);
    await assertKnownFailedReceipt(inputId);
    const [audit] = await query("SELECT output_message_id FROM agent_runs WHERE input_message_id = ?", [inputId]);
    assert.equal(audit.output_message_id, null);
    assert.equal(await recordDiscardedUIAgentMessageReceipt({ userId: owner, threadId,
      inputMessageId: inputId, receipt: modelReceipt, latencyMs: 2 }), false);
    const [count] = await query("SELECT COUNT(*)::int AS count FROM agent_runs WHERE input_message_id = ?", [inputId]);
    assert.equal(count.count, 1);
  });
}

for (const changed of ["product pause", "release unpublish"]) {
  integration(`UI Agent does not deliver a preview after in-flight ${changed} and retains known usage`, async () => {
    beforeResponse = async () => changed === "product pause"
      ? productRepository.transitionProduct({ productId: fixture.publications[0].productId,
        productVersionId: fixture.publications[0].productVersionId, toStatus: "paused", actorUserId: owner })
      : releaseRepository.transition({ releaseId: fixture.publications[0].releaseId, toStatus: "unpublished", actorUserId: owner });
    const response = await send();
    assert.equal(response.status, 201);
    assert.equal(response.data.messages.at(-1).metadata.uiPreferencePreview, undefined);
    assert.deepEqual(await query("SELECT id FROM ui_preference_previews WHERE user_id = ?", [owner]), []);
    assert.equal((await readAppUIPreferences(owner)).revision, 0);
    await assertKnownFailedReceipt(response.data.messages[0].id);
  });
}

integration("a recalled UI Agent request invalidates its protected preview", async () => {
  const result = await send();
  assert.equal(result.status, 201);
  const id = result.data.messages.at(-1).metadata.uiPreferencePreview.id;
  await query("UPDATE chat_messages SET recalled_at = CURRENT_TIMESTAMP WHERE id = ?", [result.data.messages[0].id]);
  assert.equal((await request(`/api/ui/preferences/previews/${id}`)).status, 404);
  assert.equal((await request("/api/ui/preferences/confirm", { previewId: id, baseRevision: 0 })).status, 404);
  assert.equal((await readAppUIPreferences(owner)).revision, 0);
});

// The model transport is an explicit contract fixture; authorization, HTTP,
// persistence, bootstrap and rollback below use the actual implementations.
async function previewAndConfirm(radius, baseRevision) {
  modelReply = JSON.stringify({ schemaVersion: 1, intent: "调整妙页圆角", rationale: "合同测试调整。",
    affectedSurfaces: ["miao"], patch: { surfaces: { miao: { cardRadius: radius } } } });
  const preview = await request("/api/ui/preferences/preview", { instruction: `妙页圆角${radius}`, surface: "miao" });
  assert.equal(preview.status, 201, JSON.stringify(preview));
  assert.equal((await readAppUIPreferences(owner)).revision, baseRevision);
  const confirmed = await request("/api/ui/preferences/confirm", { previewId: preview.data.id, baseRevision });
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed));
  return preview.data;
}

integration("UI confirmation survives fresh bootstrap and undo restores the persisted baseline only once", async () => {
  const initial = (await request("/api/app/bootstrap")).data.profile.stationConfig.uiPreferences;
  const preview = await previewAndConfirm(20, 0);
  const fresh = (await request("/api/app/bootstrap")).data.profile.stationConfig.uiPreferences;
  assert.equal(fresh.revision, 1);
  assert.equal(fresh.surfaces.miao.cardRadius, 20);
  assert.equal((await request("/api/ui/preferences/confirm", { previewId: preview.id, baseRevision: 0 })).status, 409);
  const undone = await request("/api/ui/preferences/undo", { baseRevision: 1 });
  assert.equal(undone.status, 200, JSON.stringify(undone));
  const afterUndo = (await request("/api/app/bootstrap")).data.profile.stationConfig.uiPreferences;
  assert.deepEqual(afterUndo, { ...initial, revision: 2 });
  assert.equal((await request(`/api/ui/preferences/previews/${preview.id}`)).data.status, "undone");
  const repeated = await request("/api/ui/preferences/undo", { baseRevision: 2 });
  assert.equal(repeated.status, 409);
  assert.equal(repeated.error.details.code, "UI_PREFERENCE_UNDO_UNAVAILABLE");
  assert.equal(calls.length, 1);
});

integration("restoring defaults closes the old undo history instead of reviving superseded settings", async () => {
  const initial = (await readAppUIPreferences(owner));
  const first = await previewAndConfirm(20, 0);
  const second = await previewAndConfirm(24, 1);
  const reset = await request("/api/ui/preferences/reset", { baseRevision: 2 });
  assert.equal(reset.status, 200, JSON.stringify(reset));
  assert.deepEqual(reset.data.preferences, { ...initial, revision: 3 });
  const undo = await request("/api/ui/preferences/undo", { baseRevision: 3 });
  assert.equal(undo.status, 409, JSON.stringify(undo));
  assert.equal(undo.error.details.code, "UI_PREFERENCE_UNDO_UNAVAILABLE");
  for (const preview of [first, second])
    assert.equal((await request(`/api/ui/preferences/previews/${preview.id}`)).data.status, "reset");
  assert.deepEqual(await readAppUIPreferences(owner), { ...initial, revision: 3 });
  await previewAndConfirm(22, 3);
  assert.equal((await request("/api/ui/preferences/undo", { baseRevision: 4 })).status, 200);
  assert.deepEqual(await readAppUIPreferences(owner), { ...initial, revision: 5 });
});

integration("undo follows confirmed revisions when transaction timestamps have a different order", async () => {
  const first = await previewAndConfirm(20, 0);
  const second = await previewAndConfirm(24, 1);
  // PostgreSQL CURRENT_TIMESTAMP is the transaction start, which can precede
  // another transaction's while waiting for its authorization/profile locks.
  await query("UPDATE ui_preference_previews SET confirmed_at = clock_timestamp() + interval '1 minute' WHERE id = ?", [first.id]);
  const latest = await request("/api/ui/preferences/undo", { baseRevision: 2 });
  assert.equal(latest.status, 200, JSON.stringify(latest));
  assert.equal(latest.data.previewId, second.id);
  assert.equal(latest.data.preferences.surfaces.miao.cardRadius, 20);
  const earlier = await request("/api/ui/preferences/undo", { baseRevision: 3 });
  assert.equal(earlier.status, 200);
  assert.equal(earlier.data.previewId, first.id);
  assert.equal(earlier.data.preferences.surfaces.miao.cardRadius, 16);
});

integration("two pending UI previews compete atomically and only the confirmed one can be undone", async () => {
  const previews = [];
  for (const radius of [20, 24]) {
    modelReply = JSON.stringify({ schemaVersion: 1, intent: "调整妙页圆角", rationale: "并发合同测试。",
      affectedSurfaces: ["miao"], patch: { surfaces: { miao: { cardRadius: radius } } } });
    const response = await request("/api/ui/preferences/preview", { instruction: `圆角${radius}`, surface: "miao" });
    assert.equal(response.status, 201);
    previews.push(response.data);
  }
  const results = await Promise.all(previews.map(preview =>
    request("/api/ui/preferences/confirm", { previewId: preview.id, baseRevision: 0 })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const winner = results.findIndex(result => result.status === 200);
  const loser = 1 - winner;
  assert.equal(results[loser].error.details.code, "UI_PREFERENCE_REVISION_CONFLICT");
  assert.equal((await readAppUIPreferences(owner)).revision, 1);
  const undone = await request("/api/ui/preferences/undo", { baseRevision: 1 });
  assert.equal(undone.status, 200);
  assert.equal(undone.data.previewId, previews[winner].id);
  const stale = await request("/api/ui/preferences/confirm", { previewId: previews[loser].id, baseRevision: 0 });
  assert.equal(stale.status, 409);
  assert.equal((await readAppUIPreferences(owner)).revision, 2);
});

integration("revoking UI Agent authorization prevents confirmation and undo without modifying saved preferences", async () => {
  await previewAndConfirm(20, 0);
  modelReply = JSON.stringify({ schemaVersion: 1, intent: "调整妙页圆角", rationale: "撤权合同测试。",
    affectedSurfaces: ["miao"], patch: { surfaces: { miao: { cardRadius: 24 } } } });
  const pending = await request("/api/ui/preferences/preview", { instruction: "圆角24", surface: "miao" });
  assert.equal(pending.status, 201);
  const beforeRevocation = await readAppUIPreferences(owner);
  const publication = fixture.publications[0];
  await productRepository.disableEntitlement({ userId: owner, productId: publication.productId,
    productVersionId: publication.productVersionId, idempotencyKey: `ui-lifecycle-revoke-${crypto.randomUUID()}` });
  assert.equal((await request("/api/ui/preferences/confirm", { previewId: pending.data.id, baseRevision: 1 })).status, 403);
  assert.equal((await request("/api/ui/preferences/undo", { baseRevision: 1 })).status, 403);
  assert.equal((await request("/api/ui/preferences/reset", { baseRevision: 1 })).status, 403);
  assert.deepEqual(await readAppUIPreferences(owner), beforeRevocation);
  const rows = await query("SELECT status,undone_at FROM ui_preference_previews WHERE user_id = ? ORDER BY base_revision", [owner]);
  assert.deepEqual(rows, [{ status: "confirmed", undone_at: null }, { status: "pending", undone_at: null }]);
});
