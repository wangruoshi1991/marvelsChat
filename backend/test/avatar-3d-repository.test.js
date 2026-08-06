import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createAvatar3dRepository } = await import("../src/avatar-3d-repository.js");
const {
  mapAvatar3dJob,
  mapAvatar3dModel,
  mapAvatar3dPhoto,
} = await import("../src/repository-mappers.js");

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  job: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  preview: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  model: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  referenceSet: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  referenceImage: "99999999-9999-4999-8999-999999999999",
};

const jobRow = {
  id: ids.job,
  user_id: ids.user,
  idempotency_key_hash: "a".repeat(64),
  style: "realistic",
  quality_preset: "standard",
  geometry_quality: "standard",
  texture_quality: "standard",
  status: "queued_3d",
  progress: 0,
  photo_count: 1,
  accepted_cost_version: "2026-07-20",
  estimated_cost_fen: 210,
  model_provider_task_id: "provider-task-private",
  model_id: null,
  safe_error_code: null,
  created_at: "2026-07-17T00:00:00.000Z",
  updated_at: "2026-07-17T00:00:00.000Z",
  finished_at: null,
};

test("face-first job and reference set are created atomically from one owned photo", async () => {
  const calls = [];
  const jobId = ids.job;
  const referenceSetId = ids.referenceSet;
  const sourcePhotoId = ids.preview;
  const job = {
    ...jobRow,
    id: jobId,
    status: "queued_references",
    generation_mode: "face_first_multiview",
    reference_set_id: referenceSetId,
    source_photo_id: sourcePhotoId,
    prompt: "蓝色运动服",
    prompt_plan: { providerPrompt: "private provider prompt" },
    prompt_plan_version: "avatar-multiview-v1",
  };
  const referenceSet = {
    id: referenceSetId,
    user_id: ids.user,
    job_id: jobId,
    source_photo_id: sourcePhotoId,
    status: "queued",
    prompt_plan: job.prompt_plan,
    prompt_plan_version: job.prompt_plan_version,
    expected_image_count: 4,
    actual_image_count: 0,
    usage_image_count: 0,
    cost_version: "2026-07-20",
    estimated_cost_fen: 200,
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  };
  const generatedIds = [jobId, referenceSetId];
  const repository = createAvatar3dRepository({
    randomUUID: () => generatedIds.shift(),
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/idempotency_key_hash/.test(sql) && /FOR UPDATE/.test(sql)) return [[]];
        if (/SELECT id FROM users/.test(sql)) return [[{ id: ids.user }]];
        if (/AS daily_used/.test(sql)) return [[{ daily_used: 0, active_count: 0 }]];
        if (/FROM avatar_3d_job_photos/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{ id: sourcePhotoId, status: "ready" }]];
        }
        if (/INSERT INTO avatar_3d_jobs/.test(sql)) return [[{ ...job, reference_set_id: null }]];
        if (/UPDATE avatar_3d_job_photos/.test(sql)) return [[{ id: sourcePhotoId }]];
        if (/INSERT INTO avatar_3d_reference_sets/.test(sql)) return [[referenceSet]];
        if (/UPDATE avatar_3d_jobs/.test(sql) && /reference_set_id/.test(sql)) return [[job]];
        return [[]];
      },
    }),
  });

  const result = await repository.createFaceFirstJob({
    userId: ids.user,
    idempotencyKeyHash: "f".repeat(64),
    sourcePhotoId,
    prompt: "蓝色运动服",
    promptPlan: job.prompt_plan,
    promptPlanVersion: job.prompt_plan_version,
    qualityPreset: "ultra",
    geometryQuality: "ultra",
    textureQuality: "detailed",
    acceptedCostVersion: "2026-07-20",
    estimatedCostFen: 420,
    referenceCostVersion: "2026-07-20",
    referenceEstimatedCostFen: 200,
    acceptedAdultSubject: true,
    consentVersion: "avatar-face-first-v1",
    dailyLimit: 3,
  });

  assert.equal(result.created, true);
  assert.equal(result.job.status, "queued_references");
  assert.equal(result.job.generationMode, "face_first_multiview");
  assert.equal(result.job.referenceSetId, referenceSetId);
  assert.equal(Object.hasOwn(result.job, "prompt"), false);
  assert.equal(Object.hasOwn(result.referenceSet, "promptPlan"), false);
  assert.equal(calls.filter((call) => /INSERT INTO avatar_3d_jobs/.test(call.sql)).length, 1);
  assert.equal(calls.filter((call) => /INSERT INTO avatar_3d_reference_sets/.test(call.sql)).length, 1);
  assert.match(
    calls.find((call) => /INSERT INTO avatar_3d_jobs/.test(call.sql)).sql,
    /generation_mode[\s\S]*accepted_adult_subject/,
  );
});

