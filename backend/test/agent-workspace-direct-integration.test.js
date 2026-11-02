import assert from "node:assert/strict";
import crypto from "node:crypto";
import test, { before, beforeEach, after } from "node:test";
import { query, closeDatabase, withTransaction } from "../src/db.js";
import * as repository from "../src/agent-workspace-repository.js";
import { createAgentWorkspaceService } from "../src/agent-workspace-service.js";
import { createWorkspaceCapabilityExecutor, listExecutableWorkspaceCapabilities } from "../src/agent-workspace-capabilities.js";
import { getStationSiteDocumentForUser } from "../src/site-document-repository.js";
import { createAgentWorkspaceRunner } from "../src/agent-workspace-runner.js";
import { getAgent } from "../../agents/registry.js";

import { seedPublishedAgentConsent, cleanupPublishedAgentConsent } from "./helpers/agent-publishing-fixture.js";

let publicationFixture;
const enabled = process.env.RUN_AGENT_WORKSPACE_DIRECT_INTEGRATION === "1";
const integration = (name, work) => test(name, { skip: !enabled && "RUN_AGENT_WORKSPACE_DIRECT_INTEGRATION=1 with a migrated loopback *_migration_test database" }, work);
const owner = crypto.randomUUID(), outsider = crypto.randomUUID();
const agentIds = ["file-preprocessor", "site-builder", "album-manager", "comic-diary", "video-production", "virtual-character", "model-3d"];
const threads = Object.fromEntries(agentIds.map(agentId => [agentId, crypto.randomUUID()]));
const albumId = crypto.randomUUID(), mediaId = crypto.randomUUID();
const receipt = { provider: "isolated-direct-fixture", model: "test-model", servedModel: "test-model", tokenUsage: { prompt: 2, completion: 3, total: 5 }, latencyMs: 1 };
const code = expected => error => error.details?.code === expected;
let service, executor, providerCalls, pageCalls, beforeDispatch, afterDispatch, changedVersion;
const call = async (options, work) => {
  if (beforeDispatch) await beforeDispatch(options);
  const reservation = await options.beforeModelCall();
  const value = await work();
  if (afterDispatch) await afterDispatch(options);
  await options.afterModelCall({ receipt: reservation, ...receipt });
  return value;
};
const createInput = async (agentId = "file-preprocessor", content = "整理一份周末露营清单") => {
  const inputMessageId = crypto.randomUUID();
  await query(`INSERT INTO chat_messages(id,user_id,thread_id,sender_type,sender_name,content,metadata)
    VALUES(?,?,?,'user','Isolated fixture',?,'{"source":"app"}')`, [inputMessageId, owner, threads[agentId], content]);
  const agent = await getAgent(agentId);
  const authorityCeiling = listExecutableWorkspaceCapabilities({ registeredAgents: [agent], grants: [{ agentId, enabled: true, grantedScopes: agent.permissions }] });
  return { user: { id: owner }, threadId: threads[agentId], inputMessageId, requestMessageIds: [inputMessageId],
    capability: (agentId === "file-preprocessor" ? authorityCeiling.find(entry => entry.capability === "text.summarize") : authorityCeiling[0]).capability, contextRefs: [], source: { page: "messages.agent", module: agentId },
    idempotencyKey: crypto.randomUUID(), authorityCeiling };
};
const create = async (agentId = "file-preprocessor", overrides = {}) => {
  const request = { ...await createInput(agentId), ...overrides };
  return { request, workspace: await service.submitDirectAgentWorkspace(request) };
};
const next = async () => {
  const claim = await repository.claimWorkspaceNode();
  assert.ok(claim); assert.equal(claim.workspace.userId, owner, "Queue suites must run sequentially");
  return service.executeWorkspaceNode(claim);
};
const get = workspace => repository.getAgentWorkspace({ userId: owner, workspaceId: workspace.id });
const continueRequest = workspace => ({ userId: owner, workspaceId: workspace.id, operation: "continue", revision: workspace.revision,
  text: "保留第一版，补充急救包", idempotencyKey: crypto.randomUUID() });
const preview = draftId => getStationSiteDocumentForUser({ userId: owner, draftId, authorizeWorkspaceDraft: service.authorizeWorkspaceSiteDraftRead });

