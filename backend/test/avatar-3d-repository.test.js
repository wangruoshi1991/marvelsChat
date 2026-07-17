import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createAvatar3dRepository } = await import("../src/avatar-3d-repository.js");
const {
  mapAvatar3dJob,
  mapAvatar3dModel,
  mapAvatar3dStylePreview,
} = await import("../src/repository-mappers.js");

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  job: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  preview: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  model: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
};

const jobRow = {
  id: ids.job,
  user_id: ids.user,
  idempotency_key_hash: "a".repeat(64),
  style: "realistic",
  status: "queued_3d",
  progress: 0,
  photo_count: 1,
  accepted_cost_version: "2026-07-17",
  estimated_cost_fen: 210,
  style_provider_task_id: null,
  model_provider_task_id: "provider-task-private",
  style_preview_id: null,
  model_id: null,
  safe_error_code: null,
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:00:00.000Z",
  finished_at: null,
};

test("createJob is idempotent per user and key hash", async () => {
  const calls = [];
  const responses = [[jobRow]];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return responses.shift() || [];
    },
    randomUUID: () => ids.job,
  });

  const first = await repository.createJob({
    userId: ids.user,
    idempotencyKeyHash: "a".repeat(64),
    style: "realistic",
    photoIds: ["11111111-1111-4111-8111-111111111111"],
    acceptedCostVersion: "2026-07-17",
    estimatedCostFen: 210,
  });

  assert.equal(first.created, true);
  assert.equal(first.job.id, ids.job);
  assert.match(calls[0].sql, /ON CONFLICT \(user_id, idempotency_key_hash\) DO NOTHING/);
  assert.equal(JSON.stringify(first).includes("provider-task-private"), false);

  const retryResponses = [[], [jobRow]];
  const retryRepository = createAvatar3dRepository({
    queryFn: async () => retryResponses.shift() || [],
    randomUUID: () => "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  });
  const retry = await retryRepository.createJob({
    userId: ids.user,
    idempotencyKeyHash: "a".repeat(64),
    style: "realistic",
    photoIds: ["11111111-1111-4111-8111-111111111111"],
    acceptedCostVersion: "2026-07-17",
    estimatedCostFen: 210,
  });

  assert.equal(retry.created, false);
  assert.equal(retry.job.id, ids.job);
});

test("claimNextStep uses a non-overlapping database claim", async () => {
  const calls = [];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [jobRow];
    },
  });

  const claimed = await repository.claimNextStep({ staleBefore: new Date("2026-07-17T00:00:00Z") });

  assert.equal(claimed.id, ids.job);
  assert.match(calls[0].sql, /FOR UPDATE SKIP LOCKED/);
  assert.match(calls[0].sql, /claimed_at IS NULL OR claimed_at < \?/);
});

test("transitionJob rejects an illegal state transition", async () => {
  const repository = createAvatar3dRepository({ queryFn: async () => [] });

  await assert.rejects(
    () => repository.transitionJob({
      userId: ids.user,
      jobId: ids.job,
      fromStatus: "queued_3d",
      toStatus: "succeeded",
    }),
    (error) => error?.status === 409 && error?.details?.code === "ILLEGAL_JOB_TRANSITION",
  );
});

test("public job, preview, and model projections never expose private identifiers", () => {
  const publicJob = mapAvatar3dJob(jobRow);
  const publicPreview = mapAvatar3dStylePreview({
    id: ids.preview,
    user_id: ids.user,
    job_id: ids.job,
    storage_key: "users/private/preview.jpg",
    provider_task_id: "wanx-private",
    status: "active",
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  });
  const publicModel = mapAvatar3dModel({
    id: ids.model,
    user_id: ids.user,
    job_id: ids.job,
    title: "我的 3D 形象",
    glb_storage_key: "users/private/model.glb",
    thumbnail_storage_key: "users/private/thumb.jpg",
    provider_task_id: "tripo-private",
    glb_byte_size: 1024,
    thumbnail_byte_size: 128,
    status: "active",
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  });

  const serialized = JSON.stringify({ publicJob, publicPreview, publicModel });
  for (const privateValue of [
    "provider-task-private",
    "wanx-private",
    "tripo-private",
    "users/private",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(publicModel.thumbnailAvailable, true);
});

test("expired private assets query excludes non-terminal jobs", async () => {
  const calls = [];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [];
    },
  });

  await repository.listExpiredPrivateAssets({ before: new Date("2026-07-24T00:00:00Z"), limit: 50 });

  assert.match(calls[0].sql, /j\.status IN \('succeeded', 'failed', 'cancelled', 'submission_unknown'\)/);
  assert.doesNotMatch(calls[0].sql, /avatar_3d_models/);
  assert.deepEqual(calls[0].params, [new Date("2026-07-24T00:00:00Z")]);
});
