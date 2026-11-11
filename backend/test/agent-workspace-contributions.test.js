import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createAgentWorkspaceService } from '../src/agent-workspace-service.js';
import { HttpError } from '../src/http-error.js';
import { getAgent } from '../../agents/registry.js';
import { listExecutableWorkspaceCapabilities } from '../src/agent-workspace-capabilities.js';

test('contribution reads batch nodes by owned workspace and bound query by owner and agent', async () => {
  const userId = crypto.randomUUID();
  const workspaceA = crypto.randomUUID();
  const workspaceB = crypto.randomUUID();
  const rows = [
    { id: crypto.randomUUID(), workspace_id: workspaceA },
    { id: crypto.randomUUID(), workspace_id: workspaceB },
    { id: crypto.randomUUID(), workspace_id: workspaceA },
  ];
  const reads = [];
  let transactions = 0;
  const service = createAgentWorkspaceService({
    query: async (sql, args) => {
      assert.match(sql, /WHERE user_id = \? AND agent_id = \?/);
      assert.match(sql, /LIMIT 51/);
      assert.deepEqual(args, [userId, 'album-manager']);
      return rows;
    },
    transaction: async work => { transactions++; return work({}); },
    repo: { async readOwnedWorkspaceRecord(_connection, args) {
      reads.push(args);
      return { nodes: [] };
    } },
  });
  assert.deepEqual(await service.listAgentContributions({ userId, agentId: 'album-manager' }), {
    contributions: rows.map(({ id }) => ({ unavailable: true, id })), hasMore: false, nextCursor: null,
  });
  assert.equal(transactions, 2);
  assert.deepEqual(reads, [{ userId, workspaceId: workspaceA }, { userId, workspaceId: workspaceB }]);
});

test('a workspace removed during authorization retains unavailable page positions', async () => {
  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const rows = Array.from({ length: 51 }, () => ({ id: crypto.randomUUID(), workspace_id: workspaceId }));
  const service = createAgentWorkspaceService({
    query: async () => rows,
    transaction: async work => work({}),
    repo: { async readOwnedWorkspaceRecord() { throw new HttpError(404, 'workspace unavailable'); } },
  });
  const page = await service.listAgentContributions({ userId, agentId: 'album-manager' });
  assert.deepEqual(page.contributions, rows.slice(0, 50).map(({ id }) => ({ unavailable: true, id })));
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, page.contributions.at(-1).id);
});

test('a missing or foreign cursor is rejected instead of returning a partial page', async () => {
  const userId = crypto.randomUUID();
  const cursor = crypto.randomUUID();
  const service = createAgentWorkspaceService({ query: async (_sql, args) => {
    assert.ok(args.includes(userId));
    assert.ok(args.includes('album-manager'));
    assert.ok(args.includes(cursor));
    return [];
  } });
  await assert.rejects(service.listAgentContributions({ userId, agentId: 'album-manager', before: cursor }),
    error => error.status === 404 && error.details?.code === 'WORKSPACE_CONTRIBUTION_CURSOR_INVALID');
});

test('exactly 50 contribution rows do not advertise a next page', async () => {
  const userId = crypto.randomUUID();
  const workspaceId = crypto.randomUUID();
  const rows = Array.from({ length: 50 }, () => ({ id: crypto.randomUUID(), workspace_id: workspaceId }));
  const service = createAgentWorkspaceService({
    query: async () => rows,
    transaction: async work => work({}),
    repo: { async readOwnedWorkspaceRecord() { return { nodes: [] }; } },
  });
  const page = await service.listAgentContributions({ userId, agentId: 'album-manager' });
  assert.equal(page.contributions.length, 50);
  assert.equal(page.hasMore, false);
  assert.equal(page.nextCursor, null);
});

test('contract 4 classifies guarded failures without disclosing results or changing exact-read errors', async () => {
  const userId = crypto.randomUUID(), workspaceId = crypto.randomUUID(), nodeId = crypto.randomUUID();
  const agent = await getAgent('miaoxun-butler');
  const declaration = listExecutableWorkspaceCapabilities({ registeredAgents: [agent],
    grants: [{ agentId: agent.key, enabled: true, grantedScopes: agent.permissions }] })[0];
  const node = { id: nodeId, agentId: agent.key, agentVersion: agent.version,
    capability: declaration.capability, status: 'queued', contextRefIndexes: [] };
  for (const [scenario, status, code, reason] of [
    ['authorization', 403, 'WORKSPACE_ACCESS_REVOKED', 'authorization'],
    ['source', 404, 'AI_CONTEXT_NOT_FOUND', 'source'],
    ['version', 409, 'WORKSPACE_AGENT_CHANGED', 'version'],
    ['capability', 403, 'WORKSPACE_ACCESS_REVOKED', 'unavailable'],
    ['account', 403, 'WORKSPACE_ACCESS_REVOKED', 'unavailable'],
    ['scope', 403, 'AI_CONTEXT_SCOPE_REQUIRED', 'unavailable'],
  ]) {
    const workspace = { id: workspaceId, userId, revision: 1, executionMode: 'coordinated',
      goal: 'Protected goal must not appear in unavailable items', currentRound: 1,
      coordinatorVersion: scenario === 'version' ? '0.0.0' : agent.version,
      contextRefs: ['source', 'scope'].includes(scenario) ? [{ kind: 'chat-message', id: crypto.randomUUID() }] : [],
      authority: { coordinator: { scopes: scenario === 'scope' ? agent.permissions.filter(scope => scope !== 'messages:read') : agent.permissions },
        capabilities: scenario === 'capability' ? [] : [declaration] },
      nodes: [node], steps: [node] };
    const connection = { async query(sql) {
      if (sql.includes('SELECT workspace_id FROM agent_workspace_nodes')) return [{ workspace_id: workspaceId }];
      if (sql.includes('FROM users')) return [{ id: userId, status: scenario === 'account' ? 'disabled' : 'active' }];
      if (sql.includes('FROM user_agents')) return [{ agent_id: agent.key, enabled: scenario !== 'authorization', granted_scopes: agent.permissions }];
      if (sql.includes('FROM chat_messages')) return [];
      throw new Error('Unexpected isolated contribution query');
    } };
    const service = createAgentWorkspaceService({ query: async () => [{ id: nodeId, workspace_id: workspaceId }],
      transaction: async work => work(connection), repo: { readOwnedWorkspaceRecord: async () => workspace },
      loadAgent: async key => key === agent.key ? agent : null, loadAgents: async () => [agent] });
    const page = await service.listAgentContributions({ userId, agentId: agent.key, includeUnavailableReasons: true });
    assert.deepEqual(page, { contributions: [{ unavailable: true, id: nodeId, reason }], hasMore: false, nextCursor: null }, scenario);
    const legacy = await service.listAgentContributions({ userId, agentId: agent.key });
    assert.deepEqual(legacy.contributions, [{ unavailable: true, id: nodeId }], scenario);
    await assert.rejects(service.getAgentContribution({ userId, agentId: agent.key, nodeId }), error => {
      assert.equal(error.status, status, scenario);
      assert.deepEqual(error.details, { code }, scenario);
      return true;
    });
  }
});

