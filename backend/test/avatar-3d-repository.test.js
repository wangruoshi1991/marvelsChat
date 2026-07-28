import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createAvatar3dRepository } = await import("../src/avatar-3d-repository.js");
const {
  mapAvatar3dJob,
  mapAvatar3dModel,
  mapAvatar3dPhoto,
  mapAvatar3dStylePreview,
} = await import("../src/repository-mappers.js");

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  job: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  preview: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  model: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
  referenceSet: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  attempt: "ffffffff-ffff-4fff-8fff-ffffffffffff",
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
    qualityPreset: "standard",
    geometryQuality: "standard",
    textureQuality: "standard",
    photoIds: ["11111111-1111-4111-8111-111111111111"],
    acceptedCostVersion: "2026-07-20",
    estimatedCostFen: 210,
  });

  assert.equal(first.created, true);
  assert.equal(first.job.id, ids.job);
  assert.match(calls[0].sql, /ON CONFLICT \(user_id, idempotency_key_hash\) DO NOTHING/);
  assert.match(calls[0].sql, /quality_preset/);
  assert.deepEqual(calls[0].params.slice(5, 8), ["standard", "standard", "standard"]);
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
    qualityPreset: "ultra",
    geometryQuality: "ultra",
    textureQuality: "detailed",
    photoIds: ["11111111-1111-4111-8111-111111111111"],
    acceptedCostVersion: "2026-07-20",
    estimatedCostFen: 210,
  });

  assert.equal(retry.created, false);
  assert.equal(retry.job.id, ids.job);
  assert.equal(retry.job.qualityPreset, "standard");
});

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