test("face-first idempotency recovery does not create another reference set", async () => {
  const calls = [];
  const existing = {
    ...jobRow,
    status: "queued_references",
    generation_mode: "face_first_multiview",
    reference_set_id: ids.referenceSet,
  };
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/idempotency_key_hash/.test(sql) && /FOR UPDATE/.test(sql)) return [[existing]];
        if (/FROM avatar_3d_reference_sets/.test(sql)) {
          return [[{
            id: ids.referenceSet,
            user_id: ids.user,
            job_id: ids.job,
            source_photo_id: ids.preview,
            status: "queued",
            expected_image_count: 4,
            cost_version: "2026-07-20",
            estimated_cost_fen: 200,
          }]];
        }
        return [[]];
      },
    }),
  });

  const result = await repository.createFaceFirstJob({
    userId: ids.user,
    idempotencyKeyHash: "f".repeat(64),
    sourcePhotoId: ids.preview,
    promptPlan: {},
    promptPlanVersion: "avatar-multiview-v1",
    qualityPreset: "ultra",
    geometryQuality: "ultra",
    textureQuality: "detailed",
    acceptedCostVersion: "2026-07-20",
    estimatedCostFen: 420,
    referenceCostVersion: "2026-07-20",
    referenceEstimatedCostFen: 200,
    acceptedAdultSubject: true,
    consentVersion: "avatar-face-first-v1",
    dailyLimit: 3,
  });

  assert.equal(result.created, false);
  assert.equal(result.job.referenceSetId, ids.referenceSet);
  assert.equal(result.referenceSet.id, ids.referenceSet);
  assert.equal(calls.length, 2);
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
  assert.match(
    calls[0].sql,
    /SET claimed_at = date_trunc\('milliseconds', CURRENT_TIMESTAMP\)/,
  );
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

test("reference generation transitions are explicit and confirmation gates 3D", async () => {
  const calls = [];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [{ ...jobRow, status: params[0] }];
    },
  });

  for (const [fromStatus, toStatus] of [
    ["queued_references", "submitting_references"],
    ["submitting_references", "processing_references"],
    ["processing_references", "persisting_references"],
    ["persisting_references", "awaiting_reference_confirmation"],
    ["awaiting_reference_confirmation", "queued_3d"],
  ]) {
    await repository.transitionJob({
      userId: ids.user,
      jobId: ids.job,
      fromStatus,
      toStatus,
    });
  }

  assert.equal(calls.length, 5);
  await assert.rejects(
    () => repository.transitionJob({
      userId: ids.user,
      jobId: ids.job,
      fromStatus: "processing_references",
      toStatus: "queued_3d",
    }),
    (error) => error?.details?.code === "ILLEGAL_JOB_TRANSITION",
  );
});