before(async () => {
  if (!enabled) return;
  const url = new URL(process.env.DATABASE_URL);
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_migration_test"));
  assert.match((await query("SELECT current_database() AS name"))[0].name, /_migration_test$/);
  for (const userId of [owner, outsider]) {
    await query("INSERT INTO users(id,email,password_hash,display_name,ai_id) VALUES(?,?,'isolated-test-only',?,?)",
      [userId, `${userId}@example.invalid`, `Direct ${userId.slice(0, 8)}`, String(crypto.randomInt(100000000000, 999999999999))]);
    await query("INSERT INTO user_profiles(user_id,nickname,avatar_text) VALUES(?,'Direct fixture','D')", [userId]);
  }
  for (const agentId of agentIds) {
    await query("INSERT INTO user_agents(user_id,agent_id,enabled,granted_scopes) VALUES(?,?,true,?::jsonb)", [owner, agentId, JSON.stringify((await getAgent(agentId)).permissions)]);
    await query("INSERT INTO chat_threads(id,user_id,title,agent_id,kind) VALUES(?,?,'Direct fixture',?,'agent')", [threads[agentId], owner, agentId]);
  }
  publicationFixture = await seedPublishedAgentConsent({ userId: owner, agentKeys: agentIds });
  await query("INSERT INTO station_albums(id,user_id,title) VALUES(?,?,'Direct selected album')", [albumId, owner]);
  await query("INSERT INTO station_media_assets(id,user_id,album_id,kind,mime_type,original_filename,status) VALUES(?,?,?,'image','image/jpeg','fixture.jpg','uploaded')", [mediaId, owner, albumId]);
  await query("INSERT INTO media_retrieval_profiles(user_id,index_state,consent_version,consent_granted_at) VALUES(?,'enabled','media-retrieval-consent-v1',CURRENT_TIMESTAMP)", [owner]);
  executor = createWorkspaceCapabilityExecutor({
    runAgentRuntime: options => call(options, async () => {
      providerCalls.push(options);
      if (options.agentId === "album-manager") await options.tools.execute("search_media", { query: options.input, albumId, limit: 1 });
      else { assert.equal(options.mode, "contribute"); assert.equal(options.thread, null); assert.deepEqual(options.messages, []); }
      return { reply: `真实执行器的隔离文字成果：${options.input}`, ...receipt };
    }),
    generateSite: options => call(options, async () => {
      pageCalls.push(options);
      const base = options.siteHandoffs[0]?.document;
      return { source: "model", model: receipt, draft: { language: "zh", theme: "clean", title: `第${pageCalls.length}版页面`, summary: "隔离验证",
        sections: [{ type: "about", title: "内容", subtitle: "", body: base ? `${base.sections[0].body}；补充急救包` : "第一版露营计划",
          assetIds: [], diaryEntryIds: [], actions: [] }] } };
    }),
    retrievalService: {
      getMediaRetrievalStatus: async () => ({ enabled: true, availability: { canStartRun: true }, backfill: { indexedAssets: 1, totalAssets: 1, skippedAssets: 0 } }),
      searchMediaRetrieval: options => call(options, async () => {
        const runId = crypto.randomUUID();
        await query("INSERT INTO agent_runs(id,user_id,agent_id,status,run_type,lifecycle_status) VALUES(?,?,'media-retrieval','success','media-search','succeeded')", [runId, owner]);
        const [profile] = await query("SELECT index_epoch FROM media_retrieval_profiles WHERE user_id=?", [owner]);
        const response = { agentRunId: runId, results: [{ mediaAssetId: mediaId, kind: "image", matchedFrameTimestampMs: null }] };
        await query("INSERT INTO agent_run_events(id,agent_run_id,user_id,sequence,lifecycle_status,event_type,payload,delivery_key) VALUES(?,?,?,1,'succeeded','completed',?::jsonb,?)",
          [crypto.randomUUID(), runId, owner, JSON.stringify({ indexEpoch: profile.index_epoch, searchResponse: response }), crypto.randomUUID()]);
        return response;
      }),
    },
  });
  service = createAgentWorkspaceService({ executeCapability: executor, limits: { deadlineSeconds: 600 },
    loadAgent: async agentId => { const agent = await getAgent(agentId); return agent && changedVersion === agentId ? { ...agent, version: `${agent.version}-changed` } : agent; },
    run: () => assert.fail("A direct workspace must never invoke the Butler coordinator") });
});
beforeEach(async () => {
  if (!enabled) return;
  providerCalls = []; pageCalls = []; beforeDispatch = null; afterDispatch = null; changedVersion = null;
  await query("DELETE FROM agent_workspace_submissions WHERE user_id=?", [owner]);
  await query("DELETE FROM agent_workspaces WHERE user_id=?", [owner]);
  await query("DELETE FROM station_site_drafts WHERE user_id=?", [owner]);
  await query("DELETE FROM agent_runs WHERE user_id=?", [owner]);
  await query("DELETE FROM chat_messages WHERE user_id=?", [owner]);
  await query("UPDATE users SET status='active' WHERE id=?", [owner]);
  await query("UPDATE user_entitlements SET status='enabled' WHERE user_id=?", [owner]);
  await query("UPDATE user_profiles SET station_config='{}'::jsonb,bio='' WHERE user_id=?", [owner]);
  await query("UPDATE station_albums SET title='Direct selected album' WHERE id=?", [albumId]);
  await query("UPDATE media_retrieval_profiles SET index_state='enabled',consent_version='media-retrieval-consent-v1' WHERE user_id=?", [owner]);
  for (const agentId of agentIds) await query("UPDATE user_agents SET enabled=true,granted_scopes=?::jsonb WHERE user_id=? AND agent_id=?", [JSON.stringify((await getAgent(agentId)).permissions), owner, agentId]);
});
after(async () => { if (enabled) { await cleanupPublishedAgentConsent({ userIds: [owner, outsider] }); await query("DELETE FROM users WHERE id IN (?,?)", [owner, outsider]); await publicationFixture?.cleanup(); await closeDatabase(); } });