test("public job, preview, and model projections never expose private identifiers", () => {
  const publicJob = mapAvatar3dJob({
    ...jobRow,
    prompt: "private user description",
    prompt_plan: { providerPrompt: "private full provider prompt" },
  });
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

test("public job and model reads omit raw quality metrics while private worker reads retain them", async () => {
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
  assert.deepEqual(privateJob.qualityMetrics, qualityMetrics);
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
  assert.equal(completed.status, "active");
  assert.equal(completed.interactiveAvailable, true);
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
    5,
  );
  assert.match(calls[0].sql, /SELECT 'photo_source'[\s\S]*p\.source_storage_key/);
  assert.match(calls[0].sql, /SELECT 'photo_normalized'[\s\S]*p\.normalized_storage_key/);
  assert.match(calls[0].sql, /SELECT 'enhanced_photo'[\s\S]*p\.enhanced_storage_key/);
  assert.equal(
    calls[0].sql.match(/NOT p\.retain_for_regeneration/g)?.length,
    6,
  );
  assert.match(calls[0].sql, /p\.job_id IS NULL/);
  assert.match(calls[0].sql, /SELECT 'reference_image'[\s\S]*image\.storage_key/);
  assert.match(calls[0].sql, /image\.status = 'active'/);
  assert.doesNotMatch(calls[0].sql, /avatar_3d_models/);
  assert.deepEqual(calls[0].params, [new Date("2026-07-24T00:00:00Z")]);
});

test("photo cleanup clears all asset keys and closes records only after partial deletion completes", async () => {
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
  await repository.markPrivateAssetDeleted({
    assetKind: "enhanced_photo",
    assetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  });
  await repository.markPrivateAssetDeleted({
    assetKind: "enhanced_photo",
    assetId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
  });

  assert.match(calls[1].sql, /normalized_storage_key IS NULL AND enhanced_storage_key IS NULL/);
  assert.match(calls[2].sql, /source_storage_key = '' AND enhanced_storage_key IS NULL/);
  assert.match(calls[3].sql, /SET enhanced_storage_key = NULL/);
  assert.match(calls[3].sql, /source_storage_key = '' AND normalized_storage_key IS NULL/);
  for (const call of calls.slice(1)) {
    assert.match(call.sql, /NOT retain_for_regeneration/);
  }
  assert.equal(calls[3].sql, calls[4].sql, "enhanced cleanup must be retry-safe");
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

  assert.equal(transactionCalls.length, 5);
  assert.match(transactionCalls[3].sql, /UPDATE avatar_3d_reference_sets/);
  assert.match(transactionCalls[4].sql, /UPDATE avatar_3d_reference_images/);
  assert.deepEqual(transactionCalls[4].params, [retentionUntil, ids.job, ids.user]);
  assert.match(queryCalls[0].sql, /SET status = 'deleted', storage_key = '', deleted_at = CURRENT_TIMESTAMP/);
  assert.match(queryCalls[0].sql, /status = 'active' AND deleted_at IS NULL/);
});

test("face-first mapper fields preserve legacy records with safe defaults", () => {
  const legacyJob = mapAvatar3dJob(jobRow);
  const legacyPhoto = mapAvatar3dPhoto({
    id: ids.proposal,
    original_filename: "front.jpg",
    source_mime_type: "image/jpeg",
    source_byte_size: 42,
    status: "ready",
  });
  const legacyModel = mapAvatar3dModel({
    id: ids.model,
    job_id: ids.job,
    title: "Legacy model",
    status: "active",
    glb_byte_size: 42,
  });

  assert.equal(legacyJob.generationMode, "legacy_photo_3d");
  assert.equal(Object.hasOwn(legacyJob, "modelProvider"), false);
  assert.equal(Object.hasOwn(legacyJob, "prompt"), false);
  assert.equal(Object.hasOwn(legacyJob, "promptPlan"), false);
  assert.equal(legacyJob.referenceSetId, null);
  assert.equal(legacyJob.technicalRetryCount, 0);
  assert.equal(legacyJob.qualityStatus, null);
  assert.equal(Object.hasOwn(legacyJob, "qualityMetrics"), false);
  assert.equal(legacyPhoto.purpose, "reference");
  assert.equal(legacyPhoto.quality, null);
  assert.equal(legacyModel.modelProvider, "tripo");
  assert.equal(legacyModel.qualityStatus, null);
  assert.equal(Object.hasOwn(legacyModel, "qualityMetrics"), false);
});

test("private photos expose regeneration data while public photos omit private internals", async () => {
  const photoRow = {
    id: ids.preview,
    user_id: ids.user,
    original_filename: "front.jpg",
    source_mime_type: "image/jpeg",
    source_byte_size: 42,
    source_storage_key: "users/private/source.jpg",
    normalized_storage_key: "users/private/normalized.jpg",
    enhanced_storage_key: "users/private/enhanced.jpg",
    enhancement_provider_task_id: "enhancement-task-private",
    enhancement_request_id: "enhancement-request-private",
    retain_for_regeneration: true,
    quality_status: "passed",
    quality_metadata: { providerScore: 0.98, sourceStorageKey: "users/private/source.jpg" },
    status: "enhanced",
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

  assert.equal(privatePhoto.enhancedStorageKey, "users/private/enhanced.jpg");
  assert.equal(privatePhoto.enhancementProviderTaskId, "enhancement-task-private");
  assert.equal(privatePhoto.enhancementRequestId, "enhancement-request-private");
  assert.equal(privatePhoto.retainForRegeneration, true);
  assert.equal(privatePhoto.qualityStatus, "passed");
  assert.deepEqual(privatePhoto.qualityMetadata, photoRow.quality_metadata);
  assert.equal(mappedPublicPhoto.quality.level, "good");
  assert.equal(mappedPublicPhoto.quality.canContinue, true);
  assert.deepEqual(mappedPublicPhoto.quality.suggestions, []);
  assert.equal(Object.hasOwn(mappedPublicPhoto, "qualityMetadata"), false);
  for (const field of [
    "sourceStorageKey",
    "normalizedStorageKey",
    "enhancedStorageKey",
    "enhancementProviderTaskId",
    "enhancementRequestId",
    "retainForRegeneration",
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

test("reference sets enforce job and photo ownership without exposing Provider identifiers", async () => {
  const referenceSetRow = {
    id: ids.referenceSet,
    user_id: "user-1",
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
      return calls.length === 1 ? [referenceSetRow] : [];
    },
    randomUUID: () => ids.referenceSet,
  });

  const referenceSet = await repository.createReferenceSet({
    userId: "user-1",
    jobId: ids.job,
    sourcePhotoId: ids.preview,
    promptPlan: { bodyShape: "balanced", outfit: "smart_casual" },
    promptPlanVersion: "avatar-multiview-v1",
    costVersion: "2026-07-21",
    estimatedCostFen: 200,
    retentionUntil: new Date("2026-07-22T00:00:00Z"),
  });

  assert.equal(referenceSet.jobId, ids.job);
  assert.equal(referenceSet.expectedImageCount, 4);
  assert.equal(Object.hasOwn(referenceSet, "sourcePhotoId"), false);
  assert.equal(Object.hasOwn(referenceSet, "providerTaskId"), false);
  assert.equal(JSON.stringify(referenceSet).includes("private-provider"), false);
  await assert.rejects(() => repository.getReferenceSetForJob({
    userId: "user-2",
    jobId: ids.job,
    referenceSetId: referenceSet.id,
  }), /not found/i);
  assert.match(calls[0].sql, /avatar_3d_reference_sets/);
  assert.match(calls[0].sql, /photo\.job_id = job\.id/);
  assert.deepEqual(calls[0].params.slice(0, 3), [
    ids.referenceSet,
    "user-1",
    JSON.stringify({ bodyShape: "balanced", outfit: "smart_casual" }),
  ]);
  assert.deepEqual(calls[0].params.slice(-4), [ids.job, "user-1", ids.preview, "user-1"]);
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

test("generation attempts allow one known-uncharged technical replacement", async () => {
  const attempts = [];
  const job = { ...jobRow, status: "queued_generation", max_quality_attempts: 1, current_attempt_id: null };
  const calls = [];
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM avatar_3d_jobs/.test(sql)) return [[{ ...job }]];
        if (/FROM avatar_3d_job_photos/.test(sql)) return [[{ id: ids.preview }]];
        if (/FROM avatar_3d_generation_attempts/.test(sql) && /FOR UPDATE/.test(sql)) return [[...attempts]];
        if (/INSERT INTO avatar_3d_generation_attempts/.test(sql)) {
          const row = {
            id: params[0],
            job_id: params[1],
            user_id: params[2],
            attempt_number: params[3],
            kind: params[4],
            model_provider: params[5],
            provider_task_id: params[6],
            source_photo_id: params[7],
            status: params[8],
            artifact_manifest: params[9],
            created_at: jobRow.created_at,
            updated_at: jobRow.updated_at,
          };
          attempts.push(row);
          return [[row]];
        }
        if (/UPDATE avatar_3d_jobs/.test(sql)) {
          job.current_attempt_id = params[0];
          return [[]];
        }
        return [[]];
      },
    }),
    randomUUID: () => `${ids.attempt.slice(0, -1)}${attempts.length + 1}`,
  });

  const createAttempt = (kind) => repository.createGenerationAttempt({
    userId: ids.user,
    jobId: ids.job,
    kind,
    modelProvider: "tripo",
    providerTaskId: `task-${kind}`,
    sourcePhotoId: ids.preview,
    status: "submitting_generation",
  });
  const firstAttempt = await createAttempt("initial");
  attempts[0].status = "failed";
  attempts[0].billing_disposition = "uncharged";
  const technicalAttempt = await createAttempt("technical_replacement");

  assert.equal(firstAttempt.attemptNumber, 1);
  assert.equal(technicalAttempt.attemptNumber, 2);
  await assert.rejects(
    () => createAttempt("initial"),
    (error) => error?.details?.code === "MAX_PROVIDER_SUBMISSIONS_REACHED",
  );
  assert.match(calls[0].sql, /FOR UPDATE/);
  assert.match(calls.find((call) => /INSERT INTO avatar_3d_generation_attempts/.test(call.sql)).sql, /attempt_number/);
});

