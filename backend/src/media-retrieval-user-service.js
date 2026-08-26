import { MEDIA_RETRIEVAL_CONSENT_VERSION } from "./media-retrieval-constants.js";
import {
  B7_PRODUCT_BASELINE_METHOD,
  normalizeB7ProductBaselineQuery,
} from "./media-retrieval-b7-baseline.js";
import { retrieveB7ProductBaseline } from "./media-retrieval-b7-service.js";
import { getMediaRetrievalErrorContract } from "./media-retrieval-errors.js";
import {
  buildVisualEmbeddingInput,
  createVisualEmbeddingBinding,
  toProviderVisualEmbeddingInput,
} from "./media-retrieval-embedding-input.js";
import {
  assertEmbeddingProvenance,
  createEmbeddingProvenance,
} from "./media-retrieval-provenance.js";
import {
  MEDIA_RETRIEVAL_ERROR_CONTRACTS,
  projectMediaRetrievalSearchResponse,
  projectMediaRetrievalSearchResult,
} from "../../shared/media-retrieval-public-contract.js";

export class MediaRetrievalServiceError extends Error {
  constructor(code) {
    const contract = getMediaRetrievalErrorContract(code);
    super(contract.message);
    this.name = "MediaRetrievalServiceError";
    this.code = code;
    this.status = contract.status;
    this.retryable = contract.retryable;
  }
}

const bucketScore = (score) => {
  if (!Number.isFinite(score)) return "low";
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
};

const toPublicResults = (results = []) =>
  results.map((result) => projectMediaRetrievalSearchResult({
    mediaAssetId: result.mediaAssetId,
    kind: result.kind,
    matchedFrameTimestampMs: result.matchedFrameTimestampMs,
    summary: result.summary,
    matchReasons: result.matchReasons,
    scoreBucket: bucketScore(result.score),
  }));

const enabledProfile = async (repository, userId) => {
  const profile = await repository.getMediaRetrievalProfile({ userId });
  if (!profile || profile.indexState !== "enabled" || profile.consentVersion !== MEDIA_RETRIEVAL_CONSENT_VERSION) {
    throw new MediaRetrievalServiceError("retrieval_consent_required");
  }
  return profile;
};

const providerCanSearch = (provider) => {
  const status = provider?.getRuntimeStatus?.() || {};
  return Boolean(
    status.configured &&
      status.enabled &&
      status.providerCallsEnabled,
  );
};

const MAX_PROVIDER_FAILURE_CODE_LENGTH = 120;

// Provider errors are untrusted input. Only an exact member of the shared
// public contract can cross this service boundary into a run or event.
const canonicalProviderFailureCode = (value) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= MAX_PROVIDER_FAILURE_CODE_LENGTH &&
  Object.hasOwn(MEDIA_RETRIEVAL_ERROR_CONTRACTS, value)
    ? value
    : "retrieval_service_unavailable";

const reserveAndCall = async ({ repository, provider, run, operation, countUserAction, invoke }) => {
  const reservation = await repository.reserveProviderBudget({
    userId: run.userId,
    agentRunId: run.id,
    jobId: null,
    operation,
    countUserAction,
  });
  if (!reservation?.reserved) return { value: null, blocked: true, failureCode: "retrieval_budget_exhausted" };
  try {
    const value = await invoke(reservation);
    await repository.settleProviderBudget({
      reservationId: reservation.reservationId,
      disposition: "estimated",
      amountFen: reservation.amountFen,
    });
    return { value, blocked: false, failureCode: null };
  } catch (error) {
    await repository.settleProviderBudget({
      reservationId: reservation.reservationId,
      disposition: "unknown",
      amountFen: reservation.amountFen,
    });
    return {
      value: null,
      blocked: true,
      failureCode: canonicalProviderFailureCode(error?.code),
    };
  }
};

const asB7NormalizedQuery = (embeddingInput) => ({
  visualQuery: embeddingInput.mode === "visual" ? embeddingInput.text : "",
  identityTerms: embeddingInput.identityTerms,
  parseConfidence: embeddingInput.mode === "visual" ? "high" : "low",
});

