import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";
import * as contract from "../src/ai-client-contract.js";
import { createAITaskRepository } from "../src/ai-task-repository.js";

test("comic contract is additive and requires an explicit dedicated version", () => {
  assert.equal(contract.aiClientContracts.aiTasks, 1);
  assert.equal(contract.aiClientContracts.comicRenders, 1);
  for (const version of [undefined, "", "0", "2", "1, 2"]) {
    assert.throws(() => contract.requireComicRenderContract({ get: () => version }), e =>
      e.status === 426 && e.details.code === "COMIC_RENDER_CLIENT_UPDATE_REQUIRED");
  }
  let next = false;
  contract.requireComicRenderContract({ get: name => name === "X-Miaoxun-Comic-Renders" ? "1" : undefined }, null, () => { next = true; });
  assert.equal(next, true);
});

test("all legacy public task paths filter contract v1 and legacy kinds in SQL", async () => {
  const statements = [];
  const query = async sql => {
    statements.push(sql);
    assert.match(sql, /contract_version = 1/);
    assert.match(sql, /kind IN \('agent_message', 'site_draft'\)/);
    return [];
  };
  const repository = createAITaskRepository({ query, withTransaction: work => work({ query }) });
  const args = { userId: crypto.randomUUID(), taskId: crypto.randomUUID() };
  assert.equal(await repository.getAITask(args), null);
  assert.deepEqual(await repository.listAITasks(args), []);
  assert.equal(await repository.getAITaskByKey({ ...args, kind: "site_draft", agentId: "site-builder", idempotencyKey: "owner-key" }), null);
  await assert.rejects(repository.listAITaskEvents(args), e => e.status === 404);
  await assert.rejects(repository.mutateAITask({ ...args, revision: 1, operation: "cancel" }), e => e.status === 404);
  assert.equal(statements.length, 5);
});

test("legacy list and idempotency lookup reject comic kinds before database access", async () => {
  const repository = createAITaskRepository({ query: () => assert.fail("query must not run") });
  await assert.rejects(repository.listAITasks({ userId: crypto.randomUUID(), kind: "comic_render" }), e => e.name === "ZodError");
  await assert.rejects(repository.getAITaskByKey({ userId: crypto.randomUUID(), kind: "comic_render" }), e => e.name === "ZodError");
});