test("quality retries are rejected before any database work", async () => {
  let transactionCalls = 0;
  const repository = createAvatar3dRepository({
    transactionFn: async () => {
      transactionCalls += 1;
      throw new Error("transaction must not start");
    },
  });

  await assert.rejects(
    () => repository.createGenerationAttempt({
      userId: ids.user,
      jobId: ids.job,
      kind: "quality_retry",
      modelProvider: "tripo",
    }),
    (error) => error?.details?.code === "INVALID_ATTEMPT_KIND",
  );
  assert.equal(transactionCalls, 0);
});

test("technical replacements require the current failed attempt to be uncharged", async () => {
  const scenarios = [
    { status: "processing_generation", billing_disposition: "uncharged", label: "not failed" },
    { status: "failed", billing_disposition: null, label: "unknown billing" },
    { status: "failed", billing_disposition: "unknown", label: "explicitly unknown billing" },
    { status: "failed", billing_disposition: "charged", label: "charged" },
  ];

  for (const scenario of scenarios) {
    const current = {
      id: ids.attempt,
      attempt_number: 1,
      kind: "initial",
      quality_status: null,
      ...scenario,
    };
    const repository = createAvatar3dRepository({
      transactionFn: async (work) => work({
        execute: async (sql) => {
          if (/FROM avatar_3d_jobs/.test(sql)) {
            return [[{ ...jobRow, current_attempt_id: current.id, max_quality_attempts: 1 }]];
          }
          if (/FROM avatar_3d_generation_attempts/.test(sql)) return [[current]];
          return [[]];
        },
      }),
    });

    await assert.rejects(
      () => repository.createGenerationAttempt({
        userId: ids.user,
        jobId: ids.job,
        kind: "technical_replacement",
        modelProvider: "tripo",
      }),
      (error) => error?.details?.code === "TECHNICAL_REPLACEMENT_NOT_ELIGIBLE",
      scenario.label,
    );
  }
});