integration("direct text uses one real specialist, exposes its true source and succeeds without any Butler access", async () => {
  const { request, workspace } = await create();
  assert.equal(workspace.executionMode, "direct");
  assert.deepEqual(workspace.origin, { kind: "agent_conversation", threadId: request.threadId, inputMessageId: request.inputMessageId,
    agentId: "file-preprocessor", agentVersion: (await getAgent("file-preprocessor")).version, capability: "text.summarize" });
  assert.equal(workspace.goal, "整理一份周末露营清单"); assert.equal(workspace.steps.length, 1);
  const finished = await next();
  assert.equal(finished.status, "succeeded"); assert.equal(finished.usage.modelCalls, 1); assert.equal(finished.usage.coordinatorTurns, 0);
  assert.equal(finished.result.kind, "text_result"); assert.equal(providerCalls.length, 1);
  assert.equal((await query("SELECT count(*)::int AS count FROM user_agents WHERE user_id=? AND agent_id='miaoxun-butler'", [owner]))[0].count, 0);
  const text = await service.getWorkspaceText({ userId: owner, workspaceId: finished.id, nodeId: finished.result.id });
  assert.match(text.content, /露营清单/); assert.equal((await repository.listAgentWorkspaces({ userId: owner }))[0].id, finished.id);
  assert.equal(await repository.getAgentWorkspace({ userId: outsider, workspaceId: finished.id }), null);
});

integration("all registered text specialists deliver only their own typed contribution", async () => {
  for (const agentId of ["comic-diary", "video-production", "virtual-character", "model-3d"]) {
    const { workspace } = await create(agentId);
    const finished = await next();
    assert.equal(finished.id, workspace.id); assert.equal(finished.status, "succeeded");
    assert.equal(finished.steps.length, 1); assert.equal(finished.steps[0].agentId, agentId); assert.equal(finished.result.kind, "text_result");
  }
  assert.equal(providerCalls.length, 4);
});

integration("concurrent same-key submission creates one direct round and altered request identity conflicts", async () => {
  const request = await createInput();
  const [a, b] = await Promise.all([service.submitDirectAgentWorkspace(request), service.submitDirectAgentWorkspace(request)]);
  assert.equal(a.id, b.id); assert.equal(a.steps.length, 1);
  const other = await createInput();
  await assert.rejects(service.submitDirectAgentWorkspace({ ...request, inputMessageId: other.inputMessageId, requestMessageIds: [other.inputMessageId] }), code("WORKSPACE_IDEMPOTENCY_CONFLICT"));
  assert.equal((await query("SELECT count(*)::int AS count FROM agent_workspaces WHERE user_id=?", [owner]))[0].count, 1);
});

