import crypto from "node:crypto";
import { avatar3dFeatureForUser } from "./avatar-3d-feature.js";
import { avatar3dRepository } from "./avatar-3d-repository.js";
import { createAvatar3dJobProcessingService } from "./avatar-3d-job-processing-service.js";
import {
  avatar3dStorage,
  buildAvatarNormalizedPhotoObjectKey,
} from "./avatar-3d-storage.js";
import { createAvatar3dProviderRegistry } from "./avatar-3d-provider-registry.js";
import { buildAvatarMultiviewPrompt } from "./avatar-3d-multiview-prompt.js";
import { fetchTripoJob, submitTripoJob } from "./avatar-3d-tripo.js";
import {
  fetchWanMultiviewJob,
  submitWanMultiviewJob,
} from "./avatar-3d-wan-multiview.js";
import { config } from "./config.js";
import { terminalAvatar3dStatuses } from "./avatar-3d-repository-mappers.js";
import { HttpError } from "./http-error.js";
import {
  avatar3dDefaultQualityPreset,
  resolveAvatar3dQuality,
} from "./avatar-3d-quality.js";

const idempotencyHash = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const defaultProviders = createAvatar3dProviderRegistry({
  tripo: {
    submit: submitTripoJob,
    fetch: fetchTripoJob,
  },
});

const publicJob = (job) => job ? ({
  id: job.id,
  userId: job.userId,
  style: job.style,
  qualityPreset: job.qualityPreset,
  generationMode: job.generationMode,
  referenceSetId: job.referenceSetId,
  status: job.status,
  progress: job.progress,
  photoCount: job.photoCount,
  acceptedCostVersion: job.acceptedCostVersion,
  estimatedCostFen: job.estimatedCostFen,
  modelId: job.modelId,
  errorCode: job.errorCode,
  createdAt: job.createdAt,
  updatedAt: job.updatedAt,
  finishedAt: job.finishedAt,
}) : null;

const publicModel = (model) => model ? ({
  id: model.id,
  jobId: model.jobId,
  title: model.title,
  status: model.status,
  modelProvider: model.modelProvider,
  byteSize: model.byteSize,
  thumbnailAvailable: model.thumbnailAvailable,
  interactiveAvailable: model.interactiveAvailable,
  createdAt: model.createdAt,
  updatedAt: model.updatedAt,
}) : null;

