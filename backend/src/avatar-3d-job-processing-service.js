import { terminalAvatar3dStatuses } from "./avatar-3d-repository-mappers.js";
import { HttpError } from "./http-error.js";

export function createAvatar3dJobProcessingService({
  repository,
  storage,
  wanMultiview,
  modelProviderFor,
  retentionUntil,
  markTerminalRetention,
  transitionTerminal,
}) {
  const multiviewInputs = async (job) => {
    const referenceSet = await repository.getReferenceSetForJob({
      userId: job.userId,
      jobId: job.id,
      referenceSetId: job.referenceSetId,
      includePrivate: true,
    });
    if (referenceSet.status !== "accepted") {
      throw new HttpError(409, "Avatar reference set has not been accepted.", {
        code: "REFERENCE_CONFIRMATION_REQUIRED",
      });
    }
    const images = await repository.listReferenceImages({
      userId: job.userId,
      jobId: job.id,
      referenceSetId: job.referenceSetId,
      includePrivate: true,
    });
    const requiredViews = ["front", "left", "back", "right"];
    if (
      images.length !== requiredViews.length
      || images.some((image, index) => image.view !== requiredViews[index] || !image.storageKey)
    ) {
      throw new HttpError(409, "Avatar reference set is incomplete.", {
        code: "REFERENCE_SET_INCOMPLETE",
      });
    }
    return images.map((image) => ({
      view: image.view,
      url: storage.createProviderReadUrl({ objectKey: image.storageKey }),
      mimeType: image.mimeType || "image/jpeg",
    }));
  };

  const referenceContext = async (job) => {
    if (!job.referenceSetId) {
      throw new HttpError(409, "Avatar reference set is unavailable.", {
        code: "REFERENCE_SET_NOT_FOUND",
      });
    }
    return repository.getReferenceSetForJob({
      userId: job.userId,
      jobId: job.id,
      referenceSetId: job.referenceSetId,
      includePrivate: true,
    });
  };

  const transitionReferenceTerminal = async ({
    job,
    referenceSet,
    toJobStatus,
    errorCode,
  }) => {
    const transitioned = await repository.transitionReferenceGeneration({
      userId: job.userId,
      jobId: job.id,
      referenceSetId: referenceSet.id,
      fromJobStatus: job.status,
      toJobStatus,
      fromReferenceStatus: referenceSet.status,
      toReferenceStatus: "failed",
      progress: 100,
      providerStatus: referenceSet.providerStatus,
      safeErrorCode: errorCode,
      retentionUntil: retentionUntil(),
    });
    await markTerminalRetention(transitioned.job);
    return transitioned.job;
  };

  const submitReferences = async (job) => {
    const referenceSet = await referenceContext(job);
    const photo = await repository.getPhoto({
      userId: job.userId,
      photoId: referenceSet.sourcePhotoId,
      includePrivate: true,
    });
    if (photo?.status !== "ready" || !photo.normalizedStorageKey) {
      return transitionReferenceTerminal({
        job,
        referenceSet,
        toJobStatus: "failed",
        errorCode: "PHOTO_NOT_READY",
      });
    }
    const submitting = await repository.transitionReferenceGeneration({
      userId: job.userId,
      jobId: job.id,
      referenceSetId: referenceSet.id,
      fromJobStatus: "queued_references",
      toJobStatus: "submitting_references",
      fromReferenceStatus: "queued",
      toReferenceStatus: "submitting",
      progress: 5,
    });
    let submitted;
    try {
      submitted = await wanMultiview.submitWanMultiviewJob({
        imageUrl: storage.createProviderReadUrl({ objectKey: photo.normalizedStorageKey }),
        prompt: referenceSet.promptPlan?.providerPrompt,
      });
    } catch (error) {
      const code = error?.details?.code || "REFERENCE_GENERATION_FAILED";
      return transitionReferenceTerminal({
        job: submitting.job,
        referenceSet: submitting.referenceSet,
        toJobStatus: code === "WAN_MULTIVIEW_SUBMISSION_UNKNOWN"
          ? "submission_unknown"
          : "failed",
        errorCode: code,
      });
    }
    if (submitted.state === "failed") {
      return transitionReferenceTerminal({
        job: submitting.job,
        referenceSet: submitting.referenceSet,
        toJobStatus: "failed",
        errorCode: submitted.errorCode || "REFERENCE_GENERATION_FAILED",
      });
    }
    const processing = await repository.transitionReferenceGeneration({
      userId: job.userId,
      jobId: job.id,
      referenceSetId: referenceSet.id,
      fromJobStatus: "submitting_references",
      toJobStatus: "processing_references",
      fromReferenceStatus: "submitting",
      toReferenceStatus: "processing",
      progress: submitted.progress,
      providerTaskId: submitted.taskId,
      providerRequestId: submitted.requestId,
      providerStatus: submitted.providerStatus,
    });
    return processing.job;
  };

  const pollReferences = async (job) => {
    const referenceSet = await referenceContext(job);
    if (!referenceSet.providerTaskId) {
      return transitionReferenceTerminal({
        job,
        referenceSet,
        toJobStatus: "failed",
        errorCode: "REFERENCE_TASK_MISSING",
      });
    }
    let result;
    try {
      result = await wanMultiview.fetchWanMultiviewJob({ taskId: referenceSet.providerTaskId });
    } catch (error) {
      if (error?.details?.code === "WAN_MULTIVIEW_STATUS_UNAVAILABLE") {
        await repository.releaseJobClaim({ jobId: job.id });
        return job;
      }
      return transitionReferenceTerminal({
        job,
        referenceSet,
        toJobStatus: "failed",
        errorCode: error?.details?.code || "REFERENCE_GENERATION_FAILED",
      });
    }
    if (result.state === "processing") {
      const updated = await repository.updateReferenceGenerationProgress({
        userId: job.userId,
        jobId: job.id,
        referenceSetId: referenceSet.id,
        progress: result.progress,
        providerStatus: result.providerStatus,
      });
      return updated.job;
    }
    if (result.state === "failed" || result.imageUrls?.length !== 4) {
      return transitionReferenceTerminal({
        job,
        referenceSet: { ...referenceSet, providerStatus: result.providerStatus },
        toJobStatus: "failed",
        errorCode: result.errorCode || "REFERENCE_SET_INCOMPLETE",
      });
    }
    const persisting = await repository.transitionReferenceGeneration({
      userId: job.userId,
      jobId: job.id,
      referenceSetId: referenceSet.id,
      fromJobStatus: "processing_references",
      toJobStatus: "persisting_references",
      fromReferenceStatus: "processing",
      toReferenceStatus: "persisting",
      progress: 95,
      providerRequestId: result.requestId,
      providerStatus: result.providerStatus,
    });
    return persisting.job;
  };

  const persistReferences = async (job) => {
    const referenceSet = await referenceContext(job);
    if (!referenceSet.providerTaskId) {
      return transitionReferenceTerminal({
        job,
        referenceSet,
        toJobStatus: "failed",
        errorCode: "REFERENCE_TASK_MISSING",
      });
    }
    let result;
    try {
      result = await wanMultiview.fetchWanMultiviewJob({ taskId: referenceSet.providerTaskId });
      if (result.state === "processing") {
        await repository.releaseJobClaim({ jobId: job.id });
        return job;
      }
      if (result.state === "failed" || result.imageUrls?.length !== 4) {
        return transitionReferenceTerminal({
          job,
          referenceSet: { ...referenceSet, providerStatus: result.providerStatus },
          toJobStatus: "failed",
          errorCode: result.errorCode || "REFERENCE_SET_INCOMPLETE",
        });
      }
      const stored = await storage.persistAvatarReferenceImages({
        userId: job.userId,
        jobId: job.id,
        referenceSetId: referenceSet.id,
        imageUrls: result.imageUrls,
      });
      await repository.persistReferenceImages({
        userId: job.userId,
        jobId: job.id,
        referenceSetId: referenceSet.id,
        images: stored.map((image) => ({
          ...image,
          mimeType: image.contentType,
        })),
        usageImageCount: result.usageCount,
      });
      return repository.getJob({ userId: job.userId, jobId: job.id, includePrivate: true });
    } catch (error) {
      if (["INVALID_REFERENCE_IMAGE", "REFERENCE_SET_INCOMPLETE"].includes(error?.details?.code)) {
        return transitionReferenceTerminal({
          job,
          referenceSet,
          toJobStatus: "failed",
          errorCode: error.details.code,
        });
      }
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
    let submitted;
    try {
      const photos = await multiviewInputs(submitting);
      submitted = await modelProviderFor(job).submit({
        photos,
        geometryQuality: submitting.geometryQuality || "standard",
        textureQuality: submitting.textureQuality || "standard",
      });
    } catch (error) {
      const code = error?.details?.code || "TRIPO_GENERATION_FAILED";
      return transitionTerminal(
        submitting,
        code === "TRIPO_SUBMISSION_UNKNOWN" ? "submission_unknown" : "failed",
        code,
      );
    }
    return repository.transitionJob({
      userId: submitting.userId,
      jobId: submitting.id,
      fromStatus: "submitting_3d",
      toStatus: "processing_3d",
      progress: submitted.progress,
      modelProviderTaskId: submitted.taskId,
      providerStatus: submitted.providerStatus,
    });
  };

  const pollModel = async (job) => {
    if (!job.modelProviderTaskId) {
      return transitionTerminal(job, "submission_unknown", "TRIPO_SUBMISSION_UNKNOWN");
    }
    let result;
    try {
      result = await modelProviderFor(job).fetch({ taskId: job.modelProviderTaskId });
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
      const thumbnail = await storage.persistAvatarProviderThumbnail({
        userId: job.userId,
        jobId: job.id,
        thumbnailUrl: result.renderedImageUrl || "",
      });
      const model = await repository.createPreparingModel({
        userId: job.userId,
        jobId: job.id,
        title: "我的写实 3D 形象",
        providerTaskId: job.modelProviderTaskId,
        thumbnail,
      });
      return repository.transitionJob({
        userId: job.userId,
        jobId: job.id,
        fromStatus: "processing_3d",
        toStatus: "persisting",
        progress: 95,
        modelId: model.id,
        providerStatus: result.providerStatus,
      });
    } catch (error) {
      await repository.releaseJobClaim({ jobId: job.id });
      throw error;
    }
  };

  const finishPersisting = async (job) => {
    let model = await repository.getJobModel({
      userId: job.userId,
      jobId: job.id,
      includePrivate: true,
    });
    if (!model) return transitionTerminal(job, "failed", "MODEL_PERSISTENCE_FAILED");

    try {
      if (model.status !== "active" || !model.glbStorageKey) {
        if (model.status !== "preparing" || !job.modelProviderTaskId) {
          return transitionTerminal(job, "failed", "MODEL_PERSISTENCE_FAILED");
        }

        let result;
        try {
          result = await modelProviderFor(job).fetch({ taskId: job.modelProviderTaskId });
        } catch (error) {
          if (error?.details?.code === "TRIPO_STATUS_UNAVAILABLE") {
            await repository.releaseJobClaim({ jobId: job.id });
            return job;
          }
          return transitionTerminal(
            job,
            "failed",
            error?.details?.code || "MODEL_PERSISTENCE_FAILED",
          );
        }
        if (result.state === "processing") {
          await repository.releaseJobClaim({ jobId: job.id });
          return job;
        }
        if (result.state === "failed") {
          return transitionTerminal(job, "failed", result.errorCode || "TRIPO_GENERATION_FAILED");
        }

        const glb = await storage.persistAvatarProviderModel({
          userId: job.userId,
          jobId: job.id,
          modelUrl: result.pbrModelUrl,
        });
        model = await repository.completePreparingModel({
          userId: job.userId,
          jobId: job.id,
          glb,
        });
        if (!model) {
          model = await repository.getJobModel({
            userId: job.userId,
            jobId: job.id,
            includePrivate: true,
          });
        }
        if (model?.status !== "active" || !model.glbStorageKey) {
          throw new HttpError(409, "Avatar model state changed.", {
            code: "MODEL_PERSISTENCE_CONFLICT",
          });
        }
      }

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

  const processJob = async (job) => {
    if (
      !job
      || terminalAvatar3dStatuses.has(job.status)
      || job.status === "awaiting_reference_confirmation"
    ) {
      return job;
    }
    if (job.status === "queued_references") return submitReferences(job);
    if (job.status === "submitting_references") {
      const referenceSet = await referenceContext(job);
      return transitionReferenceTerminal({
        job,
        referenceSet,
        toJobStatus: "submission_unknown",
        errorCode: "WAN_MULTIVIEW_SUBMISSION_UNKNOWN",
      });
    }
    if (job.status === "processing_references") return pollReferences(job);
    if (job.status === "persisting_references") return persistReferences(job);
    if (job.status === "queued_3d") return submitModel(job);
    if (job.status === "submitting_3d") {
      return transitionTerminal(job, "submission_unknown", "TRIPO_SUBMISSION_UNKNOWN");
    }
    if (job.status === "processing_3d") return pollModel(job);
    if (job.status === "persisting") return finishPersisting(job);
    return job;
  };

  return { processJob, referenceContext };
}