test("public job and model projections never expose private identifiers", () => {
  const publicJob = mapAvatar3dJob({
    ...jobRow,
    prompt: "private user description",
    prompt_plan: { providerPrompt: "private full provider prompt" },
  });
  const publicModel = mapAvatar3dModel({
    id: ids.model,
    user_id: ids.user,
    job_id: ids.job,
    title: "我的 3D 形象",
    glb_storage_key: "users/private/model.glb",
    mobile_glb_storage_key: "users/private/model-mobile.glb",
    thumbnail_storage_key: "users/private/thumb.jpg",
    provider_task_id: "tripo-private",
    glb_byte_size: 1024,
    thumbnail_byte_size: 128,
    status: "active",
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  });

  const serialized = JSON.stringify({ publicJob, publicModel });
  for (const privateValue of [
    "provider-task-private",
    "tripo-private",
    "users/private",
    "private user description",
    "private full provider prompt",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(publicModel.thumbnailAvailable, true);
  assert.equal(publicModel.interactiveAvailable, true);
  assert.equal(Object.hasOwn(publicJob, "prompt"), false);
  assert.equal(Object.hasOwn(publicJob, "promptPlan"), false);
});

test("private job reads retain prompt planning fields for the worker", async () => {
  const privateRow = {
    ...jobRow,
    model_provider: "tripo",
    prompt: "蓝色运动服",
    prompt_plan: { providerPrompt: "private prompt" },
    prompt_plan_version: "avatar-multiview-v1",
  };
  const repository = createAvatar3dRepository({ queryFn: async () => [privateRow] });

  const job = await repository.getJob({
    userId: ids.user,
    jobId: ids.job,
    includePrivate: true,
  });

  assert.equal(job.modelProvider, "tripo");
  assert.equal(job.prompt, "蓝色运动服");
  assert.deepEqual(job.promptPlan, privateRow.prompt_plan);
  assert.equal(job.promptPlanVersion, "avatar-multiview-v1");
});

test("public payloads omit raw model quality metrics while private model reads retain them", async () => {
  const qualityMetrics = {
    artifactUrl: "https://provider.invalid/private/model.glb?signature=secret",
    storageKey: "users/private/quality/model.glb",
    requestId: "request-private-123",
    providerTaskId: "provider-private-456",
    rawError: "provider raw stack and credentials",
    minimumSimilarityThreshold: 0.82,
  };
  const privateJobRow = { ...jobRow, quality_metrics: qualityMetrics };
  const privateModelRow = {
    id: ids.model,
    user_id: ids.user,
    job_id: ids.job,
    title: "Private quality model",
    status: "active",
    quality_metrics: qualityMetrics,
  };
  const repository = createAvatar3dRepository({
    queryFn: async (sql) => (/avatar_3d_models/.test(sql) ? [privateModelRow] : [privateJobRow]),
  });

  const publicPayload = {
    job: await repository.getJob({ userId: ids.user, jobId: ids.job }),
    jobs: await repository.listJobs({ userId: ids.user }),
    model: await repository.getModel({ userId: ids.user, modelId: ids.model }),
    models: await repository.listModels({ userId: ids.user }),
  };
  const privateJob = await repository.getJob({
    userId: ids.user,
    jobId: ids.job,
    includePrivate: true,
  });
  const privateModel = await repository.getModel({
    userId: ids.user,
    modelId: ids.model,
    includePrivate: true,
  });

  assert.equal(Object.hasOwn(mapAvatar3dJob(privateJobRow), "qualityMetrics"), false);
  assert.equal(Object.hasOwn(mapAvatar3dModel(privateModelRow), "qualityMetrics"), false);
  const serializedPublicPayload = JSON.stringify(publicPayload);
  for (const privateValue of Object.keys(qualityMetrics).concat(Object.values(qualityMetrics))) {
    assert.equal(serializedPublicPayload.includes(String(privateValue)), false);
  }
  assert.equal(privateJob.qualityMetrics, undefined);
  assert.deepEqual(privateModel.qualityMetrics, qualityMetrics);
});

test("preparing models expose only their preview and become interactive atomically", async () => {
  const preparingRow = {
    id: ids.model,
    user_id: ids.user,
    job_id: ids.job,
    title: "我的写实 3D 形象",
    provider_task_id: "tripo-private",
    glb_storage_key: null,
    glb_mime_type: null,
    glb_byte_size: null,
    thumbnail_storage_key: "users/private/thumb.jpg",
    thumbnail_mime_type: "image/jpeg",
    thumbnail_byte_size: 128,
    status: "preparing",
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  };
  const activeRow = {
    ...preparingRow,
    glb_storage_key: "users/private/model.glb",
    glb_mime_type: "model/gltf-binary",
    glb_byte_size: 2048,
    mobile_glb_storage_key: "users/private/model-mobile.glb",
    mobile_glb_mime_type: "model/gltf-binary",
    mobile_glb_byte_size: 512,
    status: "active",
  };
  const calls = [];
  const responses = [[preparingRow], [preparingRow], [preparingRow], [activeRow], []];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return responses.shift() || [];
    },
    randomUUID: () => ids.model,
  });

  const created = await repository.createPreparingModel({
    userId: ids.user,
    jobId: ids.job,
    title: "我的写实 3D 形象",
    providerTaskId: "tripo-private",
    thumbnail: {
      storageKey: "users/private/thumb.jpg",
      contentType: "image/jpeg",
      byteSize: 128,
    },
  });
  const byId = await repository.getModel({
    userId: ids.user,
    modelId: ids.model,
    includePrivate: true,
  });
  const byJob = await repository.getJobModel({
    userId: ids.user,
    jobId: ids.job,
    includePrivate: true,
  });
  const completed = await repository.completePreparingModel({
    userId: ids.user,
    jobId: ids.job,
    glb: {
      storageKey: "users/private/model.glb",
      contentType: "model/gltf-binary",
      byteSize: 2048,
      mobile: {
        storageKey: "users/private/model-mobile.glb",
        contentType: "model/gltf-binary",
        byteSize: 512,
      },
    },
  });
  const wrongOwner = await repository.getJobModel({
    userId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    jobId: ids.job,
    includePrivate: true,
  });

  assert.equal(created.status, "preparing");
  assert.equal(created.interactiveAvailable, false);
  assert.equal(byId.thumbnailStorageKey, "users/private/thumb.jpg");
  assert.equal(byJob.glbStorageKey, null);
  assert.equal(byJob.mobileGlbStorageKey, null);
  assert.equal(completed.status, "active");
  assert.equal(completed.interactiveAvailable, true);
  assert.equal(calls[3].params[3], "users/private/model-mobile.glb");
  assert.equal(wrongOwner, null);
  assert.match(calls[0].sql, /status\)\s+VALUES \([^)]*'preparing'/s);
  assert.doesNotMatch(calls[0].sql, /glb_storage_key/);
  assert.match(calls[1].sql, /status IN \('preparing', 'active'\)/);
  assert.match(calls[3].sql, /status = 'active'/);
  assert.match(calls[3].sql, /status = 'preparing'/);
  assert.deepEqual(calls[4].params, [ids.job, "ffffffff-ffff-4fff-8fff-ffffffffffff"]);
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

  assert.equal(
    calls[0].sql.match(/j\.status IN \('succeeded', 'failed', 'quality_failed', 'cancelled', 'submission_unknown'\)/g)?.length,
    3,
  );
  assert.match(calls[0].sql, /SELECT 'photo_source'[\s\S]*p\.source_storage_key/);
  assert.match(calls[0].sql, /SELECT 'photo_normalized'[\s\S]*p\.normalized_storage_key/);
  assert.doesNotMatch(calls[0].sql, /enhanced_photo|style_preview|retain_for_regeneration/);
  assert.match(calls[0].sql, /p\.job_id IS NULL/);
  assert.match(calls[0].sql, /SELECT 'reference_image'[\s\S]*image\.storage_key/);
  assert.match(calls[0].sql, /image\.status = 'active'/);
  assert.doesNotMatch(calls[0].sql, /avatar_3d_models/);
  assert.deepEqual(calls[0].params, [new Date("2026-07-24T00:00:00Z")]);
});

