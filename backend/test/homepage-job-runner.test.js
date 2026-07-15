import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createHomepageJobRunner } = await import("../src/homepage-job-runner.js");

test("job runner requeues stale work and resumes every queued job", async () => {
  const calls = [];
  const runner = createHomepageJobRunner({
    repository: {
      requeueStaleGenerationJobs: async (input) => calls.push(["requeue", input]),
      listQueuedGenerationJobs: async () => [
        { id: "job-1", userId: "user-1" },
        { id: "job-2", userId: "user-2" },
      ],
    },
    service: {
      processGenerationJob: async ({ user, jobId }) => calls.push(["process", user.id, jobId]),
    },
    enabled: () => true,
    now: () => new Date("2026-07-15T05:00:00.000Z"),
    staleAfterMs: 120000,
  });

  await runner.runOnce();

  assert.equal(calls[0][0], "requeue");
  assert.equal(calls[0][1].staleBefore.toISOString(), "2026-07-15T04:58:00.000Z");
  assert.deepEqual(calls.slice(1), [
    ["process", "user-1", "job-1"],
    ["process", "user-2", "job-2"],
  ]);
});

test("disabled job runner does not touch the database", async () => {
  let touched = false;
  const runner = createHomepageJobRunner({
    repository: {
      requeueStaleGenerationJobs: async () => { touched = true; },
      listQueuedGenerationJobs: async () => { touched = true; return []; },
    },
    enabled: () => false,
  });

  await runner.runOnce();
  assert.equal(touched, false);
});
