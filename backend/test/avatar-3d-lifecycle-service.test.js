import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../src/http-error.js";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createAvatar3dLifecycleService } = await import("../src/avatar-3d-lifecycle-service.js");
const { createAvatar3dProviderRegistry } = await import("../src/avatar-3d-provider-registry.js");

const providersForTripo = (tripo) => createAvatar3dProviderRegistry({ tripo });

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  job: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  photo: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  preview: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  model: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  referenceSet: "ffffffff-ffff-4fff-8fff-ffffffffffff",
};

const runtime = {
  enabled: true,
  requireAllowlist: true,
  allowlist: [ids.user],
  dailyLimit: 3,
  retentionDays: 7,
  costVersion: "2026-07-21",
  qualityCostsFen: { standard: 280, ultra: 420 },
  providerReady: true,
  referenceGenerationEstimatedCostFen: 200,
};

const privatePhoto = {
  id: ids.photo,
  userId: ids.user,
  view: "front",
  status: "ready",
  normalizedStorageKey: `users/${ids.user}/avatar-3d/photos/${ids.photo}/normalized.jpg`,
  normalizedMimeType: "image/jpeg",
};

function createConfirmedJobRepository({ modelProvider = "tripo" } = {}) {
  const calls = [];
  let job = {
    id: ids.job,
    userId: ids.user,
    style: "realistic",
    generationMode: "face_first_multiview",
    referenceSetId: ids.referenceSet,
    modelProvider,
    qualityPreset: "standard",
    geometryQuality: "standard",
    textureQuality: "standard",
    status: "queued_3d",
    progress: 0,
    photoCount: 1,
    modelProviderTaskId: null,
    modelId: null,
  };
  let model = null;
  return {
    calls,
    currentJob: () => ({ ...job }),
    repository: {
      getQuotaState: async () => ({ dailyUsed: 0, hasActiveJob: false }),
      getJob: async () => ({ ...job }),
      listJobs: async () => [{ ...job }],
      listModels: async () => model ? [model] : [],
      getReferenceSetForJob: async () => ({
        id: ids.referenceSet,
        jobId: ids.job,
        status: "accepted",
      }),
      listReferenceImages: async () => ["front", "left", "back", "right"].map(
        (view, sequenceIndex) => ({
          id: `reference-${view}`,
          view,
          sequenceIndex,
          storageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/references/${view}.jpg`,
        }),
      ),
      transitionJob: async (input) => {
        calls.push(["transition", input.fromStatus, input.toStatus]);
        if (job.status !== input.fromStatus) {
          throw new HttpError(409, "state conflict", { code: "JOB_STATE_CONFLICT" });
        }
        job = {
          ...job,
          status: input.toStatus,
          progress: input.progress ?? job.progress,
          modelProviderTaskId: input.modelProviderTaskId ?? job.modelProviderTaskId,
          providerStatus: input.providerStatus ?? job.providerStatus,
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
          modelProviderTaskId: input.modelProviderTaskId ?? job.modelProviderTaskId,
        };
        return { ...job };
      },
      createPreparingModel: async (input) => {
        if (model?.status === "active") return model;
        model = {
          id: ids.model,
          jobId: ids.job,
          title: input.title,
          status: "preparing",
          thumbnailAvailable: Boolean(input.thumbnail),
          interactiveAvailable: false,
          glbStorageKey: null,
        };
        calls.push(["createPreparingModel", input]);
        return model;
      },
      completePreparingModel: async (input) => {
        model = {
          ...model,
          status: "active",
          interactiveAvailable: true,
          glbStorageKey: input.glb.storageKey,
          mobileGlbStorageKey: input.glb.mobile.storageKey,
        };
        calls.push(["completePreparingModel", input]);
        return model;
      },
      getJobModel: async () => model,
      getModel: async () => model,
      markJobAssetsRetention: async (input) => calls.push(["retention", input.jobId]),
      releaseJobClaim: async () => {},
    },
  };
}

test("confirmed four-view lifecycle exposes the thumbnail before persisting GLB and then succeeds", async () => {
  const state = createConfirmedJobRepository();
  let submitCalls = 0;
  let pollCalls = 0;
  const service = createAvatar3dLifecycleService({
    repository: state.repository,
    storage: {
      createProviderReadUrl: ({ objectKey }) => `https://signed.example/${objectKey}`,
      persistAvatarProviderThumbnail: async () => {
        state.calls.push(["persistThumbnail"]);
        return {
          storageKey: "users/u/avatar-3d/jobs/j/thumbnail.jpg",
          contentType: "image/jpeg",
          byteSize: 120,
        };
      },
      persistAvatarProviderModel: async () => {
        state.calls.push(["persistModel"]);
        return {
          storageKey: "users/u/avatar-3d/jobs/j/model.glb",
          contentType: "model/gltf-binary",
          byteSize: 1200,
          mobile: {
            storageKey: "users/u/avatar-3d/jobs/j/model-mobile.glb",
            contentType: "model/gltf-binary",
            byteSize: 240,
          },
        };
      },
    },
    providers: providersForTripo({
      submit: async ({ photos }) => {
        submitCalls += 1;
        assert.equal(photos.length, 4);
        return { state: "processing", taskId: "tripo-task", providerStatus: "PENDING", progress: 10 };
      },
      fetch: async () => {
        pollCalls += 1;
        return {
          state: "succeeded",
          taskId: "tripo-task",
          providerStatus: "SUCCEEDED",
          progress: 100,
          pbrModelUrl: "https://result.example/model.glb",
          renderedImageUrl: "https://result.example/preview.webp",
        };
      },
    }),
    runtime,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  await service.processJob(state.currentJob());
  assert.equal(state.currentJob().status, "processing_3d");
  await service.processJob(state.currentJob());
  assert.equal(state.currentJob().status, "persisting");
  assert.equal(state.currentJob().modelId, ids.model);
  assert.equal(state.currentJob().providerStatus, "SUCCEEDED");
  assert.equal(state.calls.filter((call) => call[0] === "persistModel").length, 0);
  assert.deepEqual(
    state.calls
      .filter((call) => ["persistThumbnail", "createPreparingModel", "transition"].includes(call[0]))
      .slice(-3)
      .map((call) => call[0] === "transition" ? `${call[1]}:${call[2]}` : call[0]),
    ["persistThumbnail", "createPreparingModel", "processing_3d:persisting"],
  );

  await service.processJob(state.currentJob());

  assert.equal(state.currentJob().status, "succeeded");
  assert.equal(submitCalls, 1);
  assert.equal(pollCalls, 2);
  assert.equal(state.calls.filter((call) => call[0] === "createPreparingModel").length, 1);
  assert.equal(state.calls.filter((call) => call[0] === "completePreparingModel").length, 1);
});

test("face-first job creation plans one private Wan request without calling a Provider", async () => {
  const calls = [];
  let wanCalls = 0;
  const service = createAvatar3dLifecycleService({
    repository: {
      createFaceFirstJob: async (input) => {
        calls.push(input);
        return {
          created: true,
          job: {
            id: ids.job,
            status: "queued_references",
            generationMode: "face_first_multiview",
            referenceSetId: ids.referenceSet,
          },
          referenceSet: { id: ids.referenceSet, status: "queued" },
        };
      },
    },
    storage: {},
    wanMultiview: {
      submitWanMultiviewJob: async () => { wanCalls += 1; },
      fetchWanMultiviewJob: async () => { wanCalls += 1; },
    },
    wanx: {},
    runtime,
  });

  const result = await service.createJob({
    user: { id: ids.user, email: "person@example.com" },
    body: {
      generationMode: "face_first_multiview",
      photoId: ids.photo,
      bodyShape: "athletic",
      pose: "natural",
      outfit: "sport",
      userDescription: "蓝白色运动套装",
      qualityPreset: "ultra",
      acceptedPhotoRights: true,
      acceptedAdultSubject: true,
      acceptedFaceCompletion: true,
      acceptedReferenceCostVersion: "2026-07-21",
    },
    idempotencyKey: "11111111-1111-4111-8111-111111111111",
  });

  assert.equal(result.job.status, "queued_references");
  assert.equal(wanCalls, 0);
  assert.equal(calls[0].sourcePhotoId, ids.photo);
  assert.equal(calls[0].referenceEstimatedCostFen, 200);
  assert.equal(calls[0].acceptedAdultSubject, true);
  assert.match(calls[0].promptPlan.providerPrompt, /正面、左侧、背面、右侧/);
  assert.equal(JSON.stringify(result).includes("providerPrompt"), false);
});

test("face-first lifecycle persists four private references and waits for explicit confirmation", async () => {
  const views = ["front", "left", "back", "right"];
  const urls = views.map((view) => `https://result.example/${view}.png`);
  let job = {
    id: ids.job,
    userId: ids.user,
    style: "realistic",
    generationMode: "face_first_multiview",
    modelProvider: "tripo",
    sourcePhotoId: ids.photo,
    referenceSetId: ids.referenceSet,
    promptPlan: { providerPrompt: "private fixed multiview prompt" },
    qualityPreset: "ultra",
    geometryQuality: "ultra",
    textureQuality: "detailed",
    status: "queued_references",
    progress: 0,
  };
  let referenceSet = {
    id: ids.referenceSet,
    userId: ids.user,
    jobId: ids.job,
    sourcePhotoId: ids.photo,
    status: "queued",
    providerTaskId: null,
    promptPlan: { providerPrompt: "private fixed multiview prompt" },
    usageImageCount: 0,
  };
  let images = [];
  let submitCalls = 0;
  let pollCalls = 0;
  let modelSubmitCalls = 0;
  const transitions = [];
  const repository = {
    getJob: async () => ({ ...job }),
    getReferenceSetForJob: async () => ({ ...referenceSet }),
    getPhoto: async () => ({ ...privatePhoto, id: ids.photo }),
    transitionReferenceGeneration: async (input) => {
      assert.equal(job.status, input.fromJobStatus);
      assert.equal(referenceSet.status, input.fromReferenceStatus);
      transitions.push([input.fromJobStatus, input.toJobStatus]);
      job = {
        ...job,
        status: input.toJobStatus,
        progress: input.progress ?? job.progress,
      };
      referenceSet = {
        ...referenceSet,
        status: input.toReferenceStatus,
        providerTaskId: input.providerTaskId ?? referenceSet.providerTaskId,
        providerRequestId: input.providerRequestId ?? referenceSet.providerRequestId,
        providerStatus: input.providerStatus ?? referenceSet.providerStatus,
      };
      return { job: { ...job }, referenceSet: { ...referenceSet } };
    },
    updateReferenceGenerationProgress: async (input) => {
      job = { ...job, progress: input.progress };
      referenceSet = { ...referenceSet, providerStatus: input.providerStatus };
      return { job: { ...job }, referenceSet: { ...referenceSet } };
    },
    persistReferenceImages: async (input) => {
      images = input.images.map(({ storageKey: _storageKey, ...image }) => image);
      job = { ...job, status: "awaiting_reference_confirmation", progress: 100 };
      referenceSet = {
        ...referenceSet,
        status: "awaiting_confirmation",
        usageImageCount: input.usageImageCount,
      };
      return images;
    },
    listReferenceImages: async () => images,
    confirmReferenceSet: async (input) => {
      assert.equal(input.referenceSetId, ids.referenceSet);
      job = {
        ...job,
        status: "queued_3d",
        qualityPreset: input.qualityPreset,
        geometryQuality: input.geometryQuality,
        textureQuality: input.textureQuality,
      };
      referenceSet = { ...referenceSet, status: "accepted" };
      return {
        job: { ...job, promptPlan: undefined, modelProvider: undefined },
        referenceSet: { id: referenceSet.id, status: referenceSet.status },
      };
    },
    releaseJobClaim: async () => {},
    markJobAssetsRetention: async () => {},
  };
  const service = createAvatar3dLifecycleService({
    repository,
    storage: {
      createProviderReadUrl: ({ objectKey }) => `https://private.example/${objectKey}`,
      persistAvatarReferenceImages: async ({ imageUrls }) => imageUrls.map((_, index) => ({
        view: views[index],
        sequenceIndex: index,
        storageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/references/${views[index]}.jpg`,
        contentType: "image/jpeg",
        byteSize: 1024,
        width: 1024,
        height: 1536,
      })),
    },
    wanMultiview: {
      submitWanMultiviewJob: async ({ imageUrl, prompt }) => {
        submitCalls += 1;
        assert.match(imageUrl, /^https:\/\/private\.example\//);
        assert.equal(prompt, "private fixed multiview prompt");
        return {
          state: "processing",
          taskId: "wan-task-private",
          requestId: "wan-request-private",
          providerStatus: "PENDING",
          progress: 10,
        };
      },
      fetchWanMultiviewJob: async ({ taskId }) => {
        pollCalls += 1;
        assert.equal(taskId, "wan-task-private");
        return {
          state: "succeeded",
          taskId,
          requestId: "wan-request-private",
          providerStatus: "SUCCEEDED",
          progress: 100,
          imageUrls: urls,
          usageCount: 4,
        };
      },
    },
    providers: {
      resolve: () => ({
        submit: async () => { modelSubmitCalls += 1; },
        fetch: async () => ({}),
      }),
    },
    wanx: {},
    runtime,
  });

  await service.processJob({ ...job });
  assert.equal(job.status, "processing_references");
  await service.processJob({ ...job });
  assert.equal(job.status, "persisting_references");
  await service.processJob({ ...job });
  assert.equal(job.status, "awaiting_reference_confirmation");
  assert.deepEqual(images.map((image) => image.view), views);
  assert.equal(submitCalls, 1);
  assert.equal(pollCalls, 2);
  assert.equal(modelSubmitCalls, 0);
  assert.deepEqual(transitions, [
    ["queued_references", "submitting_references"],
    ["submitting_references", "processing_references"],
    ["processing_references", "persisting_references"],
  ]);

  const preview = await service.getReferences({ user: { id: ids.user }, jobId: ids.job });
  assert.deepEqual(preview.images.map((image) => image.view), views);
  const confirmed = await service.confirmReferences({
    user: { id: ids.user },
    jobId: ids.job,
    body: {
      referenceSetId: ids.referenceSet,
      qualityPreset: "ultra",
      accepted: true,
      acceptedCostVersion: "2026-07-21",
    },
  });
  assert.equal(confirmed.job.status, "queued_3d");
  assert.equal(confirmed.referenceSet.status, "accepted");
  assert.equal(modelSubmitCalls, 0);
});

test("confirmed face-first jobs submit exactly four accepted references to Tripo", async () => {
  const views = ["front", "left", "back", "right"];
  let job = {
    id: ids.job,
    userId: ids.user,
    style: "realistic",
    generationMode: "face_first_multiview",
    modelProvider: "tripo",
    referenceSetId: ids.referenceSet,
    status: "queued_3d",
    geometryQuality: "ultra",
    textureQuality: "detailed",
  };
  let submittedInput;
  const service = createAvatar3dLifecycleService({
    repository: {
      transitionJob: async (input) => {
        assert.equal(job.status, input.fromStatus);
        job = {
          ...job,
          status: input.toStatus,
          progress: input.progress,
          modelProviderTaskId: input.modelProviderTaskId ?? job.modelProviderTaskId,
        };
        return { ...job };
      },
      getReferenceSetForJob: async () => ({
        id: ids.referenceSet,
        jobId: ids.job,
        status: "accepted",
      }),
      listReferenceImages: async () => views.map((view, sequenceIndex) => ({
        id: `${sequenceIndex}`,
        view,
        sequenceIndex,
        storageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/references/${view}.jpg`,
        mimeType: "image/jpeg",
      })),
      markJobAssetsRetention: async () => {},
    },
    storage: {
      createProviderReadUrl: ({ objectKey }) => `https://private.example/${objectKey}`,
    },
    providers: {
      resolve: () => ({
        submit: async (input) => {
          submittedInput = input;
          return {
            state: "processing",
            taskId: "tripo-private-task",
            providerStatus: "PENDING",
            progress: 10,
          };
        },
        fetch: async () => ({}),
      }),
    },
    wanx: {},
    runtime,
  });

  const result = await service.processJob({ ...job });

  assert.equal(result.status, "processing_3d");
  assert.deepEqual(submittedInput.photos.map((photo) => photo.view), views);
  assert.equal(submittedInput.photos.every((photo) => photo.url.startsWith("https://private.example/")), true);
  assert.equal(submittedInput.geometryQuality, "ultra");
  assert.equal(submittedInput.textureQuality, "detailed");
});

test("a job with an unsupported 3D provider fails closed without a Provider call", async () => {
  const state = createConfirmedJobRepository({ modelProvider: "unsupported_provider" });
  let providerCalls = 0;
  const service = createAvatar3dLifecycleService({
    repository: state.repository,
    storage: {
      createProviderReadUrl: ({ objectKey }) => `https://signed.example/${objectKey}`,
    },
    providers: providersForTripo({
      submit: async () => {
        providerCalls += 1;
        throw new Error("must not submit");
      },
      fetch: async () => {
        providerCalls += 1;
        throw new Error("must not poll");
      },
    }),
    wanx: {},
    runtime,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  await service.processJob(state.currentJob());

  assert.equal(state.currentJob().status, "failed");
  assert.equal(state.currentJob().errorCode, "AVATAR_PROVIDER_UNSUPPORTED");
  assert.equal(providerCalls, 0);
});

test("persisting recovery finishes an already active model without downloading it again", async () => {
  let providerPolls = 0;
  let modelDownloads = 0;
  const job = {
    id: ids.job,
    userId: ids.user,
    style: "realistic",
    status: "persisting",
    progress: 95,
    modelId: ids.model,
    modelProviderTaskId: "tripo-task",
  };
  const repository = {
    getJobModel: async () => ({
      id: ids.model,
      jobId: ids.job,
      status: "active",
      glbStorageKey: "users/u/avatar-3d/jobs/j/model.glb",
    }),
    transitionJob: async (input) => ({
      ...job,
      status: input.toStatus,
      progress: input.progress,
    }),
    markJobAssetsRetention: async () => {},
    releaseJobClaim: async () => {},
  };
  const service = createAvatar3dLifecycleService({
    repository,
    storage: {
      persistAvatarProviderModel: async () => {
        modelDownloads += 1;
      },
    },
    providers: providersForTripo({
      fetch: async () => {
        providerPolls += 1;
      },
    }),
    wanx: {},
    runtime,
  });

  const result = await service.processJob(job);

  assert.equal(result.status, "succeeded");
  assert.equal(providerPolls, 0);
  assert.equal(modelDownloads, 0);
});

test("unknown Tripo submission becomes terminal and is never resubmitted", async () => {
  const state = createConfirmedJobRepository();
  let submitCalls = 0;
  const service = createAvatar3dLifecycleService({
    repository: state.repository,
    storage: {
      createProviderReadUrl: () => "https://signed.example/front.jpg",
    },
    providers: providersForTripo({
      submit: async () => {
        submitCalls += 1;
        throw new HttpError(502, "unknown", { code: "TRIPO_SUBMISSION_UNKNOWN" });
      },
    }),
    wanx: {},
    runtime,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  await service.processJob(state.currentJob());
  assert.equal(state.currentJob().status, "submission_unknown");
  await service.processJob(state.currentJob());
  assert.equal(submitCalls, 1);
});

test("a Tripo task is never resubmitted when saving its task ID fails", async () => {
  const state = createConfirmedJobRepository();
  const transitionJob = state.repository.transitionJob;
  let submitCalls = 0;
  let failTaskIdWrite = true;
  state.repository.transitionJob = async (input) => {
    if (
      failTaskIdWrite
      && input.fromStatus === "submitting_3d"
      && input.toStatus === "processing_3d"
    ) {
      failTaskIdWrite = false;
      throw new Error("database unavailable after Provider acceptance");
    }
    return transitionJob(input);
  };
  const service = createAvatar3dLifecycleService({
    repository: state.repository,
    storage: {
      createProviderReadUrl: () => "https://signed.example/front.jpg",
    },
    providers: providersForTripo({
      submit: async () => {
        submitCalls += 1;
        return {
          state: "processing",
          taskId: "tripo-paid-task",
          providerStatus: "PENDING",
          progress: 10,
        };
      },
    }),
    wanx: {},
    runtime,
    now: () => new Date("2026-07-17T00:00:00.000Z"),
  });

  await assert.rejects(
    () => service.processJob(state.currentJob()),
    /database unavailable/,
  );
  assert.equal(state.currentJob().status, "submitting_3d");

  await service.processJob(state.currentJob());
  assert.equal(state.currentJob().status, "submission_unknown");
  assert.equal(submitCalls, 1);
});

test("bootstrap never reports a quality_failed job as active", async () => {
  const failedJob = {
    id: ids.job,
    userId: ids.user,
    style: "realistic",
    status: "quality_failed",
  };
  const service = createAvatar3dLifecycleService({
    repository: {
      getQuotaState: async () => ({ dailyUsed: 1, hasActiveJob: false }),
      listJobs: async () => [failedJob],
      listModels: async () => [],
    },
    runtime,
  });

  const bootstrap = await service.getBootstrap({ user: { id: ids.user } });

  assert.equal(bootstrap.activeJob, null);
  assert.deepEqual(bootstrap.jobs, [failedJob]);
});

test("private model and reference reads verify ownership and expose no storage keys", async () => {
  const streamed = [];
  const privateModel = {
    id: ids.model,
    userId: ids.user,
    jobId: ids.job,
    title: "我的写实 3D 形象",
    status: "active",
    byteSize: 1024,
    thumbnailAvailable: true,
    glbStorageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/model.glb`,
    glbMimeType: "model/gltf-binary",
    mobileGlbStorageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/model-mobile.glb`,
    mobileGlbMimeType: "model/gltf-binary",
    thumbnailStorageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/thumbnail.jpg`,
    thumbnailMimeType: "image/jpeg",
  };
  const service = createAvatar3dLifecycleService({
    repository: {
      getJob: async () => ({
        id: ids.job,
        userId: ids.user,
        style: "realistic",
        generationMode: "face_first_multiview",
        referenceSetId: ids.referenceSet,
        status: "awaiting_reference_confirmation",
      }),
      getReferenceImage: async () => ({
        id: ids.preview,
        userId: ids.user,
        jobId: ids.job,
        referenceSetId: ids.referenceSet,
        view: "front",
        storageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/references/front.jpg`,
        mimeType: "image/jpeg",
      }),
      getModel: async () => privateModel,
    },
    storage: {
      streamAvatarObject: async ({ objectKey, range }) => {
        streamed.push({ objectKey, range });
        return { status: range ? 206 : 200, body: {} };
      },
    },
    runtime,
  });
  const user = { id: ids.user, email: "person@example.com" };

  assert.equal((await service.getJob({ user, jobId: ids.job })).id, ids.job);
  const reference = await service.getReferenceImageFile({
    user,
    jobId: ids.job,
    view: "front",
  });
  const model = await service.getModel({ user, modelId: ids.model });
  const modelFile = await service.getModelFile({
    user,
    modelId: ids.model,
    range: "bytes=0-511",
  });
  const appModelFile = await service.getAppModelFile({
    user,
    modelId: ids.model,
    range: "bytes=0-255",
  });
  const thumbnail = await service.getModelThumbnail({ user, modelId: ids.model });

  assert.equal(reference.contentType, "image/jpeg");
  assert.equal(model.glbStorageKey, undefined);
  assert.equal(model.mobileGlbStorageKey, undefined);
  assert.equal(model.thumbnailStorageKey, undefined);
  assert.equal(modelFile.contentType, "model/gltf-binary");
  assert.equal(appModelFile.contentType, "model/gltf-binary");
  assert.equal(thumbnail.contentType, "image/jpeg");
  assert.equal(streamed.length, 4);
  assert.deepEqual(
    streamed.map((item) => item.range),
    ["", "bytes=0-511", "bytes=0-255", ""],
  );
  assert.equal(streamed[0].objectKey.endsWith("/references/front.jpg"), true);
  assert.equal(streamed[1].objectKey.endsWith("/model.glb"), true);
  assert.equal(streamed[2].objectKey.endsWith("/model-mobile.glb"), true);
});

test("App model reads never fall back to the original high-detail GLB", async () => {
  let storageReads = 0;
  const service = createAvatar3dLifecycleService({
    repository: {
      getModel: async () => ({
        id: ids.model,
        userId: ids.user,
        status: "active",
        glbStorageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/model.glb`,
        mobileGlbStorageKey: null,
      }),
    },
    storage: {
      streamAvatarObject: async () => {
        storageReads += 1;
        return { body: {} };
      },
    },
    runtime,
  });

  await assert.rejects(
    () => service.getAppModelFile({
      user: { id: ids.user },
      modelId: ids.model,
    }),
    (error) => error?.status === 409
      && error?.details?.code === "MOBILE_MODEL_ASSET_MISSING",
  );
  assert.equal(storageReads, 0);
});

test("deleting an active model removes original, App, and thumbnail objects", async () => {
  const deletes = [];
  let recordDeletes = 0;
  const service = createAvatar3dLifecycleService({
    repository: {
      getModel: async () => ({
        id: ids.model,
        userId: ids.user,
        status: "active",
        glbStorageKey: "users/u/avatar-3d/jobs/j/model.glb",
        mobileGlbStorageKey: "users/u/avatar-3d/jobs/j/model-mobile.glb",
        thumbnailStorageKey: "users/u/avatar-3d/jobs/j/thumbnail.jpg",
      }),
      deleteModelRecord: async () => {
        recordDeletes += 1;
      },
    },
    storage: {
      deleteAvatarObjects: async (objectKeys) => deletes.push(...objectKeys),
    },
    runtime,
  });

  await service.deleteModel({ user: { id: ids.user }, modelId: ids.model });

  assert.deepEqual(deletes, [
    "users/u/avatar-3d/jobs/j/model.glb",
    "users/u/avatar-3d/jobs/j/model-mobile.glb",
    "users/u/avatar-3d/jobs/j/thumbnail.jpg",
  ]);
  assert.equal(recordDeletes, 1);
});

test("repeated photo completion never exposes private storage keys", async () => {
  const service = createAvatar3dLifecycleService({
    repository: {
      getPhoto: async ({ includePrivate }) => includePrivate
        ? { ...privatePhoto, jobId: null, sourceStorageKey: "users/private/source.jpg" }
        : { id: ids.photo, status: "ready", jobId: null },
    },
    storage: {},
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

test("a preparing model cannot be deleted while its GLB is still being saved", async () => {
  let storageDeletes = 0;
  const service = createAvatar3dLifecycleService({
    repository: {
      getModel: async () => ({
        id: ids.model,
        userId: ids.user,
        jobId: ids.job,
        status: "preparing",
        glbStorageKey: null,
        thumbnailStorageKey: "users/u/avatar-3d/jobs/j/thumbnail.jpg",
      }),
    },
    storage: {
      deleteAvatarObjects: async () => {
        storageDeletes += 1;
      },
    },
    runtime,
  });

  await assert.rejects(
    () => service.deleteModel({ user: { id: ids.user }, modelId: ids.model }),
    (error) => error?.status === 409 && error?.details?.code === "MODEL_PREPARING",
  );
  assert.equal(storageDeletes, 0);
});

test("cancelling a private job never exposes quality metrics", async () => {
  const qualityMetrics = {
    minimumSimilarityThreshold: 0.82,
    providerTaskId: "quality-provider-task-private",
    providerRequestId: "quality-provider-request-private",
    resultUrl: "https://quality.example/private-result.json",
    sourceStorageKey: "users/private/quality-input.jpg",
    rawError: "quality evaluator stack trace",
  };
  const privateJob = {
    id: ids.job,
    userId: ids.user,
    style: "realistic",
    status: "queued_3d",
    qualityMetrics,
  };
  const service = createAvatar3dLifecycleService({
    repository: {
      getJob: async () => privateJob,
      transitionJob: async () => ({ ...privateJob, status: "cancelled" }),
      markJobAssetsRetention: async () => {},
    },
    storage: {},
    wanx: {},
    runtime,
  });

  const cancelled = await service.cancelJob({ user: { id: ids.user }, jobId: ids.job });

  assert.equal(Object.hasOwn(cancelled, "qualityMetrics"), false);
  const serialized = JSON.stringify(cancelled);
  for (const privateValue of Object.values(qualityMetrics)) {
    assert.equal(serialized.includes(String(privateValue)), false);
  }
});
