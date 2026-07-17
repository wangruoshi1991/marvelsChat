import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/http-error.js";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createAvatar3dLifecycleService } = await import("../src/avatar-3d-lifecycle-service.js");

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  job: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  photo: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  preview: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  model: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};

const runtime = {
  enabled: true,
  requireAllowlist: true,
  allowlist: [ids.user],
  dailyLimit: 3,
  retentionDays: 7,
  costVersion: "2026-07-17",
  realisticEstimatedCostFen: 210,
  cartoonEstimatedCostFen: 224,
  providerReady: true,
};

const privatePhoto = {
  id: ids.photo,
  userId: ids.user,
  view: "front",
  status: "ready",
  normalizedStorageKey: `users/${ids.user}/avatar-3d/photos/${ids.photo}/normalized.jpg`,
  normalizedMimeType: "image/jpeg",
};

function createStatefulRepository(style) {
  const calls = [];
  let job = {
    id: ids.job,
    userId: ids.user,
    style,
    status: style === "cartoon" ? "queued_style" : "queued_3d",
    progress: 0,
    photoCount: 1,
    styleProviderTaskId: null,
    modelProviderTaskId: null,
    stylePreviewId: null,
    modelId: null,
  };
  let preview = null;
  let model = null;
  return {
    calls,
    currentJob: () => ({ ...job }),
    repository: {
      getQuotaState: async () => ({ dailyUsed: 0, hasActiveJob: false }),
      createJobWithPhotos: async (input) => {
        calls.push(["createJobWithPhotos", input]);
        return { created: true, job: { ...job } };
      },
      getJob: async () => ({ ...job }),
      listJobs: async () => [{ ...job }],
      listModels: async () => model ? [model] : [],
      listJobPhotos: async () => [privatePhoto],
      transitionJob: async (input) => {
        calls.push(["transition", input.fromStatus, input.toStatus]);
        if (job.status !== input.fromStatus) {
          throw new HttpError(409, "state conflict", { code: "JOB_STATE_CONFLICT" });
        }
        job = {
          ...job,
          status: input.toStatus,
          progress: input.progress ?? job.progress,
          styleProviderTaskId: input.styleProviderTaskId ?? job.styleProviderTaskId,
          modelProviderTaskId: input.modelProviderTaskId ?? job.modelProviderTaskId,
          stylePreviewId: input.stylePreviewId ?? job.stylePreviewId,
          modelId: input.modelId ?? job.modelId,
          errorCode: input.safeErrorCode ?? null,
        };
        return { ...job };
      },
      updateJobProgress: async (input) => {
        calls.push(["progress", input.status, input.progress]);
        job = {
          ...job,
          progress: input.progress ?? job.progress,
          styleProviderTaskId: input.styleProviderTaskId ?? job.styleProviderTaskId,
          modelProviderTaskId: input.modelProviderTaskId ?? job.modelProviderTaskId,
        };
        return { ...job };
      },
      createStylePreview: async (input) => {
        preview = { id: ids.preview, jobId: ids.job, status: "active", ...input };
        calls.push(["createStylePreview", input.jobId]);
        return preview;
      },
      getStylePreview: async () => preview,
      discardStylePreview: async () => { preview = { ...preview, status: "discarded" }; },
      createModel: async (input) => {
        model = { id: ids.model, jobId: ids.job, title: input.title, status: "active" };
        calls.push(["createModel", input.jobId]);
        return model;
      },
      getModel: async () => model,
      markJobAssetsRetention: async (input) => calls.push(["retention", input.jobId]),
      releaseJobClaim: async () => {},
    },
  };
}

