import crypto from "node:crypto";
import { avatar3dFeatureForUser } from "./avatar-3d-feature.js";
import { avatar3dRepository } from "./avatar-3d-repository.js";
import { avatar3dStorage } from "./avatar-3d-storage.js";
import { fetchTripoJob, submitTripoJob } from "./avatar-3d-tripo.js";
import { fetchWanxStyleJob, submitWanxStyleJob } from "./avatar-3d-wanx.js";
import { config } from "./config.js";
import { HttpError } from "./http-error.js";

const terminalStatuses = new Set(["succeeded", "failed", "cancelled", "submission_unknown"]);

const idempotencyHash = (value) =>
  crypto.createHash("sha256").update(String(value || "")).digest("hex");

const publicJob = (job) => {
  if (!job) return null;
  const {
    idempotencyKeyHash,
    styleProviderTaskId,
    modelProviderTaskId,
    providerStatus,
    claimedAt,
    retentionUntil,
    ...safe
  } = job;
  return safe;
};

const publicModel = (model) => {
  if (!model) return null;
  const {
    userId,
    providerTaskId,
    glbStorageKey,
    glbMimeType,
    thumbnailStorageKey,
    thumbnailMimeType,
    thumbnailByteSize,
    ...safe
  } = model;
  return safe;
};