export function createAvatar3dLifecycleService({
  repository = avatar3dRepository,
  storage = avatar3dStorage,
  wanMultiview = { submitWanMultiviewJob, fetchWanMultiviewJob },
  providers = defaultProviders,
  runtime = config.avatar3d,
  now = () => new Date(),
  randomUUID = crypto.randomUUID,
} = {}) {
  const featureFor = (user) => avatar3dFeatureForUser(user, runtime);

  const modelProviderFor = (job) => providers.resolve(job.modelProvider || "tripo");

  const assertEnabled = (user) => {
    const feature = featureFor(user);
    if (!feature.enabled) throw new HttpError(404, "Avatar feature is not available.");
    return feature;
  };

  const assertAvailable = (user) => {
    const feature = assertEnabled(user);
    if (!feature.generationAvailable) {
      throw new HttpError(503, "Avatar generation is temporarily unavailable.", {
        code: "PROVIDER_UNAVAILABLE",
      });
    }
    return feature;
  };

  const retentionUntil = () =>
    new Date(now().getTime() + Number(runtime.retentionDays || 7) * 24 * 60 * 60 * 1000);

  const markTerminalRetention = async (job) => {
    await repository.markJobAssetsRetention({
      userId: job.userId,
      jobId: job.id,
      retentionUntil: retentionUntil(),
    });
  };

  const transitionTerminal = async (job, toStatus, errorCode) => {
    const transitioned = await repository.transitionJob({
      userId: job.userId,
      jobId: job.id,
      fromStatus: job.status,
      toStatus,
      progress: 100,
      safeErrorCode: errorCode,
      retentionUntil: retentionUntil(),
    });
    await markTerminalRetention(transitioned);
    return transitioned;
  };

  const jobProcessingService = createAvatar3dJobProcessingService({
    repository,
    storage,
    wanMultiview,
    modelProviderFor,
    retentionUntil,
    markTerminalRetention,
    transitionTerminal,
  });

  const createJob = async ({ user, body, idempotencyKey }) => {
    const feature = assertAvailable(user);
    if (body.acceptedReferenceCostVersion !== feature.costVersion) {
      throw new HttpError(409, "Avatar cost estimate changed.", {
        code: "COST_VERSION_CHANGED",
      });
    }
    const quality = resolveAvatar3dQuality({
      preset: body.qualityPreset || avatar3dDefaultQualityPreset,
      runtime,
    });
    const planned = buildAvatarMultiviewPrompt({
      bodyShape: body.bodyShape,
      pose: body.pose,
      outfit: body.outfit,
      userDescription: body.userDescription,
    });
    return repository.createFaceFirstJob({
      userId: user.id,
      idempotencyKeyHash: idempotencyHash(idempotencyKey),
      sourcePhotoId: body.photoId,
      prompt: planned.plan.userDescription,
      promptPlan: { ...planned.plan, providerPrompt: planned.providerPrompt },
      promptPlanVersion: planned.version,
      qualityPreset: quality.id,
      geometryQuality: quality.geometryQuality,
      textureQuality: quality.textureQuality,
      acceptedCostVersion: feature.costVersion,
      estimatedCostFen: quality.estimatedCostFen,
      referenceCostVersion: feature.costVersion,
      referenceEstimatedCostFen: Number(feature.referenceGenerationEstimatedCostFen || 200),
      acceptedFaceComparison: body.acceptedFaceCompletion,
      acceptedAdultSubject: body.acceptedAdultSubject,
      consentVersion: "avatar-face-first-v1",
      dailyLimit: feature.dailyLimit,
    });
  };

  const preparePhotoUpload = async ({ user, body }) => {
    assertAvailable(user);
    const photoId = randomUUID();
    const prepared = storage.prepareAvatarPhotoUpload({ userId: user.id, photoId, ...body });
    const photo = await repository.createPhoto({
      id: photoId,
      userId: user.id,
      originalFilename: prepared.originalFilename,
      mimeType: body.mimeType,
      byteSize: body.byteSize,
      sourceStorageKey: prepared.objectKey,
    });
    return { photo, upload: prepared.upload };
  };

  const completePhotoUpload = async ({ user, photoId }) => {
    assertAvailable(user);
    const photo = await repository.getPhoto({ userId: user.id, photoId, includePrivate: true });
    if (!photo) throw new HttpError(404, "Avatar photo not found.");
    if (photo.jobId) throw new HttpError(409, "Avatar photo is already in use.");
    if (photo.status === "ready") {
      return repository.getPhoto({ userId: user.id, photoId, includePrivate: false });
    }
    const normalized = await storage.verifyAndNormalizeAvatarPhoto({
      sourceStorageKey: photo.sourceStorageKey,
      normalizedStorageKey: buildAvatarNormalizedPhotoObjectKey({
        userId: user.id,
        photoId: photo.id,
      }),
      expectedMimeType: photo.mimeType,
      expectedByteSize: photo.byteSize,
    });
    const completed = await repository.completePhoto({
      userId: user.id,
      photoId,
      normalized,
    });
    if (!completed) throw new HttpError(409, "Avatar photo state changed.");
    return completed;
  };

  const deletePhoto = async ({ user, photoId }) => {
    const photo = await repository.getPhoto({ userId: user.id, photoId, includePrivate: true });
    if (!photo) throw new HttpError(404, "Avatar photo not found.");
    if (photo.jobId) throw new HttpError(409, "Avatar photo is already in use.");
    await storage.deleteAvatarObjects([
      photo.sourceStorageKey,
      photo.normalizedStorageKey,
    ]);
    await repository.deletePhotoRecord({ userId: user.id, photoId });
    return { deleted: true };
  };

  const getReferences = async ({ user, jobId }) => {
    assertEnabled(user);
    const job = await repository.getJob({ userId: user.id, jobId, includePrivate: true });
    if (!job) throw new HttpError(404, "Avatar task not found.");
    const referenceSet = await repository.getReferenceSetForJob({
      userId: user.id,
      jobId,
      referenceSetId: job.referenceSetId,
    });
    const images = await repository.listReferenceImages({
      userId: user.id,
      jobId,
      referenceSetId: referenceSet.id,
    });
    return { referenceSet, images };
  };

  const confirmReferences = async ({ user, jobId, body }) => {
    const feature = assertAvailable(user);
    if (body.acceptedCostVersion !== feature.costVersion) {
      throw new HttpError(409, "Avatar cost estimate changed.", {
        code: "COST_VERSION_CHANGED",
      });
    }
    const job = await repository.getJob({ userId: user.id, jobId, includePrivate: true });
    if (!job) throw new HttpError(404, "Avatar task not found.");
    if (job.generationMode !== "face_first_multiview") {
      throw new HttpError(409, "This task has no generated reference set.");
    }
    const quality = resolveAvatar3dQuality({
      preset: body.qualityPreset,
      runtime,
    });
    return repository.confirmReferenceSet({
      userId: user.id,
      jobId,
      referenceSetId: body.referenceSetId,
      qualityPreset: quality.id,
      geometryQuality: quality.geometryQuality,
      textureQuality: quality.textureQuality,
      acceptedCostVersion: body.acceptedCostVersion,
      estimatedCostFen: quality.estimatedCostFen,
    });
  };

  const rejectReferences = async ({ user, jobId, referenceSetId }) => {
    const job = await repository.getJob({ userId: user.id, jobId, includePrivate: true });
    if (!job) throw new HttpError(404, "Avatar task not found.");
    const referenceSet = await repository.getReferenceSetForJob({
      userId: user.id,
      jobId,
      referenceSetId,
      includePrivate: true,
    });
    if (job.status !== "awaiting_reference_confirmation" || referenceSet.status !== "awaiting_confirmation") {
      throw new HttpError(409, "Avatar reference set cannot be rejected.");
    }
    const transitioned = await repository.transitionReferenceGeneration({
      userId: user.id,
      jobId,
      referenceSetId,
      fromJobStatus: "awaiting_reference_confirmation",
      toJobStatus: "cancelled",
      fromReferenceStatus: "awaiting_confirmation",
      toReferenceStatus: "rejected",
      progress: 100,
      safeErrorCode: "USER_REJECTED_REFERENCES",
      retentionUntil: retentionUntil(),
    });
    await markTerminalRetention(transitioned.job);
    return publicJob(transitioned.job);
  };

  const cancelJob = async ({ user, jobId }) => {
    const job = await repository.getJob({ userId: user.id, jobId, includePrivate: true });
    if (!job) throw new HttpError(404, "Avatar task not found.");
    if (terminalAvatar3dStatuses.has(job.status)) return publicJob(job);
    if (job.status === "awaiting_reference_confirmation") {
      return rejectReferences({ user, jobId, referenceSetId: job.referenceSetId });
    }
    if (job.status === "queued_references") {
      const referenceSet = await jobProcessingService.referenceContext(job);
      const transitioned = await repository.transitionReferenceGeneration({
        userId: user.id,
        jobId,
        referenceSetId: referenceSet.id,
        fromJobStatus: "queued_references",
        toJobStatus: "cancelled",
        fromReferenceStatus: "queued",
        toReferenceStatus: "rejected",
        progress: 100,
        safeErrorCode: "USER_CANCELLED",
        retentionUntil: retentionUntil(),
      });
      await markTerminalRetention(transitioned.job);
      return publicJob(transitioned.job);
    }
    if (job.status !== "queued_3d") {
      throw new HttpError(409, "Avatar task can no longer be cancelled.");
    }
    return publicJob(await transitionTerminal(job, "cancelled", "USER_CANCELLED"));
  };

  const getBootstrap = async ({ user }) => {
    const feature = assertEnabled(user);
    const [quota, jobs, models] = await Promise.all([
      repository.getQuotaState({ userId: user.id }),
      repository.listJobs({ userId: user.id, limit: 10 }),
      repository.listModels({ userId: user.id, limit: 20 }),
    ]);
    return {
      user,
      feature,
      quota: {
        dailyUsed: quota.dailyUsed,
        dailyRemaining: Math.max(0, feature.dailyLimit - quota.dailyUsed),
        hasActiveJob: quota.hasActiveJob,
      },
      jobs,
      activeJob: jobs.find((job) => !terminalAvatar3dStatuses.has(job.status)) || null,
      models,
    };
  };

  const deleteModel = async ({ user, modelId }) => {
    const model = await repository.getModel({ userId: user.id, modelId, includePrivate: true });
    if (!model) throw new HttpError(404, "Avatar model not found.");
    if (model.status !== "active" || !model.glbStorageKey) {
      throw new HttpError(409, "Avatar model is still being prepared.", {
        code: "MODEL_PREPARING",
      });
    }
    await storage.deleteAvatarObjects([
      model.glbStorageKey,
      model.mobileGlbStorageKey,
      model.thumbnailStorageKey,
    ]);
    await repository.deleteModelRecord({ userId: user.id, modelId });
    return { deleted: true };
  };

  const getJob = async ({ user, jobId }) => {
    assertEnabled(user);
    const job = await repository.getJob({ userId: user.id, jobId });
    if (!job) throw new HttpError(404, "Avatar task not found.");
    return publicJob(job);
  };

  const getReferenceImageFile = async ({ user, jobId, view, range = "" }) => {
    assertEnabled(user);
    const job = await repository.getJob({ userId: user.id, jobId });
    if (!job?.referenceSetId) throw new HttpError(404, "Avatar reference image not found.");
    const image = await repository.getReferenceImage({
      userId: user.id,
      jobId,
      referenceSetId: job.referenceSetId,
      view,
      includePrivate: true,
    });
    if (!image?.storageKey) throw new HttpError(404, "Avatar reference image not found.");
    return {
      response: await storage.streamAvatarObject({ objectKey: image.storageKey, range }),
      contentType: image.mimeType || "image/jpeg",
    };
  };

  const getModel = async ({ user, modelId }) => {
    assertEnabled(user);
    const model = await repository.getModel({ userId: user.id, modelId });
    if (!model) throw new HttpError(404, "Avatar model not found.");
    return publicModel(model);
  };

  const getModelFile = async ({ user, modelId, range = "" }) => {
    assertEnabled(user);
    const model = await repository.getModel({
      userId: user.id,
      modelId,
      includePrivate: true,
    });
    if (!model?.glbStorageKey) throw new HttpError(404, "Avatar model not found.");
    return {
      response: await storage.streamAvatarObject({ objectKey: model.glbStorageKey, range }),
      contentType: model.glbMimeType || "model/gltf-binary",
    };
  };

  const getAppModelFile = async ({ user, modelId, range = "" }) => {
    assertEnabled(user);
    const model = await repository.getModel({
      userId: user.id,
      modelId,
      includePrivate: true,
    });
    if (!model?.mobileGlbStorageKey) {
      throw new HttpError(409, "Avatar model is not ready for the App.", {
        code: "MOBILE_MODEL_ASSET_MISSING",
      });
    }
    return {
      response: await storage.streamAvatarObject({
        objectKey: model.mobileGlbStorageKey,
        range,
      }),
      contentType: model.mobileGlbMimeType || "model/gltf-binary",
    };
  };

  const getModelThumbnail = async ({ user, modelId, range = "" }) => {
    assertEnabled(user);
    const model = await repository.getModel({
      userId: user.id,
      modelId,
      includePrivate: true,
    });
    if (!model) throw new HttpError(404, "Avatar model not found.");
    if (!model.thumbnailStorageKey) throw new HttpError(404, "Avatar thumbnail not found.");
    return {
      response: await storage.streamAvatarObject({
        objectKey: model.thumbnailStorageKey,
        range,
      }),
      contentType: model.thumbnailMimeType || "image/jpeg",
    };
  };

  return {
    createJob,
    preparePhotoUpload,
    completePhotoUpload,
    deletePhoto,
    processJob: jobProcessingService.processJob,
    getReferences,
    confirmReferences,
    rejectReferences,
    cancelJob,
    getBootstrap,
    getJob,
    getReferenceImageFile,
    getModel,
    getModelFile,
    getAppModelFile,
    getModelThumbnail,
    deleteModel,
  };
}

export const avatar3dLifecycleService = createAvatar3dLifecycleService();
