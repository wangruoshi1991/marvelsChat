import { MediaRetrievalMediaError } from "./media-retrieval-media.js";
import { MediaRetrievalProviderError } from "./media-retrieval-provider.js";
import { assertIndexingProvenance } from "./media-retrieval-provenance.js";

const PROVIDER_DISPATCH_FAILURES = new Set([
  "retrieval_service_unavailable",
  "retrieval_provider_transport_unavailable",
  "retrieval_not_enabled",
  "retrieval_job_lease_lost",
  "retrieval_temporary_cleanup_pending",
  "retrieval_budget_exhausted",
]);

class MediaRetrievalDispatchError extends Error {
  constructor(code) {
    super(code);
    this.name = "MediaRetrievalDispatchError";
    this.code = code;
  }
}

const safeFailureCode = (error) => {
  if (error instanceof MediaRetrievalDispatchError) return error.code;
  if (error instanceof MediaRetrievalProviderError || error instanceof MediaRetrievalMediaError) {
    return error.code;
  }
  return "retrieval_service_unavailable";
};

const stage = async (repository, job, eventType, payload = {}, workerId = null) => {
  if (workerId) {
    const heartbeat = await repository.heartbeatMediaRetrievalJob({ jobId: job.id, workerId });
    if (!heartbeat) throw new MediaRetrievalDispatchError("retrieval_job_lease_lost");
  }
  if (!job.agentRunId) return;
  await repository.appendAgentRunEvent({
    userId: job.userId,
    agentRunId: job.agentRunId,
    lifecycleStatus: "running",
    eventType,
    deliveryKey: `${eventType}:${job.id}:${payload.segmentIndex ?? "root"}`,
    payload,
  });
};

const verifyDispatch = async ({ repository, job, workerId, asset = null }) => {
  const verified = await repository.verifyMediaRetrievalJobDispatch({
    jobId: job.id,
    workerId,
    userId: job.userId,
    mediaAssetId: job.mediaAssetId,
    profileEpoch: job.profileEpoch,
    contentFingerprint: job.contentFingerprint,
    processingVersion: job.processingVersion,
    assetId: asset?.id || null,
  });
  if (!verified?.allowed) {
    throw new MediaRetrievalDispatchError(verified?.reasonCode || "retrieval_not_enabled");
  }
};

const blockJob = async ({ repository, job, workerId, failureCode }) => {
  await repository.failMediaRetrievalJob({
    jobId: job.id,
    workerId,
    lifecycleStatus: "blocked",
    failureCode,
  });
  return { status: "blocked", failureCode };
};

const reserve = async ({ repository, job, workerId, asset, operation, countUserAction }) => {
  await verifyDispatch({ repository, job, workerId, asset });
  const reservation = await repository.reserveProviderBudget({
    userId: job.userId,
    agentRunId: job.agentRunId,
    jobId: job.id,
    operation,
    countUserAction,
  });
  if (!reservation?.reserved) return null;
  return reservation;
};

const invokeProvider = async ({ repository, job, workerId, asset, invoke }) => {
  await verifyDispatch({ repository, job, workerId, asset });
  return invoke();
};

const cleanupQueuePersistenceFailure = async ({ repository, job }) => {
  // The failed job state below is still durable even if the supplemental run
  // event cannot be written, so this path never presents as cleanup-pending.
  if (job.agentRunId) {
    try {
      await repository.appendAgentRunEvent({
        userId: job.userId,
        agentRunId: job.agentRunId,
        lifecycleStatus: "failed",
        eventType: "temporary-cleanup-queue-failed",
        deliveryKey: `temporary-cleanup-queue-failed:${job.id}`,
        payload: { reasonCode: "retrieval_repository_write_failed" },
      });
    } catch {
      // FailMediaRetrievalJob records the same stable failure code afterward.
    }
  }
  const error = new MediaRetrievalDispatchError("retrieval_repository_write_failed");
  error.cleanupQueueAttempted = true;
  return error;
};

const queueTemporaryCleanup = async ({ repository, job, objectKey }) => {
  if (!objectKey) {
    throw await cleanupQueuePersistenceFailure({ repository, job });
  }
  let queued;
  try {
    queued = await repository.enqueueMediaRetrievalTemporaryCleanup({
      userId: job.userId,
      jobId: job.id,
      objectKey,
    });
  } catch {
    throw await cleanupQueuePersistenceFailure({ repository, job });
  }
  if (!queued?.queued) throw await cleanupQueuePersistenceFailure({ repository, job });
  return queued;
};

const settle = async ({ repository, reservation, disposition = "estimated", amountFen = reservation?.amountFen }) => {
  if (!reservation?.reservationId) return;
  await repository.settleProviderBudget({
    reservationId: reservation.reservationId,
    disposition,
    amountFen,
  });
};

const providerAllowsDispatch = (provider) => {
  const status = provider?.getRuntimeStatus?.();
  if (!status) return true;
  if (!status.configured || !status.enabled || !status.providerCallsEnabled) return false;
  return true;
};