test("photo cleanup clears source and normalized keys and closes the record after both", async () => {
  const calls = [];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [];
    },
  });

  await repository.createPhoto({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    userId: ids.user,
    originalFilename: "front.jpg",
    mimeType: "image/jpeg",
    byteSize: 100,
    sourceStorageKey: "users/u/avatar-3d/photos/p/source.jpg",
  });
  assert.match(calls[0].sql, /CURRENT_TIMESTAMP \+ INTERVAL '1 day'/);

  await repository.markPrivateAssetDeleted({
    assetKind: "photo_source",
    assetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  });
  await repository.markPrivateAssetDeleted({
    assetKind: "photo_normalized",
    assetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  });
  assert.match(calls[1].sql, /normalized_storage_key IS NULL/);
  assert.match(calls[2].sql, /source_storage_key = ''/);
  assert.doesNotMatch(calls[1].sql, /enhanced_storage_key|retain_for_regeneration/);
  assert.doesNotMatch(calls[2].sql, /enhanced_storage_key|retain_for_regeneration/);
});

test("job retention and cleanup include generated reference images", async () => {
  const transactionCalls = [];
  const queryCalls = [];
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        transactionCalls.push({ sql, params });
        return [[]];
      },
    }),
    queryFn: async (sql, params) => {
      queryCalls.push({ sql, params });
      return [];
    },
  });
  const retentionUntil = new Date("2026-07-28T00:00:00Z");

  await repository.markJobAssetsRetention({
    userId: ids.user,
    jobId: ids.job,
    retentionUntil,
  });
  await repository.markPrivateAssetDeleted({
    assetKind: "reference_image",
    assetId: ids.referenceImage,
  });

  assert.equal(transactionCalls.length, 4);
  assert.match(transactionCalls[2].sql, /UPDATE avatar_3d_reference_sets/);
  assert.match(transactionCalls[3].sql, /UPDATE avatar_3d_reference_images/);
  assert.deepEqual(transactionCalls[3].params, [retentionUntil, ids.job, ids.user]);
  assert.match(queryCalls[0].sql, /SET status = 'deleted', storage_key = '', deleted_at = CURRENT_TIMESTAMP/);
  assert.match(queryCalls[0].sql, /status = 'active' AND deleted_at IS NULL/);
});