export function createAvatar3dLifecycleService({
  repository = avatar3dRepository,
  storage = avatar3dStorage,
  tripo = { submitTripoJob, fetchTripoJob },
  wanx = { submitWanxStyleJob, fetchWanxStyleJob },
  runtime = config.avatar3d,
  now = () => new Date(),
  randomUUID = crypto.randomUUID,
} = {}) {
  const featureFor = (user) => avatar3dFeatureForUser(user, runtime);

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

  const createJob = async ({ user, body, idempotencyKey }) => {
    const feature = assertAvailable(user);
    const estimatedCostFen = feature.estimatedCostsFen[body.style];
    return repository.createJobWithPhotos({
      userId: user.id,
      idempotencyKeyHash: idempotencyHash(idempotencyKey),
      style: body.style,
      photos: body.photos,
      acceptedCostVersion: body.acceptedCostVersion,
      estimatedCostFen,
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
      normalizedStorageKey: `users/${user.id}/avatar-3d/photos/${photo.id}/normalized.jpg`,
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

  const realisticInputs = async (job) => {
    const photos = await repository.listJobPhotos({
      userId: job.userId,
      jobId: job.id,
      includePrivate: true,
    });
    if (!photos.length || photos.some((photo) => !photo.normalizedStorageKey)) {
      throw new HttpError(409, "Avatar photos are unavailable.", { code: "PHOTO_NOT_READY" });
    }
    return photos.map((photo) => ({
      view: photo.view,
      url: storage.createProviderReadUrl({ objectKey: photo.normalizedStorageKey }),
      mimeType: photo.normalizedMimeType || "image/jpeg",
    }));
  };

  const cartoonInput = async (job) => {
    const preview = await repository.getStylePreview({
      userId: job.userId,
      jobId: job.id,
      includePrivate: true,
    });
    if (!preview?.storageKey) {
      throw new HttpError(409, "Cartoon reference is unavailable.", {
        code: "STYLE_PREVIEW_MISSING",
      });
    }
    return [{
      view: "front",
      url: storage.createProviderReadUrl({ objectKey: preview.storageKey }),
      mimeType: preview.mimeType || "image/jpeg",
    }];
  };

  const submitStyle = async (job) => {
    const processing = await repository.transitionJob({
      userId: job.userId,
      jobId: job.id,
      fromStatus: "queued_style",
      toStatus: "processing_style",
      progress: 5,
    });
    try {
      const photos = await realisticInputs(processing);
      const front = photos.find((photo) => photo.view === "front");
      const submitted = await wanx.submitWanxStyleJob({ imageUrl: front.url });
      return repository.updateJobProgress({
        userId: processing.userId,
        jobId: processing.id,
        status: "processing_style",
        progress: submitted.progress,
        styleProviderTaskId: submitted.taskId,
        providerStatus: submitted.providerStatus,
      });
    } catch (error) {
      const code = error?.details?.code || "STYLE_GENERATION_FAILED";
      return transitionTerminal(
        processing,
        code === "WANX_SUBMISSION_UNKNOWN" ? "submission_unknown" : "failed",
        code,
      );
    }
  };

  const pollStyle = async (job) => {
    if (!job.styleProviderTaskId) {
      return transitionTerminal(job, "submission_unknown", "WANX_SUBMISSION_UNKNOWN");
    }
    let result;
    try {
      result = await wanx.fetchWanxStyleJob({ taskId: job.styleProviderTaskId });
    } catch (error) {
      if (error?.details?.code === "WANX_STATUS_UNAVAILABLE") {
        await repository.releaseJobClaim({ jobId: job.id });
        return job;
      }
      return transitionTerminal(job, "failed", error?.details?.code || "STYLE_GENERATION_FAILED");
    }
    if (result.state === "processing") {
      return repository.updateJobProgress({
        userId: job.userId,
        jobId: job.id,
        status: job.status,
        progress: result.progress,
        providerStatus: result.providerStatus,
      });
    }
    if (result.state === "failed") {
      return transitionTerminal(job, "failed", result.errorCode || "STYLE_GENERATION_FAILED");
    }
    try {
      const stored = await storage.persistAvatarStylePreview({
        userId: job.userId,
        jobId: job.id,
        imageUrl: result.imageUrl,
      });
      const preview = await repository.createStylePreview({
        userId: job.userId,
        jobId: job.id,
        providerTaskId: job.styleProviderTaskId,
        ...stored,
      });
      return repository.transitionJob({
        userId: job.userId,
        jobId: job.id,
        fromStatus: "processing_style",
        toStatus: "awaiting_style_confirmation",
        progress: 100,
        stylePreviewId: preview.id,
      });
    } catch (error) {
      await repository.releaseJobClaim({ jobId: job.id });
      throw error;
    }
  };

  const submitModel = async (job) => {
    const submitting = await repository.transitionJob({
      userId: job.userId,
      jobId: job.id,
      fromStatus: "queued_3d",
      toStatus: "submitting_3d",
      progress: 5,
    });
    try {
      const photos = job.style === "cartoon"
        ? await cartoonInput(submitting)
        : await realisticInputs(submitting);
      const submitted = await tripo.submitTripoJob({ photos });
      return repository.transitionJob({
        userId: submitting.userId,
        jobId: submitting.id,
        fromStatus: "submitting_3d",
        toStatus: "processing_3d",
        progress: submitted.progress,
        modelProviderTaskId: submitted.taskId,
        providerStatus: submitted.providerStatus,
      });
    } catch (error) {
      const code = error?.details?.code || "TRIPO_GENERATION_FAILED";
      return transitionTerminal(
        submitting,
        code === "TRIPO_SUBMISSION_UNKNOWN" ? "submission_unknown" : "failed",
        code,
      );
    }
  };

  const pollModel = async (job) => {
    if (!job.modelProviderTaskId) {
      return transitionTerminal(job, "submission_unknown", "TRIPO_SUBMISSION_UNKNOWN");
    }
    let result;
    try {
      result = await tripo.fetchTripoJob({ taskId: job.modelProviderTaskId });
    } catch (error) {
      if (error?.details?.code === "TRIPO_STATUS_UNAVAILABLE") {
        await repository.releaseJobClaim({ jobId: job.id });
        return job;
      }
      return transitionTerminal(job, "failed", error?.details?.code || "TRIPO_GENERATION_FAILED");
    }
    if (result.state === "processing") {
      return repository.updateJobProgress({
        userId: job.userId,
        jobId: job.id,
        status: job.status,
        progress: result.progress,
        providerStatus: result.providerStatus,
      });
    }
    if (result.state === "failed") {
      return transitionTerminal(job, "failed", result.errorCode || "TRIPO_GENERATION_FAILED");
    }
    try {
      const stored = await storage.persistAvatarProviderResult({
        userId: job.userId,
        jobId: job.id,
        modelUrl: result.pbrModelUrl,
        thumbnailUrl: result.renderedImageUrl || "",
      });
      const model = await repository.createModel({
        userId: job.userId,
        jobId: job.id,
        title: job.style === "cartoon" ? "我的卡通 3D 形象" : "我的写实 3D 形象",
        providerTaskId: job.modelProviderTaskId,
        glb: stored.glb,
        thumbnail: stored.thumbnail,
      });
      const persisting = await repository.transitionJob({
        userId: job.userId,
        jobId: job.id,
        fromStatus: "processing_3d",
        toStatus: "persisting",
        progress: 95,
        modelId: model.id,
      });
      const succeeded = await repository.transitionJob({
        userId: job.userId,
        jobId: job.id,
        fromStatus: "persisting",
        toStatus: "succeeded",
        progress: 100,
        modelId: model.id,
        retentionUntil: retentionUntil(),
      });
      await markTerminalRetention(succeeded);
      return succeeded;
    } catch (error) {
      await repository.releaseJobClaim({ jobId: job.id });
      throw error;
    }
  };

  const finishPersisting = async (job) => {
    const model = job.modelId
      ? await repository.getModel({ userId: job.userId, modelId: job.modelId })
      : null;
    if (!model) return transitionTerminal(job, "failed", "MODEL_PERSISTENCE_FAILED");
    const succeeded = await repository.transitionJob({
      userId: job.userId,
      jobId: job.id,
      fromStatus: "persisting",
      toStatus: "succeeded",
      progress: 100,
      modelId: model.id,
      retentionUntil: retentionUntil(),
    });
    await markTerminalRetention(succeeded);
    return succeeded;
  };

  const processJob = async (job) => {
    if (!job || terminalStatuses.has(job.status) || job.status === "awaiting_style_confirmation") {
      return job;
    }
    if (job.status === "queued_style") return submitStyle(job);
    if (job.status === "processing_style") return pollStyle(job);
    if (job.status === "queued_3d") return submitModel(job);
    if (job.status === "submitting_3d") {
      return transitionTerminal(job, "submission_unknown", "TRIPO_SUBMISSION_UNKNOWN");
    }
    if (job.status === "processing_3d") return pollModel(job);
    if (job.status === "persisting") return finishPersisting(job);
    return job;
  };

  const confirmStyle = async ({ user, jobId }) => {
    const job = await repository.getJob({ userId: user.id, jobId, includePrivate: true });
    if (!job) throw new HttpError(404, "Avatar task not found.");
    if (job.style !== "cartoon") throw new HttpError(409, "This task has no style preview.");
    if (job.status === "awaiting_style_confirmation") {
      await repository.transitionJob({
        userId: user.id,
        jobId,
        fromStatus: "awaiting_style_confirmation",
        toStatus: "queued_3d",
        progress: 0,
      });
    } else if (!["queued_3d", "submitting_3d", "processing_3d", "persisting", "succeeded"].includes(job.status)) {
      throw new HttpError(409, "Avatar task cannot be confirmed.");
    }
    return publicJob(await repository.getJob({ userId: user.id, jobId }));
  };

  const cancelJob = async ({ user, jobId }) => {
    const job = await repository.getJob({ userId: user.id, jobId, includePrivate: true });
    if (!job) throw new HttpError(404, "Avatar task not found.");
    if (terminalStatuses.has(job.status)) return publicJob(job);
    if (!["queued_style", "awaiting_style_confirmation", "queued_3d"].includes(job.status)) {
      throw new HttpError(409, "Avatar task can no longer be cancelled.");
    }
    if (job.status === "awaiting_style_confirmation") {
      await repository.discardStylePreview({ userId: user.id, jobId });
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
      activeJob: jobs.find((job) => !terminalStatuses.has(job.status)) || null,
      models,
    };
  };

  const deleteModel = async ({ user, modelId }) => {
    const model = await repository.getModel({ userId: user.id, modelId, includePrivate: true });
    if (!model) throw new HttpError(404, "Avatar model not found.");
    await storage.deleteAvatarObjects([model.glbStorageKey, model.thumbnailStorageKey]);
    await repository.deleteModelRecord({ userId: user.id, modelId });
    return { deleted: true };
  };

  const getJob = async ({ user, jobId }) => {
    assertEnabled(user);
    const job = await repository.getJob({ userId: user.id, jobId });
    if (!job) throw new HttpError(404, "Avatar task not found.");
    return publicJob(job);
  };

  const listJobs = async ({ user, limit = 10 }) => {
    assertEnabled(user);
    return repository.listJobs({ userId: user.id, limit });
  };

  const getPhotoFile = async ({ user, photoId, range = "" }) => {
    assertEnabled(user);
    const photo = await repository.getPhoto({
      userId: user.id,
      photoId,
      includePrivate: true,
    });
    if (!photo) throw new HttpError(404, "Avatar photo not found.");
    if (photo.status !== "ready" || !photo.normalizedStorageKey) {
      throw new HttpError(409, "Avatar photo is not ready.");
    }
    return {
      response: await storage.streamAvatarObject({
        objectKey: photo.normalizedStorageKey,
        range,
      }),
      contentType: photo.normalizedMimeType || "image/jpeg",
    };
  };

  const getStylePreviewFile = async ({ user, jobId, range = "" }) => {
    assertEnabled(user);
    const preview = await repository.getStylePreview({
      userId: user.id,
      jobId,
      includePrivate: true,
    });
    if (!preview?.storageKey) throw new HttpError(404, "Style preview not found.");
    return {
      response: await storage.streamAvatarObject({ objectKey: preview.storageKey, range }),
      contentType: preview.mimeType || "image/jpeg",
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
    processJob,
    confirmStyle,
    cancelJob,
    getBootstrap,
    getJob,
    listJobs,
    getPhotoFile,
    getStylePreviewFile,
    getModel,
    getModelFile,
    getModelThumbnail,
    deleteModel,
  };
}

export const avatar3dLifecycleService = createAvatar3dLifecycleService();
