import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createAvatar3dJobRunner } = await import("../src/avatar-3d-job-runner.js");

test("overlapping runner calls do not overlap and processing jobs resume", async () => {
  let resolveProcess;
  let claims = 0;
  const processed = [];
  const runner = createAvatar3dJobRunner({
    repository: {
      claimNextStep: async () => {
        claims += 1;
        return claims === 1
          ? { id: "job-1", status: "processing_3d", modelProviderTaskId: "task-1" }
          : null;
      },
      listExpiredPrivateAssets: async () => [],
    },
    service: {
      processJob: async (job) => {
        processed.push(job);
        await new Promise((resolve) => { resolveProcess = resolve; });
      },
    },
    storage: { deleteAvatarObjects: async () => {} },
    enabled: () => true,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  const first = runner.runOnce();
  await new Promise((resolve) => setImmediate(resolve));
  await runner.runOnce();
  assert.equal(claims, 1);
  resolveProcess();
  await first;
  assert.equal(processed[0].modelProviderTaskId, "task-1");
});

test("cleanup deletes OSS first and leaves failed records retryable", async () => {
  const calls = [];
  let shouldFail = true;
  const repository = {
    claimNextStep: async () => null,
    listExpiredPrivateAssets: async () => [{
      asset_kind: "photo_source",
      asset_id: "photo-1",
      storage_key: "users/u/avatar-3d/photos/p/source.jpg",
    }],
    markPrivateAssetDeleted: async (input) => calls.push(["mark", input]),
  };
  const runner = createAvatar3dJobRunner({
    repository,
    service: { processJob: async () => {} },
    storage: {
      deleteAvatarObjects: async () => {
        calls.push(["delete"]);
        if (shouldFail) throw new Error("storage unavailable");
      },
    },
    enabled: () => true,
    now: () => new Date("2026-07-17T02:00:00.000Z"),
    logger: { error: () => {} },
  });

  await runner.runOnce();
  assert.deepEqual(calls, [["delete"]]);

  shouldFail = false;
  await runner.runCleanup();
  assert.deepEqual(calls.map((call) => call[0]), ["delete", "delete", "mark"]);
});