test("avatar mappers expose only the current face-first contract", () => {
  const job = mapAvatar3dJob(jobRow);
  const photo = mapAvatar3dPhoto({
    id: ids.preview,
    original_filename: "front.jpg",
    source_mime_type: "image/jpeg",
    source_byte_size: 42,
    status: "ready",
  });
  const model = mapAvatar3dModel({
    id: ids.model,
    job_id: ids.job,
    title: "Current model",
    status: "active",
    glb_byte_size: 42,
  });

  assert.equal(job.generationMode, "face_first_multiview");
  assert.equal(job.style, "realistic");
  assert.equal(Object.hasOwn(job, "modelProvider"), false);
  assert.equal(Object.hasOwn(job, "prompt"), false);
  assert.equal(Object.hasOwn(job, "promptPlan"), false);
  assert.equal(job.referenceSetId, null);
  assert.equal(Object.hasOwn(job, "technicalRetryCount"), false);
  assert.equal(Object.hasOwn(job, "qualityStatus"), false);
  assert.equal(photo.purpose, "reference");
  assert.equal(photo.quality, null);
  assert.equal(model.modelProvider, "tripo");
  assert.equal(Object.hasOwn(model, "qualityStatus"), false);
  assert.equal(Object.hasOwn(model, "qualityMetrics"), false);
});

test("private photos expose storage and quality metadata while public photos omit internals", async () => {
  const photoRow = {
    id: ids.preview,
    user_id: ids.user,
    original_filename: "front.jpg",
    source_mime_type: "image/jpeg",
    source_byte_size: 42,
    source_storage_key: "users/private/source.jpg",
    normalized_storage_key: "users/private/normalized.jpg",
    quality_status: "passed",
    quality_metadata: { providerScore: 0.98, sourceStorageKey: "users/private/source.jpg" },
    status: "ready",
  };
  const repository = createAvatar3dRepository({
    queryFn: async () => [photoRow],
  });
  const mappedPublicPhoto = mapAvatar3dPhoto(photoRow);

  const privatePhoto = await repository.getPhoto({
    userId: ids.user,
    photoId: ids.preview,
    includePrivate: true,
  });
  const publicPhoto = await repository.getPhoto({
    userId: ids.user,
    photoId: ids.preview,
  });

  assert.equal(privatePhoto.sourceStorageKey, "users/private/source.jpg");
  assert.equal(privatePhoto.normalizedStorageKey, "users/private/normalized.jpg");
  assert.equal(privatePhoto.qualityStatus, "passed");
  assert.deepEqual(privatePhoto.qualityMetadata, photoRow.quality_metadata);
  assert.equal(mappedPublicPhoto.quality.level, "good");
  assert.equal(mappedPublicPhoto.quality.canContinue, true);
  assert.deepEqual(mappedPublicPhoto.quality.suggestions, []);
  assert.equal(Object.hasOwn(mappedPublicPhoto, "qualityMetadata"), false);
  for (const field of [
    "sourceStorageKey",
    "normalizedStorageKey",
    "qualityStatus",
    "qualityMetadata",
  ]) {
    assert.equal(Object.hasOwn(publicPhoto, field), false, `${field} must remain private`);
  }
});