const createProductEmbeddingBinding = ({ provider, input, vector }) => {
  const status = provider?.getRuntimeStatus?.() || {};
  const declared = provider?.getIndexingProvenance?.()?.embeddingProvenance;
  // The production provider declares its actual index space. The fallback is
  // retained only for isolated contract doubles that do not create segments.
  const embeddingProvenance = declared
    ? assertEmbeddingProvenance(declared)
    : createEmbeddingProvenance({
      modelId: String(status.embeddingModel || "media-retrieval-runtime").slice(0, 160),
      modelVersion: String(status.embeddingModelVersion || `dimension-${Number(status.embeddingDimension) || 1024}`).slice(0, 160),
      dimension: Number(status.embeddingDimension) || 1024,
      normalization: String(status.embeddingNormalization || "provider-native-dense-v1").slice(0, 80),
      configuration: {
        provider: "runtime-status-contract-double-v1",
        inputPolicyVersion: input.policyVersion,
      },
    });
  return createVisualEmbeddingBinding({
    input,
    vector,
    modelId: embeddingProvenance.modelId,
    modelVersion: embeddingProvenance.modelVersion,
    dimension: embeddingProvenance.dimension,
    embeddingNormalization: embeddingProvenance.normalization,
    configurationHash: embeddingProvenance.configurationHash,
  });
};