test("attempt operations require the job owner and public attempts omit private provider data", async () => {
  const privateAttemptRow = {
    id: ids.attempt,
    job_id: ids.job,
    attempt_number: 1,
    kind: "initial",
    model_provider: "tripo",
    provider_task_id: "provider-task-private",
    provider_request_id: "provider-request-private",
    source_photo_id: ids.preview,
    status: "quality_checking",
    artifact_manifest: {
      artifactUrl: "https://provider.example/private.glb",
      storageKey: "users/private/model.glb",
    },
    quality_metrics: {
      minimumSimilarityThreshold: 0.82,
      diagnosticUrl: "https://quality.example/private.json",
      sourceObjectKey: "users/private/quality-input.jpg",
      providerId: "quality-provider-private",
      providerRequestId: "quality-request-private",
      rawError: "quality evaluator stack trace",
    },
    billing_disposition: "uncharged",
    raw_error: "provider stack trace",
    created_at: jobRow.created_at,
    updated_at: jobRow.updated_at,
  };
  const calls = [];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [privateAttemptRow];
    },
  });

  const attempt = await repository.getCurrentGenerationAttempt({
    userId: ids.user,
    jobId: ids.job,
  });
  const privateAttempt = await repository.getCurrentGenerationAttempt({
    userId: ids.user,
    jobId: ids.job,
    includePrivate: true,
  });

  const serialized = JSON.stringify(attempt);
  for (const privateValue of [
    "provider-task-private",
    "provider-request-private",
    "https://provider.example/private.glb",
    "users/private/model.glb",
    "provider stack trace",
    "minimumSimilarityThreshold",
    "https://quality.example/private.json",
    "users/private/quality-input.jpg",
    "quality-provider-private",
    "quality-request-private",
    "quality evaluator stack trace",
  ]) {
    assert.equal(serialized.includes(privateValue), false);
  }
  assert.equal(Object.hasOwn(attempt, "providerTaskId"), false);
  assert.equal(Object.hasOwn(attempt, "artifactManifest"), false);
  assert.equal(Object.hasOwn(attempt, "qualityMetrics"), false);
  assert.equal(Object.hasOwn(attempt, "billingDisposition"), false);
  assert.equal(privateAttempt.providerTaskId, "provider-task-private");
  assert.equal(privateAttempt.providerRequestId, "provider-request-private");
  assert.equal(privateAttempt.artifactManifest.storageKey, "users/private/model.glb");
  assert.equal(privateAttempt.qualityMetrics.minimumSimilarityThreshold, 0.82);
  assert.equal(privateAttempt.billingDisposition, "uncharged");
  assert.equal(privateAttempt.rawError, "provider stack trace");
  assert.match(calls[0].sql, /job\.user_id = \?/);
  assert.deepEqual(calls[0].params, [ids.job, ids.user]);
});

