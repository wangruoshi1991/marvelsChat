import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import express from "express";
import { registerAgentWorkspaceRoutes, workspaceActionSchema } from "../src/routes/agent-workspace-routes.js";
import { createRequestErrorHandler } from "../src/request-observability.js";
import { createAgentWorkspaceConfig } from "../src/agent-workspace-config.js";

test("workspace config defines a validated deadline and explicit concurrency bound", () => {
  assert.deepEqual(createAgentWorkspaceConfig({}), { deadlineSeconds: 1200, maxConcurrent: 4 });
  for (const value of ["0", "29", "86401", "", "1.5", "invalid"]) {
    assert.throws(() => createAgentWorkspaceConfig({ AGENT_WORKSPACE_DEADLINE_SECONDS: value }), /AGENT_WORKSPACE_DEADLINE_SECONDS/);
  }
  for (const value of ["0", "21", "", "1.5", "invalid"]) {
    assert.throws(() => createAgentWorkspaceConfig({ AGENT_WORKSPACE_MAX_CONCURRENT: value }), /AGENT_WORKSPACE_MAX_CONCURRENT/);
  }
  assert.equal(createAgentWorkspaceConfig({ AGENT_WORKSPACE_MAX_CONCURRENT: "3" }).maxConcurrent, 3);
  assert.equal(createAgentWorkspaceConfig({ AGENT_WORKSPACE_MAX_CONCURRENT: "20" }).maxConcurrent, 20);
});

test("decisions reject ambiguous or extra operation fields", () => {
  for (const body of [
    { operation: "confirm", revision: 1 }, { operation: "reply", revision: 1 },
    { operation: "cancel", revision: 1, text: "hidden reply" },
    { operation: "reply", revision: 1, text: "ok", approvalId: crypto.randomUUID() },
    { operation: "confirm", revision: 1, approvalId: crypto.randomUUID(), bypass: true },
    { operation: "continue", revision: 1, text: "修改标题" },
    { operation: "continue", revision: 1, idempotencyKey: crypto.randomUUID() },
    { operation: "continue", revision: 1, text: "修改标题", idempotencyKey: "short" },
    { operation: "continue", revision: 1, text: "修改标题", idempotencyKey: "k".repeat(161) },
    { operation: "continue", revision: 1, text: "修改标题", idempotencyKey: crypto.randomUUID(), approvalId: crypto.randomUUID() },
    ...["cancel", "reject", "reply", "confirm"].map(operation => ({ operation, revision: 1, idempotencyKey: crypto.randomUUID(),
      ...(operation === "reply" && { text: "补充说明" }), ...(operation === "confirm" && { approvalId: crypto.randomUUID() }) })),
  ]) assert.equal(workspaceActionSchema.safeParse(body).success, false);
  assert.deepEqual(workspaceActionSchema.parse({ operation: "continue", revision: 7, text: "  修改标题  ", idempotencyKey: "next-round" }),
    { operation: "continue", revision: 7, text: "修改标题", idempotencyKey: "next-round" });
});