const indexingProvenanceForProvider = (provider) => {
  try {
    if (typeof provider?.getIndexingProvenance !== "function") {
      throw new TypeError("Media retrieval provider does not declare indexing provenance.");
    }
    return assertIndexingProvenance(provider.getIndexingProvenance());
  } catch {
    throw new MediaRetrievalProviderError("retrieval_service_unavailable");
  }
};

const assertResumedStagingProvenance = ({ persistedStaging, indexingProvenance }) => {
  try {
    const expected = assertIndexingProvenance(indexingProvenance);
    for (const segment of Array.isArray(persistedStaging) ? persistedStaging : []) {
      const persisted = assertIndexingProvenance(segment);
      if (JSON.stringify(persisted) !== JSON.stringify(expected)) {
        throw new TypeError("Media retrieval staged segment provenance does not match the active provider.");
      }
    }
  } catch {
    // Do not resume a partially indexed asset into a different descriptor or
    // embedding space. A fresh, explicitly approved reindex can create a new
    // coherent version after the old staging artifacts are purged.
    throw new MediaRetrievalProviderError("retrieval_service_unavailable");
  }
};

const processIndexAsset = async ({ job, asset, media, repository, workerId }) => {
  await stage(repository, job, "reading-asset", {}, workerId);
  const source = await media.loadOwnedMediaBytes({ asset });
  if (asset.kind === "image") {
    const normalized = await media.normalizeImageForProvider(source);
    return [{ ...normalized, sourceKind: "image", frameTimestampMs: null }];
  }
  await stage(repository, job, "extracting-frames", {}, workerId);
  const frames = await media.extractRepresentativeFrames({
    bytes: source.bytes,
    mimeType: source.mimeType,
    maxFrames: 6,
  });
  return Promise.all(
    frames.map(async (frame) => ({
      ...(await media.normalizeImageForProvider({ bytes: frame.bytes, mimeType: frame.mimeType })),
      sourceKind: "video-frame",
      frameTimestampMs: frame.timestampMs,
    })),
  );
};