test("photo completion stores private signals and returns only safe quality advice", async () => {
  const calls = [];
  const completedRow = {
    id: ids.preview,
    user_id: ids.user,
    original_filename: "selfie.jpg",
    source_mime_type: "image/jpeg",
    source_byte_size: 2048,
    width: 480,
    height: 720,
    status: "ready",
    quality_status: "advisory",
    quality_metadata: {
      version: "avatar-photo-quality-v1",
      warningCodes: ["soft_focus"],
      signals: { meanLuma: 120, laplacianVariance: 4.2 },
    },
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  };
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [completedRow];
    },
  });

  const photo = await repository.completePhoto({
    userId: ids.user,
    photoId: ids.preview,
    normalized: {
      storageKey: "users/private/normalized.jpg",
      contentType: "image/jpeg",
      byteSize: 1024,
      width: 480,
      height: 720,
      quality: {
        status: "advisory",
        metadata: completedRow.quality_metadata,
      },
    },
  });

  assert.match(calls[0].sql, /quality_status = \?, quality_metadata = \?/);
  assert.deepEqual(calls[0].params.slice(5, 7), [
    "advisory",
    JSON.stringify(completedRow.quality_metadata),
  ]);
  assert.equal(photo.quality.level, "advisory");
  assert.equal(JSON.stringify(photo).includes("laplacianVariance"), false);
});

test("reference set reads enforce job ownership and keep Provider identifiers private", async () => {
  const referenceSetRow = {
    id: ids.referenceSet,
    user_id: ids.user,
    job_id: ids.job,
    source_photo_id: ids.preview,
    provider: "wan_multiview",
    provider_task_id: "private-provider-task",
    provider_request_id: "private-provider-request",
    provider_status: "PENDING",
    status: "queued",
    prompt_plan: { bodyShape: "balanced", outfit: "smart_casual" },
    prompt_plan_version: "avatar-multiview-v1",
    expected_image_count: 4,
    actual_image_count: 0,
    usage_image_count: 0,
    cost_version: "2026-07-21",
    estimated_cost_fen: 200,
    confirmed_at: null,
    retention_until: "2026-07-22T00:00:00.000Z",
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  };
  const calls = [];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return params[1] === ids.user ? [referenceSetRow] : [];
    },
  });

  const publicReferenceSet = await repository.getReferenceSetForJob({
    userId: ids.user,
    jobId: ids.job,
    referenceSetId: ids.referenceSet,
  });
  const privateReferenceSet = await repository.getReferenceSetForJob({
    userId: ids.user,
    jobId: ids.job,
    referenceSetId: ids.referenceSet,
    includePrivate: true,
  });

  assert.equal(publicReferenceSet.jobId, ids.job);
  assert.equal(publicReferenceSet.expectedImageCount, 4);
  assert.equal(Object.hasOwn(publicReferenceSet, "sourcePhotoId"), false);
  assert.equal(Object.hasOwn(publicReferenceSet, "providerTaskId"), false);
  assert.equal(JSON.stringify(publicReferenceSet).includes("private-provider"), false);
  assert.equal(privateReferenceSet.sourcePhotoId, ids.preview);
  assert.equal(privateReferenceSet.providerTaskId, "private-provider-task");
  await assert.rejects(() => repository.getReferenceSetForJob({
    userId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    jobId: ids.job,
    referenceSetId: ids.referenceSet,
  }), /not found/i);
  assert.match(calls[0].sql, /JOIN avatar_3d_jobs job/);
  assert.deepEqual(calls[0].params, [ids.job, ids.user, ids.user, ids.referenceSet]);
});

