import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createAgentWorkspaceService } from '../src/agent-workspace-service.js';

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
  assert.deepEqual(await service.listAgentContributions({ userId, agentId: 'album-manager' }), { contributions: [], hasMore: false });
  assert.equal(transactions, 2);
  assert.deepEqual(reads, [{ userId, workspaceId: workspaceA }, { userId, workspaceId: workspaceB }]);
});