test("real HTTP routes reject missing contracts before dispatch, and require document contract on every confirmation", async () => {
  const workspaceId = crypto.randomUUID();
  const nodeId = crypto.randomUUID();
  const owner = crypto.randomUUID();
  const calls = [];
  const app = express();
  app.use(express.json());
  const asyncHandler = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  registerAgentWorkspaceRoutes(app, {
    authenticate(req, _res, next) { req.user = { id: owner }; next(); }, asyncHandler,
    service: {
      async submitAgentWorkspace(args) { calls.push(args); return { id: workspaceId }; },
      async decideAgentWorkspace(args) { calls.push(args); return { id: workspaceId }; },
      async getWorkspaceMedia(args) { calls.push(args); return { id: args.assetId }; },
      async getWorkspaceText(args) { calls.push(args); return { id: args.nodeId, title: "内容", content: "按需鉴权读取的正文" }; },
      async listAgentContributions(args) { calls.push(args); return { contributions: [], hasMore: false, ...(args.pagination ? { nextCursor: null } : {}) }; },
      async getAgentContribution(args) { calls.push(args); return { contribution: null }; },
    },
    repository: { async getAgentWorkspace(args) { calls.push(args); return { id: workspaceId }; }, async listAgentWorkspaces(args) { calls.push(args); return []; } },
  });
  app.use(createRequestErrorHandler({ production: true, logger: { error() {} } }));
  const server = await new Promise(resolve => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, body, headers = {}) => fetch(`${origin}${path}`, {
    method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  try {
    const goal = { goal: "Create a page", idempotencyKey: crypto.randomUUID(), source: { page: "miao", module: null }, contextRefs: [] };
    const decision = { operation: "confirm", revision: 1, approvalId: crypto.randomUUID() };
    for (const headers of [{}, { "X-Miaoxun-AI-Contract": "1" }, ...["1", "2", "3", "4", "5"].map(version => ({ "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": version }))]) {
      for (const [path, body] of [["/api/agent-workspaces", goal], [`/api/agent-workspaces/${workspaceId}`, null],
        [`/api/agent-workspaces/${workspaceId}/text/${nodeId}`, null],
        [`/api/agent-workspaces/${workspaceId}/decision`, decision]]) assert.equal((await request(path, body, headers)).status, 426);
    }
    assert.equal(calls.length, 0);
    const supported = { "X-Miaoxun-AI-Contract": "1", "X-Miaoxun-Agent-Workspace": "6" };
    assert.equal((await request("/api/agent-workspaces", goal, supported)).status, 202);
    assert.equal(calls[0].user.id, owner);
    assert.equal((await request(`/api/agent-workspaces/${workspaceId}/decision`, decision, supported)).status, 426);
    assert.equal(calls.length, 1);
    assert.equal((await request(`/api/agent-workspaces/${workspaceId}/decision`, decision, { ...supported, "X-Miaoxun-Site-Document": "2" })).status, 200);
    assert.equal(calls[1].userId, owner);
    assert.equal((await request("/api/agent-workspaces?limit=999", null, supported)).status, 400);
    assert.equal(calls.length, 2);
    assert.equal((await request(`/api/agent-workspaces/${workspaceId}/text/invalid`, null, supported)).status, 400);
    assert.equal(calls.length, 2);
    const text = await request(`/api/agent-workspaces/${workspaceId}/text/${nodeId}`, null, supported);
    assert.equal(text.status, 200);
    assert.equal((await text.json()).data.content, "按需鉴权读取的正文");
    assert.deepEqual(calls[2], { userId: owner, workspaceId, nodeId });
    const continuation = { operation: "continue", revision: 7, text: "保留内容，调整标题", idempotencyKey: crypto.randomUUID() };
    assert.equal((await request(`/api/agent-workspaces/${workspaceId}/decision`, continuation,
      { ...supported, "X-Miaoxun-Agent-Workspace": "3" })).status, 426);
    assert.equal(calls.length, 3);
    assert.equal((await request(`/api/agent-workspaces/${workspaceId}/decision`, continuation, supported)).status, 200);
    assert.deepEqual(calls[3], { userId: owner, workspaceId, ...continuation });
    assert.equal((await request('/api/agent-workspaces/contributions/site-builder', null, {})).status, 426);
    assert.equal((await request('/api/agent-workspaces/contributions/site-builder', null, supported)).status, 426);
    const contributionHeaders = { ...supported, 'X-Miaoxun-Workspace-Contributions': '2' };
    assert.equal((await request('/api/agent-workspaces/contributions/site-builder', null, { ...contributionHeaders, 'X-Miaoxun-Workspace-Contributions': '1' })).status, 426);
    assert.equal((await request('/api/agent-workspaces/contributions/invalid_agent', null, contributionHeaders)).status, 400);
    const contributions = await request('/api/agent-workspaces/contributions/site-builder', null, contributionHeaders);
    assert.equal(contributions.status, 200);
    assert.deepEqual((await contributions.json()).data, { contributions: [], hasMore: false });
    assert.deepEqual(calls[4], { userId: owner, agentId: 'site-builder', pagination: false });
    const cursor = crypto.randomUUID();
    assert.equal((await request(`/api/agent-workspaces/contributions/site-builder?before=${cursor}`, null, contributionHeaders)).status, 400);
    const pagingHeaders = { ...contributionHeaders, 'X-Miaoxun-Workspace-Contributions': '3' };
    assert.equal((await request(`/api/agent-workspaces/contributions/site-builder?before=${cursor}`, null, pagingHeaders)).status, 200);
    assert.deepEqual(calls[5], { userId: owner, agentId: 'site-builder', before: cursor, pagination: true });
    for (const query of ['before=invalid', `before=${cursor}&before=${nodeId}`, 'limit=200']) {
      assert.equal((await request(`/api/agent-workspaces/contributions/site-builder?${query}`, null, pagingHeaders)).status, 400);
    }
    for (const headers of [contributionHeaders, pagingHeaders]) {
      const item = await request(`/api/agent-workspaces/contributions/site-builder/${nodeId}`, null, headers);
      assert.equal(item.status, 200);
      assert.deepEqual((await item.json()).data, { contribution: null });
    }
    assert.deepEqual(calls.slice(6), Array.from({ length: 2 }, () => ({ userId: owner, agentId: 'site-builder', nodeId })));
  } finally { await new Promise(resolve => server.close(resolve)); }
});