test("reference image persistence requires all four ordered views and is transactional", async () => {
  const views = ["front", "left", "back", "right"];
  const calls = [];
  const imageRows = [];
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM avatar_3d_reference_sets/.test(sql) && /FOR UPDATE/.test(sql)) {
          return [[{
            id: ids.referenceSet,
            user_id: ids.user,
            job_id: ids.job,
            status: "persisting",
          }]];
        }
        if (/INSERT INTO avatar_3d_reference_images/.test(sql)) {
          const row = {
            id: params[0],
            reference_set_id: params[1],
            job_id: params[2],
            user_id: params[3],
            view: params[4],
            sequence_index: params[5],
            storage_key: params[6],
            mime_type: params[7],
            byte_size: params[8],
            width: params[9],
            height: params[10],
            status: "active",
            created_at: jobRow.created_at,
            updated_at: jobRow.updated_at,
          };
          imageRows.push(row);
          return [[row]];
        }
        if (/UPDATE avatar_3d_reference_sets/.test(sql)) return [[]];
        if (/UPDATE avatar_3d_jobs/.test(sql)) return [[{ id: ids.job }]];
        return [[]];
      },
    }),
    randomUUID: () => `${ids.referenceImage.slice(0, -1)}${imageRows.length}`,
  });
  const images = views.map((view, sequenceIndex) => ({
    view,
    sequenceIndex,
    storageKey: `users/${ids.user}/avatar-3d/jobs/${ids.job}/references/${view}.jpg`,
    mimeType: "image/jpeg",
    byteSize: 1024 + sequenceIndex,
    width: 1024,
    height: 1536,
  }));

  await assert.rejects(
    () => repository.persistReferenceImages({
      userId: ids.user,
      jobId: ids.job,
      referenceSetId: ids.referenceSet,
      images: images.slice(0, 3),
      usageImageCount: 3,
    }),
    (error) => error?.details?.code === "REFERENCE_SET_INCOMPLETE",
  );
  assert.equal(calls.length, 0);

  await assert.rejects(
    () => repository.persistReferenceImages({
      userId: ids.user,
      jobId: ids.job,
      referenceSetId: ids.referenceSet,
      images,
      usageImageCount: "4",
    }),
    (error) => error?.details?.code === "REFERENCE_USAGE_INVALID",
  );
  assert.equal(calls.length, 0);

  const persisted = await repository.persistReferenceImages({
    userId: ids.user,
    jobId: ids.job,
    referenceSetId: ids.referenceSet,
    images,
    usageImageCount: 4,
  });

  assert.deepEqual(persisted.map((image) => image.view), views);
  assert.equal(JSON.stringify(persisted).includes("storageKey"), false);
  assert.equal(calls.filter((call) => /INSERT INTO avatar_3d_reference_images/.test(call.sql)).length, 4);
  assert.match(
    calls.find((call) => /UPDATE avatar_3d_jobs/.test(call.sql)).sql,
    /status = 'awaiting_reference_confirmation'/,
  );
});

test("reference image reads are owner-scoped and storage keys stay private", async () => {
  const row = {
    id: ids.referenceImage,
    reference_set_id: ids.referenceSet,
    job_id: ids.job,
    user_id: ids.user,
    view: "front",
    sequence_index: 0,
    storage_key: `users/${ids.user}/avatar-3d/jobs/${ids.job}/references/front.jpg`,
    mime_type: "image/jpeg",
    byte_size: 2048,
    width: 1024,
    height: 1536,
    status: "active",
    retention_until: "2026-07-22T00:00:00.000Z",
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  };
  const calls = [];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [row];
    },
  });

  const publicImages = await repository.listReferenceImages({
    userId: ids.user,
    jobId: ids.job,
    referenceSetId: ids.referenceSet,
  });
  const privateImage = await repository.getReferenceImage({
    userId: ids.user,
    jobId: ids.job,
    referenceSetId: ids.referenceSet,
    view: "front",
    includePrivate: true,
  });

  assert.equal(publicImages[0].view, "front");
  assert.equal(Object.hasOwn(publicImages[0], "storageKey"), false);
  assert.equal(privateImage.storageKey, row.storage_key);
  assert.match(calls[0].sql, /reference_set\.user_id = \?/);
  assert.match(calls[0].sql, /ORDER BY image\.sequence_index ASC/);
  assert.deepEqual(calls[0].params, [ids.referenceSet, ids.job, ids.user]);
  assert.deepEqual(calls[1].params, [ids.referenceSet, ids.job, ids.user, "front"]);
});

test("reference generation state and Provider identifiers advance atomically", async () => {
  const calls = [];
  const referenceRow = {
    id: ids.referenceSet,
    user_id: ids.user,
    job_id: ids.job,
    source_photo_id: ids.preview,
    status: "processing",
    provider_task_id: "wan-private-task",
    provider_request_id: "wan-private-request",
    provider_status: "PENDING",
    expected_image_count: 4,
    actual_image_count: 0,
    usage_image_count: 0,
    cost_version: "2026-07-20",
    estimated_cost_fen: 200,
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  };
  const processingJob = {
    ...jobRow,
    status: "processing_references",
    reference_set_id: ids.referenceSet,
  };
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/SELECT job\.\*/.test(sql)) return [[{ ...jobRow, status: "submitting_references" }]];
        if (/SELECT \* FROM avatar_3d_reference_sets/.test(sql)) {
          return [[{ ...referenceRow, status: "submitting" }]];
        }
        if (/UPDATE avatar_3d_reference_sets/.test(sql)) return [[referenceRow]];
        if (/UPDATE avatar_3d_jobs/.test(sql)) return [[processingJob]];
        return [[]];
      },
    }),
  });

  const result = await repository.transitionReferenceGeneration({
    userId: ids.user,
    jobId: ids.job,
    referenceSetId: ids.referenceSet,
    fromJobStatus: "submitting_references",
    toJobStatus: "processing_references",
    fromReferenceStatus: "submitting",
    toReferenceStatus: "processing",
    progress: 10,
    providerTaskId: "wan-private-task",
    providerRequestId: "wan-private-request",
    providerStatus: "PENDING",
  });

  assert.equal(result.job.status, "processing_references");
  assert.equal(result.referenceSet.providerTaskId, "wan-private-task");
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.match(calls[2].sql, /provider_task_id = \?/);
  assert.match(calls[3].sql, /status = \?/);
});

