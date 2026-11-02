import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { after, before, beforeEach } from "node:test";
import pg from "pg";
import { createConnectionAdapter } from "../src/db.js";
import { loadMigrationFiles } from "../src/migration-files.js";
import { applyPendingMigrations } from "../src/migration-ledger.js";
import { createAITaskRepository } from "../src/ai-task-repository.js";
import { createSiteTaskService, siteTaskRequestSchema } from "../src/ai-site-task-service.js";
import { registerStationSiteRoutes } from "../src/routes/station-site-routes.js";
import { buildPublicStationView } from "../src/public-station-service.js";
import { getStationSiteDocumentForUser } from "../src/site-document-repository.js";
import { assertSiteDocument } from "../../shared/site-document.js";
import { getAgent } from "../../agents/registry.js";
import { cleanupPublishedAgentConsent, seedPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";
const siteScopes = (await getAgent("site-builder")).permissions;

const owner = crypto.randomUUID();
const other = crypto.randomUUID();
const mediaId = crypto.randomUUID();
const foreignMediaId = crypto.randomUUID();
const diaryId = crypto.randomUUID();
const initialConfig = { language: "zh", siteLayout: { title: "Existing public layout", sections: [] } };
const generatedDraft = () => ({ language: "zh", theme: "gallery", title: "Private pending draft", summary: "Review first",
  sections: [{ type: "gallery", title: "Gallery", subtitle: "", body: "", assetIds: [mediaId], diaryEntryIds: [diaryId], actions: [] }] });
const makeInput = () => ({ user: { id: owner }, prompt: "Use my photos for a gallery", idempotencyKey: crypto.randomUUID() });
const code = expected => error => error.details?.code === expected;
let pool;
let repository;
let service;
let modelCalls;
let generateHook;
let publicationFixture;
const transaction = async work => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(createConnectionAdapter(client));
    await client.query("COMMIT");
    return result;
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
};
const waiting = async () => {
  await service.submitSiteTask(makeInput());
  const claimed = await repository.claimAITask();
  return service.executeSiteTask(claimed);
};
const confirm = (task, overrides = {}) => repository.mutateAITask({ userId: owner, taskId: task.id,
  revision: task.revision, operation: "confirm", approvalId: task.approval.id,
  mutate: (connection, record) => service.confirmSiteTask(connection, record, { userId: owner, approvalId: task.approval.id }),
  ...overrides });
const profileConfig = async () => (await pool.query("SELECT station_config FROM user_profiles WHERE user_id = $1", [owner])).rows[0].station_config;

// The HTTP boundary can be tested without any database or model calls.
test("site submission accepts only prompt/idempotency key and explicitly rejects retired direct apply", async () => {
  assert.equal(siteTaskRequestSchema.safeParse({ prompt: "a", idempotencyKey: "long-enough", apply: true }).success, false);
  assert.equal(siteTaskRequestSchema.safeParse({ prompt: "a" }).success, false);
  const registered = [];
  const app = { get: (...args) => registered.push(["get", ...args]), post: (...args) => registered.push(["post", ...args]) };
  const fake = { id: crypto.randomUUID(), status: "queued" };
  registerStationSiteRoutes(app, { authenticate() {}, asyncHandler: fn => fn, submit: async () => fake });
  assert.deepEqual(registered.map(([method, path]) => [method, path]), [["get", "/api/station/site-drafts"], ["get", "/api/station/site-drafts/:draftId/document"], ["post", "/api/station/site-drafts"], ["post", "/api/station/site-drafts/:draftId/apply"]]);
  assert.throws(() => registered[3].at(-1)(), error => error.status === 426 && error.details.code === "AI_CLIENT_UPDATE_REQUIRED");
  let status;
  let payload;
  const res = { status: value => { status = value; return res; }, json: value => { payload = value; } };
  await registered[2].at(-1)({ user: { id: owner }, body: { prompt: "a", idempotencyKey: "long-enough" } }, res);
  assert.equal(status, 202);
  assert.deepEqual(payload, { data: { task: fake } });
});