integration("the exact admitted user chain supplies the goal and no unrelated or Agent message may enter it", async () => {
  const first = await createInput("file-preprocessor", "整理一份旅行准备清单");
  const second = await createInput("file-preprocessor", "只包含露营用品");
  const request = { ...second, requestMessageIds: [first.inputMessageId, second.inputMessageId] };
  const workspace = await service.submitDirectAgentWorkspace(request);
  assert.equal(workspace.goal, "整理一份旅行准备清单\n\n只包含露营用品");
  const foreign = await createInput("video-production", "Other private conversation");
  await assert.rejects(service.submitDirectAgentWorkspace({ ...request, idempotencyKey: crypto.randomUUID(), requestMessageIds: [foreign.inputMessageId, second.inputMessageId] }), code("WORKSPACE_ORIGIN_CHANGED"));
  await query("UPDATE chat_messages SET sender_type='agent' WHERE id=?", [first.inputMessageId]);
  await assert.rejects(service.submitDirectAgentWorkspace({ ...request, idempotencyKey: crypto.randomUUID() }), code("WORKSPACE_ORIGIN_CHANGED"));
});

integration("cross-owner input, unsupported capability, changed ceiling and incompatible references cannot create direct work", async () => {
  const request = await createInput();
  await assert.rejects(service.submitDirectAgentWorkspace({ ...request, user: { id: outsider } }), code("WORKSPACE_ORIGIN_CHANGED"));
  await assert.rejects(service.submitDirectAgentWorkspace({ ...request, capability: "site.compose" }), code("WORKSPACE_ACCESS_REQUIRED"));
  await assert.rejects(service.submitDirectAgentWorkspace({ ...request, authorityCeiling: request.authorityCeiling.map(entry => ({ ...entry, description: "Untrusted changed declaration" })) }), code("WORKSPACE_ACCESS_REVOKED"));
  await assert.rejects(service.submitDirectAgentWorkspace({ ...request, contextRefs: [{ kind: "station-album", id: albumId }] }), code("WORKSPACE_CONTEXT_INVALID"));
  assert.equal((await query("SELECT count(*)::int AS count FROM agent_workspaces WHERE user_id=?", [owner]))[0].count, 0);
});

integration("outer message-completion rollback leaves no workspace, node or accepted receipt", async () => {
  const request = await createInput();
  await assert.rejects(withTransaction(async connection => { await service.submitDirectAgentWorkspace({ ...request, connection }); throw new Error("isolated rollback"); }), /isolated rollback/);
  assert.equal((await query("SELECT count(*)::int AS count FROM agent_workspaces WHERE user_id=?", [owner]))[0].count, 0);
  assert.equal((await query("SELECT count(*)::int AS count FROM agent_workspace_submissions WHERE user_id=?", [owner]))[0].count, 0);
});

integration("direct execution rejects specialist replacement, widened inputs and extra nodes inside the repository transaction", async () => {
  const { workspace } = await create();
  const definition = { key: "replacement", agentId: "file-preprocessor", agentVersion: workspace.origin.agentVersion,
    capability: workspace.origin.capability, goal: workspace.goal, dependencies: [], contextRefIndexes: [] };
  for (const patch of [{ agentId: "site-builder" }, { agentVersion: "changed" }, { capability: "site.compose" },
    { goal: "Model-authored substitute" }, { contextRefIndexes: [0] }, { dependencies: ["invented"] }]) {
    await assert.rejects(withTransaction(async connection => {
      await connection.query("DELETE FROM agent_workspace_nodes WHERE workspace_id=?", [workspace.id]);
      await repository.insertWorkspaceNodes(connection, { id: workspace.id, userId: owner }, [{ ...definition, ...patch }]);
    }), code("WORKSPACE_CONTEXT_INVALID"));
  }
  await assert.rejects(withTransaction(connection => repository.insertWorkspaceNodes(connection,
    { id: workspace.id, userId: owner }, [definition])), code("WORKSPACE_CONTEXT_INVALID"));
  assert.equal((await get(workspace)).steps.length, 1); assert.equal(providerCalls.length, 0);
});