test("createGenerationAttempt validates source photos against the job owner", async () => {
  const calls = [];
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/FROM avatar_3d_jobs/.test(sql)) return [[{ ...jobRow, max_quality_attempts: 1 }]];
        if (/FROM avatar_3d_job_photos/.test(sql)) return [[]];
        return [[]];
      },
    }),
  });

  await assert.rejects(
    () => repository.createGenerationAttempt({
      userId: ids.user,
      jobId: ids.job,
      kind: "initial",
      modelProvider: "tripo",
      sourcePhotoId: ids.preview,
    }),
    (error) => error?.status === 404 && error?.details?.code === "SOURCE_PHOTO_NOT_FOUND",
  );
  assert.match(calls[0].sql, /user_id = \?/);
  assert.match(calls[1].sql, /avatar_3d_job_photos/);
  assert.deepEqual(calls[1].params, [ids.preview, ids.user]);
});

test("quality recording uses ordered statements in one transaction and computes the job state", async () => {
  const runScenario = async ({
    qualityStatus,
    completedQualityEvaluations,
    expectedJobStatus,
  }) => {
    const calls = [];
    let transactionCalls = 0;
    const updatedAttempt = {
      id: ids.attempt,
      job_id: ids.job,
      attempt_number: completedQualityEvaluations,
      kind: "initial",
      model_provider: "tripo",
      provider_task_id: "provider-task-private",
      status: "quality_checking",
      quality_status: qualityStatus,
      quality_reason_code: "FACE_MISMATCH",
      quality_metrics: { similarity: 0.2 },
    };
    const repository = createAvatar3dRepository({
      queryFn: async () => {
        assert.fail("quality recording must use the transaction connection");
      },
      transactionFn: async (work) => {
        transactionCalls += 1;
        return work({
          execute: async (sql, params) => {
            calls.push({ sql, params });
            if (calls.length === 1) {
              return [[{
                ...updatedAttempt,
                quality_status: null,
              }]];
            }
            if (calls.length === 2) return [[updatedAttempt]];
            if (calls.length === 3) return [[{ completed_quality_evaluations: completedQualityEvaluations }]];
            if (calls.length === 4) return [[{ id: ids.job }]];
            assert.fail(`unexpected quality SQL call ${calls.length}`);
          },
        });
      },
    });

    const quality = await repository.recordAttemptQuality({
      userId: ids.user,
      attemptId: ids.attempt,
      qualityStatus,
      qualityReasonCode: "FACE_MISMATCH",
      qualityMetrics: { similarity: 0.2 },
    });

    assert.equal(transactionCalls, 1);
    assert.equal(calls.length, 4);
    assert.match(calls[0].sql, /FOR UPDATE OF job, attempt/);
    assert.match(calls[0].sql, /job\.user_id = \?/);
    assert.match(calls[1].sql, /^\s*UPDATE avatar_3d_generation_attempts/s);
    assert.match(calls[2].sql, /COUNT\(\*\).*quality_status IS NOT NULL/s);
    assert.match(calls[3].sql, /^\s*UPDATE avatar_3d_jobs/s);
    assert.equal(calls[3].params[3], expectedJobStatus);
    assert.equal(quality.qualityStatus, qualityStatus);
    assert.equal(quality.providerTaskId, "provider-task-private");
  };

  await runScenario({
    qualityStatus: "failed",
    completedQualityEvaluations: 1,
    expectedJobStatus: "quality_failed",
  });
  await runScenario({
    qualityStatus: "passed",
    completedQualityEvaluations: 1,
    expectedJobStatus: "succeeded",
  });
});