export async function processMediaRetrievalJob({ job, repository, provider, media, workerId }) {
  if (job.jobType === "purge-user" || job.jobType === "purge-asset") {
    await stage(repository, job, "committing", { jobType: job.jobType }, workerId);
    const purge = await repository.purgeMediaRetrievalArtifacts({
      userId: job.userId,
      mediaAssetId: job.jobType === "purge-asset" ? job.mediaAssetId : null,
    });
    if (!purge || Number(purge.residueCount) !== 0) {
      await repository.failMediaRetrievalJob({
        jobId: job.id,
        workerId,
        lifecycleStatus: "failed",
        failureCode: "retrieval_purge_incomplete",
      });
      return { status: "failed", failureCode: "retrieval_purge_incomplete" };
    }
    await repository.completeMediaRetrievalJob({
      jobId: job.id,
      workerId,
      checkpoint: {
        purged: true,
        deletedSegments: Number(purge.deletedSegments || 0),
        residueCount: 0,
      },
    });
    return { status: "succeeded" };
  }

  const profile = await repository.getMediaRetrievalProfile({ userId: job.userId });
  if (!profile || profile.indexState !== "enabled" || profile.consentVersion !== "media-retrieval-consent-v1") {
    return blockJob({ repository, job, workerId, failureCode: "retrieval_not_enabled" });
  }
  if (!providerAllowsDispatch(provider)) {
    return blockJob({ repository, job, workerId, failureCode: "retrieval_not_enabled" });
  }
  const dispatch = await repository.getMediaRetrievalDispatchState({ userId: job.userId });
  if (!dispatch?.canDispatch) {
    return blockJob({
      repository,
      job,
      workerId,
      failureCode: dispatch?.reasonCode || "retrieval_not_enabled",
    });
  }
  const asset = await repository.getIndexableMediaAsset({
    userId: job.userId,
    mediaAssetId: job.mediaAssetId,
  });
  if (!asset) {
    return blockJob({ repository, job, workerId, failureCode: "asset_not_indexable" });
  }
  const indexingProvenance = indexingProvenanceForProvider(provider);

  let reservation = null;
  try {
    await verifyDispatch({ repository, job, workerId, asset });
    const preparedFrames = await processIndexAsset({ job, asset, media, repository, workerId });
    const persistedStaging = await repository.listMediaRetrievalStagedSegments({
      userId: job.userId,
      jobId: job.id,
      workerId,
      contentFingerprint: job.contentFingerprint,
      processingVersion: job.processingVersion,
      profileEpoch: job.profileEpoch,
    });
    assertResumedStagingProvenance({ persistedStaging, indexingProvenance });
    const segmentsByIndex = new Map(
      (Array.isArray(persistedStaging) ? persistedStaging : [])
        .filter((segment) => Number.isInteger(Number(segment?.segmentIndex)))
        .map((segment) => [Number(segment.segmentIndex), segment]),
    );
    for (const [segmentIndex, frame] of preparedFrames.entries()) {
      // A staged frame and its checkpoint are written in one transaction, so
      // reclaimed jobs resume from this durable boundary without a new call.
      if (segmentsByIndex.has(segmentIndex)) continue;
      await verifyDispatch({ repository, job, workerId, asset });
      const temporary = await media.createEphemeralProviderUrl({
        userId: job.userId,
        traceId: job.traceId || "0".repeat(32),
        bytes: frame.bytes,
        mimeType: frame.mimeType,
      });
      let processingError = null;
      try {
        await stage(repository, job, "describing", { segmentIndex }, workerId);
        reservation = await reserve({
          repository,
          job,
          workerId,
          asset,
          operation: "image-description",
          countUserAction: segmentIndex === 0,
        });
        if (!reservation) {
          throw new MediaRetrievalDispatchError("retrieval_budget_exhausted");
        }
        const descriptor = await invokeProvider({
          repository,
          job,
          workerId,
          asset,
          invoke: () => provider.describeImage({
            imageUrl: temporary.url,
            traceId: job.traceId,
            reservation,
          }),
        });
        await settle({ repository, reservation });
        reservation = null;

        await stage(repository, job, "embedding", { segmentIndex }, workerId);
        reservation = await reserve({
          repository,
          job,
          workerId,
          asset,
          operation: "image-embedding",
          countUserAction: false,
        });
        if (!reservation) {
          throw new MediaRetrievalDispatchError("retrieval_budget_exhausted");
        }
        const embedding = await invokeProvider({
          repository,
          job,
          workerId,
          asset,
          invoke: () => provider.embedImage({
            imageUrl: temporary.url,
            traceId: job.traceId,
            reservation,
          }),
        });
        await settle({ repository, reservation });
        reservation = null;
        const segment = {
          segmentIndex,
          sourceKind: frame.sourceKind,
          frameTimestampMs: frame.frameTimestampMs,
          descriptor,
          embedding,
          ...indexingProvenance,
        };
        const staged = await repository.stageMediaRetrievalSegment({
          userId: job.userId,
          agentRunId: job.agentRunId,
          jobId: job.id,
          workerId,
          mediaAssetId: job.mediaAssetId,
          contentFingerprint: job.contentFingerprint,
          processingVersion: job.processingVersion,
          profileEpoch: job.profileEpoch,
          segment,
        });
        if (!staged) throw new MediaRetrievalDispatchError("retrieval_job_lease_lost");
        segmentsByIndex.set(segmentIndex, segment);
      } catch (error) {
        processingError = error;
      }
      try {
        await temporary.cleanup();
      } catch (error) {
        await queueTemporaryCleanup({
          repository,
          job,
          objectKey: error?.cleanupObjectKey || temporary.objectKey,
        });
        throw new MediaRetrievalDispatchError("retrieval_temporary_cleanup_pending");
      }
      if (processingError) throw processingError;
    }
    const segments = [...segmentsByIndex.values()].sort((left, right) => left.segmentIndex - right.segmentIndex);
    await stage(repository, job, "committing", { jobType: job.jobType }, workerId);
    await verifyDispatch({ repository, job, workerId, asset });
    const persisted = await repository.persistMediaRetrievalSegments({
      userId: job.userId,
      agentRunId: job.agentRunId,
      jobId: job.id,
      mediaAssetId: job.mediaAssetId,
      processingVersion: job.processingVersion,
      contentFingerprint: job.contentFingerprint,
      segments,
      stagingRequired: true,
      workerId,
    });
    if (persisted?.status === "invalidated") {
      return blockJob({
        repository,
        job,
        workerId,
        failureCode: persisted.reasonCode || "asset_not_indexable",
      });
    }
    await repository.completeMediaRetrievalJob({
      jobId: job.id,
      workerId,
      checkpoint: { completedSegments: segments.length, providerActionCounted: true },
    });
    return { status: "succeeded", indexedSegments: segments.length };
  } catch (error) {
    let failure = error;
    if (failure?.cleanupObjectKey && !failure.cleanupQueueAttempted) {
      try {
        await queueTemporaryCleanup({ repository, job, objectKey: failure.cleanupObjectKey });
        failure = new MediaRetrievalDispatchError("retrieval_temporary_cleanup_pending");
      } catch (cleanupQueueError) {
        failure = cleanupQueueError;
      }
    }
    await settle({ repository, reservation, disposition: "unknown" });
    const failureCode = safeFailureCode(failure);
    const lifecycleStatus = PROVIDER_DISPATCH_FAILURES.has(failureCode) ? "blocked" : "failed";
    await repository.failMediaRetrievalJob({
      jobId: job.id,
      workerId,
      lifecycleStatus,
      failureCode,
    });
    return { status: lifecycleStatus, failureCode };
  }
}