for (const interruption of ["unknown", "cancel", "lease", "deadline"]) {
  integration(`direct ${interruption} after dispatch keeps the original receipt and never automatically executes again`, async () => {
    const { workspace } = await create();
    afterDispatch = async () => {
      if (interruption === "unknown") throw new Error("Isolated response loss");
      if (interruption === "cancel") {
        const running = await get(workspace);
        await service.decideAgentWorkspace({ userId: owner, workspaceId: running.id, revision: running.revision, operation: "cancel" });
      } else if (interruption === "lease") {
        await query("UPDATE agent_workspace_nodes SET lease_until=clock_timestamp()-INTERVAL '1 minute' WHERE workspace_id=? AND status='running'", [workspace.id]);
      } else await query("UPDATE agent_workspaces SET deadline_at=clock_timestamp()-INTERVAL '1 minute' WHERE id=?", [workspace.id]);
    };
    const runner = createAgentWorkspaceRunner({ execute: service.executeWorkspaceNode, repository, logger: { error() {} } });
    assert.equal(await runner.runOnce(), true); assert.equal(await runner.runOnce(), false);
    const stopped = await get(workspace);
    assert.equal(stopped.status, interruption === "cancel" ? "cancelled" : interruption === "deadline" ? "failed" : "interrupted");
    assert.equal(stopped.result, null); assert.equal(stopped.usage.modelCalls, 1); assert.equal(providerCalls.length, 1);
    const [node] = await query("SELECT model_receipts FROM agent_workspace_nodes WHERE workspace_id=?", [workspace.id]);
    assert.equal(node.model_receipts.length, 1);
    assert.equal(node.model_receipts[0].status, ["cancel", "deadline"].includes(interruption) ? "received" : "unknown");
  });
}

for (const boundary of ["before", "after"]) {
  for (const mutation of ["grant", "entitlement", "account", "recalled", "deleted", "content", "version"]) {
    integration(`direct ${mutation} change ${boundary} model dispatch prevents delivery without a fallback Agent`, async () => {
      const { request, workspace } = await create();
      const change = async () => {
        if (mutation === "grant") await query("UPDATE user_agents SET enabled=false WHERE user_id=? AND agent_id='file-preprocessor'", [owner]);
        else if (mutation === "entitlement") await query("UPDATE user_entitlements SET status='disabled' WHERE user_id=?", [owner]);
        else if (mutation === "account") await query("UPDATE users SET status='disabled' WHERE id=?", [owner]);
        else if (mutation === "version") changedVersion = "file-preprocessor";
        else if (mutation === "content") await query("UPDATE chat_messages SET content='Changed source' WHERE id=?", [request.inputMessageId]);
        else await query(`UPDATE chat_messages SET ${mutation === "recalled" ? "recalled_at" : "deleted_at"}=CURRENT_TIMESTAMP WHERE id=?`, [request.inputMessageId]);
      };
      if (boundary === "before") beforeDispatch = change; else afterDispatch = change;
      const runner = createAgentWorkspaceRunner({ execute: service.executeWorkspaceNode, repository, logger: { error() {} } });
      await runner.runOnce();
      const failed = await get(workspace);
      assert.ok(["failed", "interrupted"].includes(failed.status)); assert.equal(failed.result, null);
      assert.equal(providerCalls.length, boundary === "before" ? 0 : 1);
      assert.equal(failed.steps.length, 1); assert.equal(failed.steps[0].agentId, "file-preprocessor");
    });
  }
}