test("document route binds the authenticated owner and validates the draft identity", async () => {
  const routes = [];
  const calls = [];
  const app = { get: (...args) => routes.push(args), post() {} };
  const documentId = crypto.randomUUID();
  registerStationSiteRoutes(app, { authenticate() {}, asyncHandler: fn => fn,
    readDocument: async input => { calls.push(input); return { document: { documentId } }; } });
  const route = routes.find(([path]) => path === "/api/station/site-drafts/:draftId/document");
  let payload;
  await route.at(-1)({ user: { id: owner }, params: { draftId: documentId } }, { json: value => { payload = value; } });
  assert.deepEqual(calls, [{ userId: owner, draftId: documentId }]);
  assert.deepEqual(payload.data.document, { documentId });
  await assert.rejects(route.at(-1)({ user: { id: owner }, params: { draftId: "not-an-id" } }, {}));
  assert.equal(calls.length, 1);
});

if (process.env.RUN_AI_SITE_TASK_INTEGRATION !== "1") {
  test("site task PostgreSQL boundary requires explicit isolated database", {
    skip: "RUN_AI_SITE_TASK_INTEGRATION=1 and AI_SITE_TASK_DATABASE_URL pointing at an empty loopback _migration_test database",
  }, () => {});
} else {
  before(async () => {
    const url = new URL(process.env.AI_SITE_TASK_DATABASE_URL);
    if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !url.pathname.endsWith("_migration_test")) {
      throw new Error("Site task integration requires a dedicated loopback _migration_test database");
    }
    pool = new pg.Pool({ connectionString: url.toString(), max: 8 });
    const client = await pool.connect();
    try {
      const tables = await client.query("SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public'");
      if (tables.rows[0].n) throw new Error("Site task database public schema must be empty");
      await applyPendingMigrations({ client, migrations: await loadMigrationFiles() });
      for (const [id, aiId] of [[owner, "898989898981"], [other, "898989898982"]]) {
        await client.query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES($1,$2,'test-only',$3,$4)", [id, `${id}@example.test`, id, aiId]);
        await client.query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES($1,'Site test','S')", [id]);
      }
      await client.query("INSERT INTO station_media_assets(id,user_id,kind,mime_type,original_filename,status) VALUES($1,$2,'image','image/jpeg','public-fixture.jpg','uploaded')", [mediaId, owner]);
      await client.query("INSERT INTO station_media_assets(id,user_id,kind,mime_type,original_filename,status) VALUES($1,$2,'image','image/jpeg','foreign-fixture.jpg','uploaded')", [foreignMediaId, other]);
      await client.query("INSERT INTO station_diary_entries(id,user_id,title,body) VALUES($1,$2,'Fixture diary','Owned fixture context')", [diaryId, owner]);
    } finally { client.release(); }
    publicationFixture = await seedPublishedAgentConsent({
      userId: owner, agentKeys: ["site-builder"], queryFn: createConnectionAdapter(pool).query, transaction,
    });
    repository = createAITaskRepository({ query: createConnectionAdapter(pool).query, withTransaction: transaction });
    service = createSiteTaskService({ transaction, finishTask: repository.finishAITask, advanceTask: repository.advanceAITask,
      generate: async input => {
        modelCalls += 1;
        assert.equal(input.user.id, owner);
        assert.equal(input.stationContent.mediaAssets[0].id, mediaId);
        assert.equal("storageKey" in input.stationContent.mediaAssets[0], false);
        const overriddenDraft = generateHook ? await generateHook() : null;
        return { draft: overriddenDraft?.sections ? overriddenDraft : generatedDraft(), source: "model", model: { provider: "isolated-fixture" } };
      } });
  });
  after(async () => {
    if (pool) {
      await cleanupPublishedAgentConsent({ userIds: [owner, other], queryFn: createConnectionAdapter(pool).query });
      await pool.query("DELETE FROM users WHERE id = ANY($1::text[])", [[owner, other]]);
      await publicationFixture?.cleanup();
      await pool.end();
    }
  });
  beforeEach(async () => {
    modelCalls = 0;
    generateHook = null;
    await pool.query("DELETE FROM ai_tasks WHERE user_id = $1", [owner]);
    await pool.query("DELETE FROM station_site_drafts WHERE user_id = $1", [owner]);
    await pool.query("UPDATE users SET status = 'active' WHERE id = $1", [owner]);
    await pool.query("UPDATE user_profiles SET station_config = $1::jsonb, bio = '' WHERE user_id = $2", [JSON.stringify(initialConfig), owner]);
    await pool.query("UPDATE user_agents SET enabled = true, granted_scopes = $1::jsonb WHERE user_id = $2", [JSON.stringify(siteScopes), owner]);
    await pool.query("UPDATE station_media_assets SET user_id = $1, status = 'uploaded', deleted_at = NULL WHERE id = $2", [owner, mediaId]);
    await pool.query("UPDATE station_diary_entries SET body = 'Owned fixture context', deleted_at = NULL WHERE id = $1", [diaryId]);
  });

  test("duplicate submissions have one task/model call; draft stays private until exact atomic confirmation", async () => {
    const input = makeInput();
    const tasks = await Promise.all(Array.from({ length: 4 }, () => service.submitSiteTask(input)));
    assert.equal(new Set(tasks.map(task => task.id)).size, 1);
    assert.equal(modelCalls, 0);
    const claimed = await repository.claimAITask();
    const task = await service.executeSiteTask(claimed);
    assert.equal(modelCalls, 1);
    assert.equal(await repository.claimAITask(), null);
    assert.equal(task.status, "awaiting_confirmation");
    assert.match(task.approval.resourcesHash, /^[a-f0-9]{64}$/);
    assert.equal((await service.submitSiteTask(input)).id, task.id);
    assert.equal(modelCalls, 1);
    assert.deepEqual(await profileConfig(), initialConfig);
    const publicView = buildPublicStationView({ ownerProfile: { stationConfig: await profileConfig() },
      stationContent: { siteDrafts: [{ draft: generatedDraft() }] } });
    assert.equal(publicView.siteLayout, null);
    assert.equal(JSON.stringify(publicView).includes("Private pending draft"), false);
    const approved = await confirm(task);
    assert.equal(approved.status, "succeeded");
    assert.equal(approved.approval, null);
    const view = await getStationSiteDocumentForUser({ userId: owner, draftId: task.approval.draftId, transaction });
    assertSiteDocument(view.document);
    assert.equal(view.document.documentId, task.approval.draftId);
    assert.equal(view.document.revision, 1);
    assert.equal(view.document.visibility, "private");
    assert.deepEqual((await profileConfig()).siteLayout, view.document);
    assert.equal(view.documentHash, task.approval.draftHash);
    assert.equal(view.resourcesHash, task.approval.resourcesHash);
    assert.equal((await confirm(task)).revision, approved.revision);
    assert.equal(modelCalls, 1);
    await assert.rejects(confirm(task, { approvalId: crypto.randomUUID() }), error => error.status === 409);
  });

  test("cross-owner, wrong approval and expired approval never apply", async () => {
    const task = await waiting();
    await assert.rejects(confirm(task, { userId: other }), error => error.status === 404);
    await assert.rejects(confirm(task, { approvalId: crypto.randomUUID() }), error => error.status === 409);
    await pool.query("UPDATE ai_tasks SET approval = jsonb_set(approval, '{expiresAt}', to_jsonb('2000-01-01T00:00:00Z'::text)) WHERE id = $1", [task.id]);
    await assert.rejects(confirm(task), code("AI_TASK_APPROVAL_EXPIRED"));
    assert.deepEqual(await profileConfig(), initialConfig);
  });

  test("document preview reads exact older references beyond bootstrap limits and preserves node identities", async () => {
    const task = await waiting();
    const args = { userId: owner, draftId: task.approval.draftId, transaction };
    const first = await getStationSiteDocumentForUser(args);
    const extras = Array.from({ length: 35 }, () => crypto.randomUUID());
    try {
      for (const id of extras) {
        await pool.query("INSERT INTO station_media_assets(id,user_id,kind,mime_type,status) VALUES($1,$2,'image','image/jpeg','uploaded')", [id, owner]);
      }
      const again = await getStationSiteDocumentForUser(args);
      assert.deepEqual(again, first);
      assert.equal(again.document.documentId, task.approval.draftId);
      assert.deepEqual(again.mediaAssets.map(item => item.id), [mediaId]);
      assert.deepEqual(again.diaryEntries.map(item => item.id), [diaryId]);
      assert.equal(again.documentHash, task.approval.draftHash);
      assert.equal(again.resourcesHash, task.approval.resourcesHash);
      await assert.rejects(getStationSiteDocumentForUser({ ...args, userId: other }), error => error.status === 404);
      await pool.query("UPDATE station_media_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [mediaId]);
      await assert.rejects(getStationSiteDocumentForUser(args), code("SITE_TASK_REFERENCES_UNAVAILABLE"));
    } finally {
      await pool.query("DELETE FROM station_media_assets WHERE id = ANY($1::text[])", [extras]);
    }
  });

  test("historical version-one JSON is preserved but cannot be previewed or confirmed", async () => {
    const task = await waiting();
    const legacy = { version: 1, ...generatedDraft() };
    await pool.query("UPDATE station_site_drafts SET draft = $1::jsonb WHERE id = $2", [JSON.stringify(legacy), task.approval.draftId]);
    await assert.rejects(getStationSiteDocumentForUser({ userId: owner, draftId: task.approval.draftId, transaction }), code("SITE_DOCUMENT_UNSUPPORTED"));
    await assert.rejects(confirm(task), code("SITE_DOCUMENT_UNSUPPORTED"));
    const saved = (await pool.query("SELECT draft, status FROM station_site_drafts WHERE id = $1", [task.approval.draftId])).rows[0];
    assert.deepEqual(saved.draft, legacy);
    assert.equal(saved.status, "draft");
    assert.deepEqual(await profileConfig(), initialConfig);
  });

  test("submission and execution recheck actual account scopes before any model call", async () => {
    // Even a permission not used by the site executor requires re-addition.
    await pool.query("UPDATE user_agents SET granted_scopes = $1::jsonb WHERE user_id = $2", [JSON.stringify(siteScopes.filter(scope => scope !== "messages:read")), owner]);
    await assert.rejects(service.submitSiteTask(makeInput()), code("SITE_TASK_ACCESS_REVOKED"));
    assert.equal(modelCalls, 0);
    await pool.query("UPDATE user_agents SET granted_scopes = $1::jsonb WHERE user_id = $2", [JSON.stringify(siteScopes), owner]);
    await service.submitSiteTask(makeInput());
    const claimed = await repository.claimAITask();
    await pool.query("UPDATE user_agents SET enabled = false WHERE user_id = $1", [owner]);
    await assert.rejects(service.executeSiteTask(claimed), code("SITE_TASK_ACCESS_REVOKED"));
    assert.equal(modelCalls, 0);
  });

  test("authorization revoked during model call prevents result persistence", async () => {
    generateHook = async () => pool.query("UPDATE user_agents SET enabled = false WHERE user_id = $1", [owner]);
    await assert.rejects(waiting(), code("SITE_TASK_ACCESS_REVOKED"));
    assert.equal((await pool.query("SELECT id FROM station_site_drafts WHERE user_id = $1", [owner])).rowCount, 0);
    assert.deepEqual(await profileConfig(), initialConfig);
  });

  test("profile changes during generation prevent binding approval to a newer profile", async () => {
    generateHook = async () => pool.query("UPDATE user_profiles SET bio = 'Changed during generation' WHERE user_id = $1", [owner]);
    await assert.rejects(waiting(), code("SITE_TASK_PROFILE_CHANGED"));
    assert.equal((await pool.query("SELECT id FROM station_site_drafts WHERE user_id = $1", [owner])).rowCount, 0);
  });

  for (const resource of ["media", "diary"]) {
    test(`${resource} content changes during generation prevent persisting a draft based on an older snapshot`, async () => {
      generateHook = () => resource === "media"
        ? pool.query("UPDATE station_media_assets SET byte_size = COALESCE(byte_size, 0) + 1 WHERE id = $1", [mediaId])
        : pool.query("UPDATE station_diary_entries SET body = 'Changed during generation' WHERE id = $1", [diaryId]);
      await assert.rejects(waiting(), code("SITE_TASK_RESOURCES_CHANGED"));
      assert.equal((await pool.query("SELECT id FROM station_site_drafts WHERE user_id = $1", [owner])).rowCount, 0);
      assert.deepEqual(await profileConfig(), initialConfig);
    });

    test(`confirmation rejects changed ${resource} versions without publishing the old interpretation`, async () => {
      const task = await waiting();
      if (resource === "media") await pool.query("UPDATE station_media_assets SET byte_size = COALESCE(byte_size, 0) + 1 WHERE id = $1", [mediaId]);
      else await pool.query("UPDATE station_diary_entries SET body = 'Changed since preview' WHERE id = $1", [diaryId]);
      await assert.rejects(confirm(task), code("SITE_TASK_RESOURCES_CHANGED"));
      assert.deepEqual(await profileConfig(), initialConfig);
      assert.equal((await pool.query("SELECT status FROM station_site_drafts WHERE id = $1", [task.approval.draftId])).rows[0].status, "draft");
      assert.equal((await repository.getAITask({ userId: owner, taskId: task.id })).status, "awaiting_confirmation");
    });
  }

  test("site confirmation requires its resource digest even though the shared approval schema is optional", async () => {
    const task = await waiting();
    await pool.query("UPDATE ai_tasks SET approval = approval - 'resourcesHash' WHERE id = $1", [task.id]);
    await assert.rejects(confirm(task), code("SITE_TASK_RESOURCES_CHANGED"));
    assert.deepEqual(await profileConfig(), initialConfig);
  });

  for (const scenario of ["scope", "profile", "draft", "asset-deleted", "account"]) {
    test(`confirmation rechecks ${scenario} and leaves profile unchanged on rejection`, async () => {
      const task = await waiting();
      if (scenario === "scope") await pool.query("UPDATE user_agents SET enabled = false WHERE user_id = $1", [owner]);
      if (scenario === "profile") await pool.query("UPDATE user_profiles SET bio = 'Changed since preview' WHERE user_id = $1", [owner]);
      if (scenario === "draft") await pool.query("UPDATE station_site_drafts SET draft = jsonb_set(draft,'{title}','\"Changed\"'::jsonb) WHERE id = $1", [task.approval.draftId]);
      if (scenario === "asset-deleted") await pool.query("UPDATE station_media_assets SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1", [mediaId]);
      if (scenario === "account") await pool.query("UPDATE users SET status = 'disabled' WHERE id = $1", [owner]);
      await assert.rejects(confirm(task), error => [403, 409].includes(error.status));
      assert.deepEqual(await profileConfig(), initialConfig);
      assert.equal((await repository.getAITask({ userId: owner, taskId: task.id })).status, "awaiting_confirmation");
    });
  }

  test("foreign resources returned by the model are rejected, not dropped", async () => {
    generateHook = async () => {
      const draft = generatedDraft();
      draft.sections[0].assetIds = [foreignMediaId];
      return draft;
    };
    await assert.rejects(waiting(), code("SITE_TASK_REFERENCES_UNAVAILABLE"));
    assert.equal((await pool.query("SELECT id FROM station_site_drafts WHERE user_id = $1", [owner])).rowCount, 0);
  });

  test("duplicate execution of one claimed task cannot dispatch a second model call", async () => {
    await service.submitSiteTask(makeInput());
    const claimed = await repository.claimAITask();
    const attempts = await Promise.allSettled([service.executeSiteTask(claimed), service.executeSiteTask(claimed)]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(modelCalls, 1);
  });

  test("task completion failure rolls back the profile write and applied draft together", async () => {
    const task = await waiting();
    await assert.rejects(confirm(task, { mutate: async (connection, record) => {
      await service.confirmSiteTask(connection, record, { userId: owner, approvalId: task.approval.id });
      throw new Error("Simulated completion failure");
    } }), /Simulated completion failure/);
    assert.deepEqual(await profileConfig(), initialConfig);
    assert.equal((await pool.query("SELECT status FROM station_site_drafts WHERE id = $1", [task.approval.draftId])).rows[0].status, "draft");
  });
}