test('contract 4 preserves unavailable page positions and classifies a removed workspace as source', async () => {
  const userId = crypto.randomUUID(), workspaceId = crypto.randomUUID();
  const rows = Array.from({ length: 51 }, () => ({ id: crypto.randomUUID(), workspace_id: workspaceId }));
  const service = createAgentWorkspaceService({ query: async () => rows,
    transaction: async work => work({}),
    repo: { async readOwnedWorkspaceRecord() { throw new HttpError(404, 'Protected unavailable task'); } } });
  const page = await service.listAgentContributions({ userId, agentId: 'comic-diary', includeUnavailableReasons: true });
  assert.deepEqual(page.contributions, rows.slice(0, 50).map(({ id }) => ({ unavailable: true, id, reason: 'source' })));
  assert.equal(page.hasMore, true);
  assert.equal(page.nextCursor, rows[49].id);
});

test('comic historical nodes distinguish grants, product unavailability and changed Agent versions', async () => {
  const userId = crypto.randomUUID(), workspaceId = crypto.randomUUID(), nodeId = crypto.randomUUID();
  const butler = await getAgent('miaoxun-butler'), comic = await getAgent('comic-diary');
  const declaration = listExecutableWorkspaceCapabilities({ registeredAgents: [comic],
    grants: [{ agentId: comic.key, enabled: true, grantedScopes: comic.permissions }] })[0];
  for (const executionMode of ['coordinated', 'direct']) for (const completed of [false, true]) {
    for (const scenario of ['authorization', 'version', 'product']) {
      const changedVersion = scenario === 'version';
      const node = { id: nodeId, key: 'comic', agentId: comic.key, agentVersion: comic.version,
        capability: declaration.capability, status: completed ? 'succeeded' : 'queued', contextRefIndexes: [],
        result: completed ? { artifact: { kind: 'text_result', title: 'Private title', content: 'Private body' }, sourceReferences: [] } : null };
      const inputMessageId = crypto.randomUUID();
      const workspace = { id: workspaceId, userId, revision: 1, executionMode,
        status: completed ? 'succeeded' : 'queued', goal: 'Private historical goal', currentRound: 1,
        coordinatorVersion: butler.version, contextRefs: [],
        origin: { kind: 'agent_conversation', threadId: crypto.randomUUID(), inputMessageId,
          agentId: comic.key, agentVersion: comic.version, capability: declaration.capability },
        input: { requestMessageIds: [inputMessageId], requestMessagesHash: 'a'.repeat(64) },
        authority: { coordinator: { scopes: butler.permissions }, capabilities: [declaration] }, nodes: [node], steps: [node] };
      const connection = { async query(sql) {
        if (sql.includes('SELECT workspace_id FROM agent_workspace_nodes')) return [{ workspace_id: workspaceId }];
        if (sql.includes('FROM users')) return [{ id: userId, status: 'active' }];
        if (sql.includes('FROM user_agents')) return [
          { agent_id: butler.key, enabled: true, granted_scopes: butler.permissions },
          { agent_id: comic.key, enabled: scenario === 'product', granted_scopes: comic.permissions },
        ];
        if (sql.includes('FROM user_entitlements')) return [];
        throw new Error('Unexpected isolated comic query');
      } };
      const currentComic = changedVersion ? { ...comic, version: '99.0.0' } : comic;
      const service = createAgentWorkspaceService({ query: async () => [{ id: nodeId, workspace_id: workspaceId }],
        transaction: async work => work(connection), repo: { readOwnedWorkspaceRecord: async () => workspace },
        loadAgent: async key => key === butler.key ? butler : currentComic,
        loadAgents: async () => [butler, currentComic] });
      const result = await service.listAgentContributions({ userId, agentId: comic.key, includeUnavailableReasons: true });
      assert.deepEqual(result.contributions, [{ unavailable: true, id: nodeId, reason: scenario === 'product' ? 'unavailable' : scenario }]);
      const expected = executionMode === 'direct' && changedVersion ? [409, 'WORKSPACE_AGENT_CHANGED'] : [403, 'WORKSPACE_ACCESS_REVOKED'];
      await assert.rejects(service.getAgentContribution({ userId, agentId: comic.key, nodeId }), error =>
        error.status === expected[0] && JSON.stringify(error.details) === JSON.stringify({ code: expected[1] }));
    }
  }
});