test("realistic lifecycle submits Tripo once, polls, persists GLB, and succeeds", async () => {
  const state = createStatefulRepository("realistic");
  let submitCalls = 0;
  let pollCalls = 0;
  const service = createAvatar3dLifecycleService({
    repository: state.repository,
    storage: {
      createProviderReadUrl: ({ objectKey }) => `https://signed.example/${objectKey}`,
      persistAvatarProviderResult: async () => ({
        glb: { storageKey: "users/u/avatar-3d/jobs/j/model.glb", contentType: "model/gltf-binary", byteSize: 1200 },
        thumbnail: null,
      }),
    },
    tripo: {
      submitTripoJob: async ({ photos }) => {
        submitCalls += 1;
        assert.equal(photos.length, 1);
        return { state: "processing", taskId: "tripo-task", providerStatus: "PENDING", progress: 10 };
      },
      fetchTripoJob: async () => {
        pollCalls += 1;
        return {
          state: "succeeded",
          taskId: "tripo-task",
          providerStatus: "SUCCEEDED",
          progress: 100,
          pbrModelUrl: "https://result.example/model.glb",
          renderedImageUrl: null,
        };
      },
    },
    wanx: {},
    runtime,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  await service.createJob({
    user: { id: ids.user, email: "person@example.com" },
    body: {
      style: "realistic",
      photos: [{ photoId: ids.photo, view: "front" }],
      acceptedPhotoRights: true,
      acceptedCostVersion: "2026-07-17",
    },
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });
  await service.processJob(state.currentJob());
  assert.equal(state.currentJob().status, "processing_3d");
  await service.processJob(state.currentJob());

  assert.equal(state.currentJob().status, "succeeded");
  assert.equal(submitCalls, 1);
  assert.equal(pollCalls, 1);
  assert.equal(state.calls.filter((call) => call[0] === "createModel").length, 1);
});

test("cartoon lifecycle stops for confirmation and submits Tripo only after acceptance", async () => {
  const state = createStatefulRepository("cartoon");
  let wanxSubmits = 0;
  let tripoSubmits = 0;
  const service = createAvatar3dLifecycleService({
    repository: state.repository,
    storage: {
      createProviderReadUrl: ({ objectKey }) => `https://signed.example/${objectKey}`,
      persistAvatarStylePreview: async () => ({
        storageKey: "users/u/avatar-3d/jobs/j/style-preview.jpg",
        contentType: "image/jpeg",
        byteSize: 500,
        width: 1024,
        height: 1024,
      }),
    },
    wanx: {
      submitWanxStyleJob: async () => {
        wanxSubmits += 1;
        return { state: "processing", taskId: "wanx-task", providerStatus: "PENDING", progress: 10 };
      },
      fetchWanxStyleJob: async () => ({
        state: "succeeded",
        taskId: "wanx-task",
        providerStatus: "SUCCEEDED",
        progress: 100,
        imageUrl: "https://result.example/style.png",
      }),
    },
    tripo: {
      submitTripoJob: async ({ photos }) => {
        tripoSubmits += 1;
        assert.equal(photos[0].url.includes("style-preview.jpg"), true);
        return { state: "processing", taskId: "tripo-task", providerStatus: "PENDING", progress: 10 };
      },
    },
    runtime,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  await service.processJob(state.currentJob());
  await service.processJob(state.currentJob());
  assert.equal(state.currentJob().status, "awaiting_style_confirmation");
  assert.equal(wanxSubmits, 1);
  assert.equal(tripoSubmits, 0);

  await service.confirmStyle({ user: { id: ids.user }, jobId: ids.job });
  await service.confirmStyle({ user: { id: ids.user }, jobId: ids.job });
  assert.equal(state.currentJob().status, "queued_3d");
  assert.equal(tripoSubmits, 0);

  await service.processJob(state.currentJob());
  assert.equal(tripoSubmits, 1);
  assert.equal(state.currentJob().status, "processing_3d");
});

test("unknown Tripo submission becomes terminal and is never resubmitted", async () => {
  const state = createStatefulRepository("realistic");
  let submitCalls = 0;
  const service = createAvatar3dLifecycleService({
    repository: state.repository,
    storage: {
      createProviderReadUrl: () => "https://signed.example/front.jpg",
    },
    tripo: {
      submitTripoJob: async () => {
        submitCalls += 1;
        throw new HttpError(502, "unknown", { code: "TRIPO_SUBMISSION_UNKNOWN" });
      },
    },
    wanx: {},
    runtime,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  await service.processJob(state.currentJob());
  assert.equal(state.currentJob().status, "submission_unknown");
  await service.processJob(state.currentJob());
  assert.equal(submitCalls, 1);
});

test("repeated photo completion never exposes private storage keys", async () => {
  const service = createAvatar3dLifecycleService({
    repository: {
      getPhoto: async ({ includePrivate }) => includePrivate
        ? { ...privatePhoto, jobId: null, sourceStorageKey: "users/private/source.jpg" }
        : { id: ids.photo, status: "ready", jobId: null },
    },
    storage: {},
    tripo: {},
    wanx: {},
    runtime,
  });

  const result = await service.completePhotoUpload({
    user: { id: ids.user, email: "person@example.com" },
    photoId: ids.photo,
  });

  assert.equal(result.status, "ready");
  assert.equal(result.sourceStorageKey, undefined);
  assert.equal(result.normalizedStorageKey, undefined);
});
