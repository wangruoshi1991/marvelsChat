import assert from "node:assert/strict";
import test from "node:test";
import { listAgentUserMetrics, mapAgentUserMetrics } from "../src/agent-user-metrics.js";

test("Agent experience uses completed interactions and never fabricates preference matching", () => {
  assert.deepEqual(mapAgentUserMetrics({ successful_conversations: "7", completed_workspace_rounds: "5" }), {
    version: 1, completedInteractions: 12, successfulConversations: 7, completedWorkspaceRounds: 5,
    level: 2, levelProgress: 2, levelTarget: 10, preferenceMatchPercent: null, preferenceMatchStatus: "not_evaluated",
  });
  assert.throws(() => mapAgentUserMetrics({ successful_conversations: -1 }), /invalid/);
  assert.throws(() => mapAgentUserMetrics({ successful_conversations: Number.MAX_SAFE_INTEGER, completed_workspace_rounds: 1 }), /invalid/);
});

test("Agent metric lookup deduplicates requested IDs and maps database results", async () => {
  let calls = 0;
  const result = await listAgentUserMetrics("owner", ["a", "a", "b"], async (_sql, params) => {
    calls += 1;
    assert.deepEqual(params, ["owner", ["a", "b"], "owner", ["a", "b"], ["a", "b"]]);
    return [{ agent_id: "a", successful_conversations: "2", completed_workspace_rounds: "1" },
      { agent_id: "b", successful_conversations: "0", completed_workspace_rounds: "0" }];
  });
  assert.equal(result.get("a").completedInteractions, 3);
  assert.equal(result.get("b").completedInteractions, 0);
  assert.deepEqual(await listAgentUserMetrics("owner", [], async () => { throw Error("unexpected query"); }), new Map());
  assert.equal(calls, 1);
});
