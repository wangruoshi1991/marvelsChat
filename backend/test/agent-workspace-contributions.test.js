import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createAgentWorkspaceService } from '../src/agent-workspace-service.js';
import { HttpError } from '../src/http-error.js';

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