test("quality recording rejects invalid attempt state after locking it", async () => {
  for (const scenario of [
    { status: "processing_generation", qualityStatus: null, code: "INVALID_ATTEMPT_QUALITY_STATE" },
    { status: "quality_checking", qualityStatus: "passed", code: "ATTEMPT_QUALITY_ALREADY_RECORDED" },
  ]) {
    let executeCalls = 0;
    const repository = createAvatar3dRepository({
      transactionFn: async (work) => work({
        execute: async () => {
          executeCalls += 1;
          return [[{
            id: ids.attempt,
            job_id: ids.job,
            status: scenario.status,
            quality_status: scenario.qualityStatus,
            max_quality_attempts: 1,
          }]];
        },
      }),
    });

    await assert.rejects(
      () => repository.recordAttemptQuality({
        userId: ids.user,
        attemptId: ids.attempt,
        qualityStatus: "failed",
      }),
      (error) => error?.status === 409 && error?.details?.code === scenario.code,
    );
    assert.equal(executeCalls, 1);
  }
});

test("quality recording rejects unsupported quality statuses before SQL", async () => {
  for (const qualityStatus of [undefined, null, "", "pending", "PASSED", "quality_failed"]) {
    let transactionCalls = 0;
    const repository = createAvatar3dRepository({
      queryFn: async () => assert.fail("invalid quality status reached SQL"),
      transactionFn: async () => {
        transactionCalls += 1;
        assert.fail("invalid quality status opened a transaction");
      },
    });

    await assert.rejects(
      () => repository.recordAttemptQuality({
        userId: ids.user,
        attemptId: ids.attempt,
        qualityStatus,
      }),
      (error) => error?.status === 400 && error?.details?.code === "INVALID_QUALITY_STATUS",
    );
    assert.equal(transactionCalls, 0);
  }
});

test("attempt quality and claim refresh require the current runner claim", async () => {
  const calls = [];
  const repository = createAvatar3dRepository({
    transactionFn: async (work) => work({
      execute: async (sql, params) => {
        calls.push({ sql, params });
        if (/SELECT attempt\.\*/.test(sql)) {
          return [[{
            id: ids.attempt,
            job_id: ids.job,
            attempt_number: 1,
            kind: "initial",
            status: "quality_checking",
            quality_status: null,
            max_quality_attempts: 1,
          }]];
        }
        if (/UPDATE avatar_3d_generation_attempts/.test(sql)) {
          return [[{
            id: ids.attempt,
            job_id: ids.job,
            attempt_number: 1,
            kind: "initial",
            status: "quality_checking",
            quality_status: "failed",
            quality_reason_code: "FACE_MISMATCH",
            quality_metrics: { similarity: 0.2 },
          }]];
        }
        if (/COUNT\(\*\)/.test(sql)) return [[{ completed_quality_evaluations: 1 }]];
        if (/UPDATE avatar_3d_jobs/.test(sql)) return [[{ id: ids.job }]];
        return [[]];
      },
    }),
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [];
    },
  });

  const quality = await repository.recordAttemptQuality({
    userId: ids.user,
    attemptId: ids.attempt,
    qualityStatus: "failed",
    qualityReasonCode: "FACE_MISMATCH",
    qualityMetrics: { similarity: 0.2 },
  });
  const refreshed = await repository.refreshJobClaim({
    jobId: ids.job,
    claimedAt: new Date("2026-07-21T00:00:00Z"),
  });

  assert.equal(quality.qualityStatus, "failed");
  assert.equal(refreshed, null);
  assert.match(calls[1].sql, /quality_metrics/);
  assert.match(calls[4].sql, /claimed_at = \?/);
  assert.match(
    calls[4].sql,
    /SET claimed_at = date_trunc\('milliseconds', CURRENT_TIMESTAMP\)/,
  );
});

test("attempt billing disposition is worker-only and can be persisted", async () => {
  const calls = [];
  const repository = createAvatar3dRepository({
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [{
        id: ids.attempt,
        job_id: ids.job,
        attempt_number: 1,
        kind: "initial",
        status: "failed",
        billing_disposition: params[0],
      }];
    },
  });

  const attempt = await repository.updateGenerationAttempt({
    userId: ids.user,
    attemptId: ids.attempt,
    billingDisposition: "uncharged",
  });

  assert.match(calls[0].sql, /billing_disposition = \?/);
  assert.equal(attempt.billingDisposition, undefined);
});