integration("text continuation keeps the fixed specialist, inherits actual prior text and replays without another round", async () => {
  await create(); const first = await next();
  const request = continueRequest(first);
  const [a, b] = await Promise.all([service.decideAgentWorkspace(request), service.decideAgentWorkspace(request)]);
  assert.equal(a.currentRound, 2); assert.equal(b.currentRound, 2);
  const second = await next();
  assert.equal(second.id, first.id); assert.equal(second.currentRound, 2); assert.equal(second.status, "succeeded");
  assert.equal(second.rounds[0].resultNodeId, first.result.id); assert.equal(second.rounds[1].baseResultNodeId, first.result.id);
  assert.deepEqual(second.steps[1].dependencies, [second.steps[0].key]);
  assert.match(providerCalls[1].appContext.workspaceContribution.dependencies[0].content, /露营清单/);
  assert.equal(second.usage.modelCalls, 2); assert.equal(second.usage.coordinatorTurns, 0);
  assert.equal((await service.decideAgentWorkspace(request)).currentRound, 2);
  await assert.rejects(service.decideAgentWorkspace({ ...request, text: "异参复用" }), code("WORKSPACE_IDEMPOTENCY_CONFLICT"));
  assert.match((await service.getWorkspaceText({ userId: owner, workspaceId: first.id, nodeId: first.result.id })).content, /露营清单/);
});

integration("direct page requires actual preview and confirmation, and saved-page continuation consumes its full document", async () => {
  await create("site-builder"); const first = await next();
  assert.equal(first.status, "awaiting_confirmation"); assert.ok(first.approval);
  const original = (await preview(first.result.id)).document;
  assert.equal((await query("SELECT station_config FROM user_profiles WHERE user_id=?", [owner]))[0].station_config.siteDraftId, undefined);
  const saved = await service.decideAgentWorkspace({ userId: owner, workspaceId: first.id, revision: first.revision, operation: "confirm", approvalId: first.approval.id });
  assert.equal(saved.status, "succeeded");
  await service.decideAgentWorkspace(continueRequest(saved)); const second = await next();
  assert.equal(second.status, "awaiting_confirmation"); assert.equal(second.currentRound, 2);
  assert.deepEqual(pageCalls[1].siteHandoffs[0].document, original);
  assert.notEqual(second.approval.id, first.approval.id); assert.match((await preview(second.result.id)).document.sections[0].body, /第一版露营计划.*急救包/);
  await assert.rejects(service.decideAgentWorkspace({ userId: owner, workspaceId: first.id, revision: second.revision, operation: "confirm", approvalId: first.approval.id }), code("WORKSPACE_APPROVAL_MISMATCH"));
  assert.deepEqual((await preview(first.result.id)).document, original);
});

integration("direct media returns verified retrieval provenance and cannot silently continue through another capability", async () => {
  const { request } = await create("album-manager", { contextRefs: [{ kind: "station-album", id: albumId }] });
  const finished = await next();
  assert.equal(finished.status, "succeeded"); assert.equal(finished.result.kind, "media_selection");
  assert.equal(finished.result.assets[0].id, mediaId); assert.deepEqual(finished.allowedActions, []);
  assert.equal((await service.getWorkspaceMedia({ userId: owner, workspaceId: finished.id, assetId: mediaId })).id, mediaId);
  await assert.rejects(service.decideAgentWorkspace(continueRequest(finished)), code("WORKSPACE_CONTINUATION_UNAVAILABLE"));
  assert.equal((await get(finished)).currentRound, 1);
  await query("UPDATE chat_messages SET recalled_at=CURRENT_TIMESTAMP WHERE id=?", [request.inputMessageId]);
  await assert.rejects(service.getWorkspaceMedia({ userId: owner, workspaceId: finished.id, assetId: mediaId }), code("WORKSPACE_ORIGIN_CHANGED"));
});

integration("changed selected references and revoked historical source block results without deleting committed history", async () => {
  const input = await createInput();
  const { workspace, request } = await create("file-preprocessor", { contextRefs: [{ kind: "chat-message", id: input.inputMessageId }] });
  const first = await next();
  await query("UPDATE chat_messages SET content='Changed selected material' WHERE id=?", [input.inputMessageId]);
  await assert.rejects(service.decideAgentWorkspace(continueRequest(first)), code("AI_CONTEXT_CHANGED"));
  await query("UPDATE chat_messages SET deleted_at=CURRENT_TIMESTAMP WHERE id=?", [request.inputMessageId]);
  await assert.rejects(service.getWorkspaceText({ userId: owner, workspaceId: workspace.id, nodeId: first.result.id }), code("WORKSPACE_ORIGIN_CHANGED"));
  const retained = await get(workspace); assert.equal(retained.status, "succeeded"); assert.equal(retained.result.id, first.result.id);
});