export function createMediaRetrievalUserService({ repository, provider, getRuntimeStatus = null }) {
  if (!repository) throw new TypeError("Media retrieval user service requires a repository.");

  const ensureRouteEligible = async () => {
    let status;
    try {
      status = await getRuntimeStatus?.();
    } catch {
      throw new MediaRetrievalServiceError("retrieval_service_unavailable");
    }
    if (status && !status?.routeEligibility?.canRouteNewRun) {
      throw new MediaRetrievalServiceError("retrieval_service_unavailable");
    }
  };

  const enableMediaRetrieval = async ({ userId, consentVersion, idempotencyKey }) => {
    await ensureRouteEligible();
    if (consentVersion !== MEDIA_RETRIEVAL_CONSENT_VERSION) {
      throw new MediaRetrievalServiceError("retrieval_consent_required");
    }
    const created = await repository.createOrGetMediaRetrievalRun({
      userId,
      runType: "media-index",
      idempotencyKey,
      confirmed: true,
      inputSummary: { operation: "enable" },
    });
    if (created.reused) {
      return { agentRunId: created.run.id, lifecycleStatus: created.run.lifecycleStatus, reused: true };
    }
    await repository.enableMediaRetrievalProfile({
      userId,
      consentVersion,
      agentRunId: created.run.id,
    });
    const backfill = await repository.enqueueBackfillJobs({ userId, agentRunId: created.run.id });
    await repository.appendAgentRunEvent({
      userId,
      agentRunId: created.run.id,
      lifecycleStatus: "queued",
      eventType: "queued",
      deliveryKey: `queued:${created.run.id}`,
      payload: backfill,
    });
    return {
      agentRunId: created.run.id,
      lifecycleStatus: "queued",
      backfill,
      reused: false,
    };
  };

  const getMediaRetrievalStatus = async ({ userId }) => {
    const [status, runtime] = await Promise.all([
      repository.getMediaRetrievalStatusForUser({ userId }),
      getRuntimeStatus ? getRuntimeStatus().catch(() => null) : Promise.resolve(null),
    ]);
    const currentBackfill = status.recentRuns.find((run) => run.runType === "media-index") || null;
    return {
      enabled: status.profile?.indexState === "enabled",
      consentVersion: status.profile?.consentVersion || null,
      backfill: {
        agentRunId: currentBackfill?.id || null,
        lifecycleStatus: currentBackfill?.lifecycleStatus || "idle",
        indexedAssets: Number(status.jobs.succeeded || 0),
        skippedAssets: Number(status.jobs.blocked || 0) + Number(status.jobs.failed || 0),
        totalAssets: Object.values(status.jobs).reduce((total, value) => total + Number(value || 0), 0),
      },
      quota: {
        dailyRemaining: Math.max(0, Number(status.limits?.userDailyRequestLimit || 0) - Number(status.quota.action_count || 0)),
        monthlyRemainingFen: Math.max(0, Number(status.limits?.userMonthlyBudgetFen || 0) - Number(status.quota.monthly_committed_fen || 0)),
      },
      availability: runtime?.publicAvailability || {
        state: "temporarily-unavailable",
        canStartRun: false,
        reasonCodes: ["not-ready"],
      },
      recentRuns: status.recentRuns,
    };
  };

  const searchMediaRetrieval = async ({ userId, query, kind = null, albumId = null, limit = 10 }) => {
    await ensureRouteEligible();
    await enabledProfile(repository, userId);
    const created = await repository.createOrGetMediaRetrievalRun({
      userId,
      runType: "media-search",
      inputSummary: { operation: "search", kind: kind || "all" },
    });
    const run = { ...created.run, userId };
    await repository.transitionMediaRetrievalRun({
      userId,
      agentRunId: run.id,
      lifecycleStatus: "running",
      eventType: "searching",
    });

    const finishBlockedSearch = async (failureCode) => {
      await repository.transitionMediaRetrievalRun({
        userId,
        agentRunId: run.id,
        lifecycleStatus: "blocked",
        failureCode,
        eventType: "blocked",
      });
      throw new MediaRetrievalServiceError(failureCode);
    };

    // A raw query is never assumed to be a safe visual query. It can only
    // produce an exact-only fallback after deterministic identity inspection.
    let embeddingInput = buildVisualEmbeddingInput({
      rawQuery: query,
      candidate: { visualQuery: "", identityTerms: [], parseConfidence: "low" },
    });
    let queryEmbedding = null;
    // Identity-bearing raw input is already exact-only. Do not call a parser
    // merely to recover visual text, because an upstream parser miss cannot
    // weaken the final policy boundary.
    const rawIdentityExactOnly = embeddingInput.identityTerms.length > 0;
    if (providerCanSearch(provider) && !rawIdentityExactOnly) {
      const parsed = await reserveAndCall({
        repository,
        provider,
        run,
        operation: "query-parse",
        countUserAction: true,
        invoke: (reservation) => provider.parseRetrievalQuery({ query, traceId: run.traceId, reservation }),
      });
      // A successful parser invocation is still untrusted. Passing the value
      // explicitly preserves the final builder's malformed-candidate veto for
      // null, undefined, and every other falsy return value.
      if (!parsed.blocked) {
        embeddingInput = buildVisualEmbeddingInput({ rawQuery: query, candidate: parsed.value });
      }
      if (parsed.blocked && !(embeddingInput.mode === "exact-only" && embeddingInput.identityTerms.length)) {
        await finishBlockedSearch(parsed.failureCode || "retrieval_service_unavailable");
      }
      if (embeddingInput.mode === "visual") {
        const embedded = await reserveAndCall({
          repository,
          provider,
          run,
          operation: "query-embedding",
          countUserAction: false,
          invoke: (reservation) => provider.embedText({
            input: toProviderVisualEmbeddingInput(embeddingInput),
            traceId: run.traceId,
            reservation,
          }),
        });
        if (embedded.blocked || !embedded.value) {
          await finishBlockedSearch(embedded.failureCode || "retrieval_service_unavailable");
        }
        queryEmbedding = createProductEmbeddingBinding({ provider, input: embeddingInput, vector: embedded.value });
      }
    } else if (!(embeddingInput.mode === "exact-only" && embeddingInput.identityTerms.length)) {
      await finishBlockedSearch("retrieval_service_unavailable");
    }

    if (embeddingInput.mode !== "visual" && !embeddingInput.identityTerms.length) {
      await finishBlockedSearch("retrieval_policy_unverifiable");
    }
    const baseline = await retrieveB7ProductBaseline({
      repository,
      userId,
      normalizedQuery: asB7NormalizedQuery(embeddingInput),
      queryEmbedding,
      kind,
      albumId,
      limit,
      allowLocalLexical: embeddingInput.mode === "visual",
    });
    await repository.transitionMediaRetrievalRun({
      userId,
      agentRunId: run.id,
      lifecycleStatus: "succeeded",
      failureCode: null,
      eventType: "completed",
    });
    return projectMediaRetrievalSearchResponse({
      agentRunId: run.id,
      lifecycleStatus: "succeeded",
      method: B7_PRODUCT_BASELINE_METHOD,
      results: toPublicResults(baseline.results),
    });
  };

  const requestMediaRetrievalReindex = async ({ userId, scope, mediaAssetIds, idempotencyKey }) => {
    await ensureRouteEligible();
    await enabledProfile(repository, userId);
    const created = await repository.createOrGetMediaRetrievalRun({
      userId,
      runType: "media-reindex",
      idempotencyKey,
      confirmed: true,
      inputSummary: { operation: "reindex", scope, requestedAssetCount: mediaAssetIds.length },
    });
    if (created.reused) {
      return { agentRunId: created.run.id, lifecycleStatus: created.run.lifecycleStatus, reused: true };
    }
    const jobs = await repository.enqueueReindexJobs({ userId, agentRunId: created.run.id, scope, mediaAssetIds });
    await repository.appendAgentRunEvent({
      userId,
      agentRunId: created.run.id,
      lifecycleStatus: "queued",
      eventType: "queued",
      deliveryKey: `queued:${created.run.id}`,
      payload: jobs,
    });
    return { agentRunId: created.run.id, lifecycleStatus: "queued", jobs, reused: false };
  };

  const deleteMediaRetrievalIndex = async ({ userId, idempotencyKey }) => {
    const created = await repository.createOrGetMediaRetrievalRun({
      userId,
      runType: "media-purge",
      idempotencyKey,
      confirmed: true,
      inputSummary: { operation: "delete-index" },
    });
    if (created.reused) {
      return { agentRunId: created.run.id, lifecycleStatus: created.run.lifecycleStatus, reused: true };
    }
    const job = await repository.beginIndexPurge({ userId, agentRunId: created.run.id });
    await repository.appendAgentRunEvent({
      userId,
      agentRunId: created.run.id,
      lifecycleStatus: "queued",
      eventType: "queued",
      deliveryKey: `queued:${created.run.id}`,
      payload: { jobType: job.jobType },
    });
    return { agentRunId: created.run.id, lifecycleStatus: "queued", reused: false };
  };

  const enqueueUploadedMediaAsset = async ({ userId, mediaAssetId }) => {
    try {
      await ensureRouteEligible();
    } catch (error) {
      return { queued: false, reasonCode: error?.code || "retrieval_service_unavailable" };
    }
    if (!providerCanSearch(provider)) return { queued: false, reasonCode: "retrieval_not_enabled" };
    const dispatch = typeof repository.getMediaRetrievalDispatchState === "function"
      ? await repository.getMediaRetrievalDispatchState({ userId })
      : { canDispatch: await repository.canEnqueueMediaRetrievalForUser({ userId }) };
    if (!dispatch?.canDispatch) {
      return { queued: false, reasonCode: dispatch?.reasonCode || "retrieval_not_enabled" };
    }
    const created = await repository.createOrGetMediaRetrievalRun({
      userId,
      runType: "media-index",
      inputSummary: { operation: "upload", source: "upload" },
    });
    const job = await repository.enqueueAssetIndexJob({
      userId,
      mediaAssetId,
      source: "upload",
      agentRunId: created.run.id,
    });
    if (!job) {
      await repository.transitionMediaRetrievalRun({
        userId,
        agentRunId: created.run.id,
        lifecycleStatus: "blocked",
        failureCode: "retrieval_index_enqueue_failed",
        eventType: "index-not-queued",
      });
      return {
        queued: false,
        reasonCode: "retrieval_index_enqueue_failed",
        agentRunId: created.run.id,
      };
    }
    await repository.appendAgentRunEvent({
      userId,
      agentRunId: created.run.id,
      lifecycleStatus: "queued",
      eventType: "queued",
      deliveryKey: `queued:${created.run.id}`,
      payload: { totalAssets: 1, jobType: "index" },
    });
    return { queued: true, agentRunId: created.run.id, jobId: job.job.id, reused: Boolean(job.reused) };
  };

  const getAgentRunEvents = async ({ userId, agentRunId, afterSequence }) => {
    const run = await repository.getAgentRunForUser({ userId, agentRunId });
    if (!run) throw new MediaRetrievalServiceError("run_not_found");
    return {
      run,
      events: await repository.listAgentRunEventsForUser({ userId, agentRunId, afterSequence }),
    };
  };

  return {
    enableMediaRetrieval,
    getMediaRetrievalStatus,
    searchMediaRetrieval,
    requestMediaRetrievalReindex,
    deleteMediaRetrievalIndex,
    enqueueUploadedMediaAsset,
    getAgentRunEvents,
  };
}