test("reference confirmation requires the bound set and all four active slots", async () => {
  const calls = [];
  const acceptedReference = {
    id: ids.referenceSet,
    user_id: ids.user,
    job_id: ids.job,
    source_photo_id: ids.preview,
    status: "accepted",
    expected_image_count: 4,
    actual_image_count: 4,
    usage_image_count: 4,
    cost_version: "2026-07-20",
    estimated_cost_fen: 200,
    confirmed_at: "2026-07-21T10:00:00.000Z",
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  };
  const queuedJob = {
    ...jobRow,
    status: "queued_3d",
    reference_set_id: ids.referenceSet,
    quality_preset: "ultra",
    geometry_quality: "ultra",
    texture_quality: "detailed",
  };
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/SELECT job\.\*/.test(sql)) {
          return [[{
            ...jobRow,
            status: "awaiting_reference_confirmation",
            reference_set_id: ids.referenceSet,
          }]];
        }
        if (/SELECT \* FROM avatar_3d_reference_sets/.test(sql)) {
          return [[{ ...acceptedReference, status: "awaiting_confirmation" }]];
        }
        if (/COUNT\(\*\)/.test(sql)) {
          return [[{ image_count: 4, view_count: 4, first_sequence: 0, last_sequence: 3 }]];
        }
        if (/UPDATE avatar_3d_reference_sets/.test(sql)) return [[acceptedReference]];
        if (/UPDATE avatar_3d_jobs/.test(sql)) return [[queuedJob]];
        return [[]];
      },
    }),
  });

  const result = await repository.confirmReferenceSet({
    userId: ids.user,
    jobId: ids.job,
    referenceSetId: ids.referenceSet,
    qualityPreset: "ultra",
    geometryQuality: "ultra",
    textureQuality: "detailed",
    acceptedCostVersion: "2026-07-20",
    estimatedCostFen: 420,
  });

  assert.equal(result.job.status, "queued_3d");
  assert.equal(result.referenceSet.status, "accepted");
  assert.deepEqual(calls[0].params, [ids.job, ids.user, ids.referenceSet]);
  assert.match(calls[2].sql, /COUNT\(DISTINCT view\)/);
  assert.match(calls[4].sql, /quality_preset = \?/);
});

test("reference confirmation rejects an incomplete four-view set before updates", async () => {
  let updateCalls = 0;
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql) => {
        if (/SELECT job\.\*/.test(sql)) {
          return [[{
            ...jobRow,
            status: "awaiting_reference_confirmation",
            reference_set_id: ids.referenceSet,
          }]];
        }
        if (/SELECT \* FROM avatar_3d_reference_sets/.test(sql)) {
          return [[{ id: ids.referenceSet, status: "awaiting_confirmation" }]];
        }
        if (/COUNT\(\*\)/.test(sql)) {
          return [[{ image_count: 3, view_count: 3, first_sequence: 0, last_sequence: 2 }]];
        }
        if (/UPDATE/.test(sql)) updateCalls += 1;
        return [[]];
      },
    }),
  });

  await assert.rejects(
    () => repository.confirmReferenceSet({
      userId: ids.user,
      jobId: ids.job,
      referenceSetId: ids.referenceSet,
      qualityPreset: "ultra",
      geometryQuality: "ultra",
      textureQuality: "detailed",
      acceptedCostVersion: "2026-07-20",
      estimatedCostFen: 420,
    }),
    (error) => error?.details?.code === "REFERENCE_SET_INCOMPLETE",
  );
  assert.equal(updateCalls, 0);
});
