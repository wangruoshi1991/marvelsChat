import crypto from "node:crypto";
import { HttpError } from "./http-error.js";
import { MEDIA_RETRIEVAL_CONSENT_VERSION } from "./media-retrieval-constants.js";
import {
  B7_PRODUCT_BASELINE_METHOD,
} from "./media-retrieval-b7-baseline.js";
import { retrieveB7ProductBaseline } from "./media-retrieval-b7-service.js";
import { rerankMediaRetrievalVisualCandidates } from "./media-retrieval-reranker.js";
import { getMediaRetrievalErrorContract } from "./media-retrieval-errors.js";
import {
  buildVisualEmbeddingInput,
  createVisualEmbeddingBinding,
  toProviderVisualEmbeddingInput,
} from "./media-retrieval-embedding-input.js";
import {
  assertEmbeddingProvenance,
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

const profileEpoch = (profile) => {
  const value = Number(profile?.indexEpoch);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new MediaRetrievalServiceError("retrieval_policy_unverifiable");
  }
  return value;
};

const providerCanSearch = (provider) => {
  const status = provider?.getRuntimeStatus?.() || {};
  return Boolean(
    status.configured &&
      status.enabled &&
      status.providerCallsEnabled,
  );
};

const operationRequestHash = (input) =>
  crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");

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

// Hook errors belong to the workspace runtime. They must not be converted
// into a retrieval result that allows another provider call or fallback branch.
class WorkspaceModelHookError extends Error {
  constructor(cause) { super("Workspace model boundary stopped execution", { cause }); }
}

const reserveAndCall = async ({ repository, run, operation, countUserAction, assertAuthorized, invoke,
  beforeModelCall = null, afterModelCall = null }) => {
  await assertAuthorized();
  const reservation = await repository.reserveProviderBudget({
    userId: run.userId, agentRunId: run.id, jobId: null, operation, countUserAction,
  });
  if (!reservation?.reserved) return { value: null, blocked: true, failureCode: canonicalProviderFailureCode(reservation?.reasonCode) };
  let receipt = null;
  try {
    await assertAuthorized();
    if (beforeModelCall) {
      try { receipt = await beforeModelCall(); }
      catch (error) { throw new WorkspaceModelHookError(error); }
    }
  } catch (error) {
    try {
      await repository.settleProviderBudget({ reservationId: reservation.reservationId, disposition: "released", amountFen: 0 });
    } catch (settlementError) {
      // No provider was dispatched. Keep a workspace authorization/limit
      // rejection if independent retrieval settlement also cannot be stored.
      if (!(error instanceof WorkspaceModelHookError)) throw settlementError;
    }
    throw error;
  }
  const startedAt = Date.now();
  let responseReceipt = null;
  let value = null;
  let failure = null;
  try { value = await invoke(reservation, captured => { responseReceipt = captured; }); }
  catch (error) { failure = error; }
  try {
    await repository.settleProviderBudget({
      reservationId: reservation.reservationId, disposition: failure ? "unknown" : "estimated", amountFen: reservation.amountFen,
    });
  } catch (error) {
    if (beforeModelCall || afterModelCall) throw new WorkspaceModelHookError(new HttpError(504,
      "检索预算回执未能保存，不能自动重试。", { code: "WORKSPACE_MODEL_RESULT_UNKNOWN" }));
    throw error;
  }
  if (afterModelCall) {
    if (!responseReceipt) throw new WorkspaceModelHookError(new HttpError(504,
      "检索模型响应无法确认，不能自动重试。", { code: "WORKSPACE_MODEL_RESULT_UNKNOWN" }));
    try {
      await afterModelCall({ receipt,
        provider: responseReceipt.provider, model: responseReceipt.model,
        servedModel: responseReceipt.servedModel ?? null,
        tokenUsage: responseReceipt.tokenUsage,
        latencyMs: responseReceipt.latencyMs ?? Date.now() - startedAt });
    } catch (error) { throw new WorkspaceModelHookError(error); }
  }
  if (failure) return { value: null, blocked: true, failureCode: canonicalProviderFailureCode(failure?.code) };
  return { value, blocked: false, failureCode: null };
};

const asB7NormalizedQuery = (embeddingInput) => ({
  visualQuery: embeddingInput.mode === "semantic" ? embeddingInput.text : "",
  identityTerms: embeddingInput.identityTerms,
  parseConfidence: embeddingInput.mode === "blocked" ? "low" : "high",
});

const createProductEmbeddingBinding = ({ provider, input, vector }) => {
  let embeddingProvenance;
  try {
    if (typeof provider?.getIndexingProvenance !== "function") {
      throw new TypeError("Media retrieval provider does not declare indexing provenance.");
    }
    embeddingProvenance = assertEmbeddingProvenance(
      provider.getIndexingProvenance()?.embeddingProvenance,
    );
  } catch {
    throw new MediaRetrievalServiceError("retrieval_service_unavailable");
  }
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

export function createMediaRetrievalUserService({ repository, provider, resolveCandidateVisuals, getRuntimeStatus = null }) {
  if (!repository) throw new TypeError("Media retrieval user service requires a repository.");

  const failRun = async ({ userId, agentRunId, error }) => {
    const failureCode =
      typeof error?.code === "string" && Object.hasOwn(MEDIA_RETRIEVAL_ERROR_CONTRACTS, error.code)
        ? error.code
        : "retrieval_repository_write_failed";
    try {
      await repository.transitionMediaRetrievalRun({
        userId,
        agentRunId,
        lifecycleStatus: "failed",
        failureCode,
        eventType: "failed",
      });
    } catch {
      throw new MediaRetrievalServiceError("retrieval_repository_write_failed");
    }
    throw new MediaRetrievalServiceError(failureCode);
  };

  const ensureRouteEligible = async () => {
    if (typeof getRuntimeStatus !== "function") {
      throw new MediaRetrievalServiceError("retrieval_service_unavailable");
    }
    let status;
    try {
      status = await getRuntimeStatus?.();
    } catch {
      throw new MediaRetrievalServiceError("retrieval_service_unavailable");
    }
    if (status?.routeEligibility?.canRouteNewRun !== true) {
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
      inputSummary: {
        operation: "enable",
        requestHash: operationRequestHash({ operation: "enable", consentVersion }),
      },
    });
    if (created.reused) {
      return { agentRunId: created.run.id, lifecycleStatus: created.run.lifecycleStatus, reused: true };
    }
    try {
      await repository.enableMediaRetrievalProfile({
        userId,
        consentVersion,
        agentRunId: created.run.id,
      });
      const backfill = await repository.enqueueBackfillJobs({ userId, agentRunId: created.run.id });
      const lifecycleStatus = backfill.enqueued > 0 ? "queued" : "succeeded";
      await repository.transitionMediaRetrievalRun({
        userId,
        agentRunId: created.run.id,
        lifecycleStatus,
        eventType: lifecycleStatus === "queued" ? "queued" : "completed",
        payload: backfill,
      });
      return {
        agentRunId: created.run.id,
        lifecycleStatus,
        backfill,
        reused: false,
      };
    } catch (error) {
      return failRun({ userId, agentRunId: created.run.id, error });
    }
  };

  const getMediaRetrievalStatus = async ({ userId }) => {
    const status = await repository.getMediaRetrievalStatusForUser({ userId });
    let runtime = null;
    if (typeof getRuntimeStatus === "function") {
      try {
        runtime = await getRuntimeStatus();
      } catch {
        runtime = null;
      }
    }
    const indexRuns = status.recentRuns.filter((run) => ["media-index", "media-reindex"].includes(run.runType));
    const currentBackfill =
      indexRuns.find((run) => !["succeeded", "failed", "cancelled", "blocked"].includes(run.lifecycleStatus)) || indexRuns[0] || null;
    return {
      enabled: status.profile?.indexState === "enabled",
      consentVersion: status.profile?.consentVersion || null,
      backfill: {
        agentRunId: currentBackfill?.id || null,
        lifecycleStatus: currentBackfill?.lifecycleStatus || "idle",
        indexedAssets: Number(status.jobs.succeeded || 0),
        // Unavailable assets without a current queued/running task, including
        // failed, cancelled, missing and stale tasks; not a provider-failure count.
        skippedAssets: Number(status.jobs.blocked || 0) + Number(status.jobs.failed || 0),
        totalAssets: Object.values(status.jobs).reduce((total, value) => total + Number(value || 0), 0),
      },
      quota: {
        dailyRemaining: status.limits?.userDailyRequestLimit == null
          ? null
          : Math.max(0, Number(status.limits.userDailyRequestLimit) - Number(status.quota.action_count || 0)),
        monthlyRemainingFen: status.limits?.userMonthlyBudgetFen == null
          ? null
          : Math.max(0, Number(status.limits.userMonthlyBudgetFen) - Number(status.quota.monthly_committed_fen || 0)),
      },
      availability: runtime?.publicAvailability || {
        state: "temporarily-unavailable",
        canStartRun: false,
        reasonCodes: ["not-ready"],
      },
      recentRuns: status.recentRuns,
    };
  };

  const searchMediaRetrieval = async ({
    userId,
    query,
    kind = null,
    albumId = null,
    limit = 10,
    idempotencyKey,
    beforeModelCall = null,
    afterModelCall = null,
  }) => {
    await ensureRouteEligible();
    const initialProfile = await enabledProfile(repository, userId);
    const initialIndexEpoch = profileEpoch(initialProfile);
    const created = await repository.createOrGetMediaRetrievalRun({
      userId,
      runType: "media-search",
      idempotencyKey,
      inputSummary: {
        operation: "search",
        kind: kind || "all",
        requestHash: operationRequestHash({
          operation: "search",
          query: String(query || "").trim(),
          kind: kind || null,
          albumId: albumId || null,
          limit: Number(limit),
          indexEpoch: initialIndexEpoch,
        }),
      },
    });
    if (created.reused) {
      const replay = await repository.getMediaRetrievalSearchResponse({
        userId,
        agentRunId: created.run.id,
      });
      if (replay) {
        const currentProfile = await enabledProfile(repository, userId);
        if (profileEpoch(currentProfile) !== initialIndexEpoch) {
          throw new MediaRetrievalServiceError("retrieval_purge_incomplete");
        }
        return replay;
      }
      if (["failed", "blocked", "cancelled"].includes(created.run.lifecycleStatus)) {
        throw new MediaRetrievalServiceError(
          canonicalProviderFailureCode(created.run.failureCode),
        );
      }
      if (created.run.lifecycleStatus === "succeeded") {
        throw new MediaRetrievalServiceError("retrieval_repository_write_failed");
      }
      throw new MediaRetrievalServiceError("retrieval_request_in_progress");
    }
    const run = { ...created.run, userId };
    let terminalRecorded = false;
    const assertSearchStillAuthorized = async () => {
      const currentProfile = await enabledProfile(repository, userId);
      const currentIndexEpoch = profileEpoch(currentProfile);
      if (currentIndexEpoch !== initialIndexEpoch) {
        throw new MediaRetrievalServiceError("retrieval_purge_incomplete");
      }
      return currentProfile;
    };
    const finishBlockedSearch = async (failureCode) => {
      await repository.transitionMediaRetrievalRun({
        userId,
        agentRunId: run.id,
        lifecycleStatus: "blocked",
        failureCode,
        eventType: "blocked",
      });
      terminalRecorded = true;
      throw new MediaRetrievalServiceError(failureCode);
    };

    try {
      await repository.transitionMediaRetrievalRun({
        userId,
        agentRunId: run.id,
        lifecycleStatus: "running",
        eventType: "searching",
      });
      // A failed or uncertain parser never silently switches retrieval modes.
      // Only a validated parser response can authorize semantic or exact search.
      let embeddingInput = buildVisualEmbeddingInput({
        rawQuery: query,
        candidate: { spans: [], parseConfidence: "low" },
      });
      let queryEmbedding = null;
      if (providerCanSearch(provider)) {
        const parsed = await reserveAndCall({
          repository,
          run,
          operation: "query-parse",
          countUserAction: true,
          assertAuthorized: assertSearchStillAuthorized, beforeModelCall, afterModelCall,
          invoke: (reservation, onModelResponse) => provider.parseRetrievalQuery({ query, traceId: run.traceId, reservation, onModelResponse }),
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
        if (embeddingInput.mode === "semantic") {
          await assertSearchStillAuthorized();
          const embedded = await reserveAndCall({
            repository,
            run,
            operation: "query-embedding",
            countUserAction: false,
            assertAuthorized: assertSearchStillAuthorized, beforeModelCall, afterModelCall,
            invoke: (reservation, onModelResponse) => provider.embedText({
              input: toProviderVisualEmbeddingInput(embeddingInput),
              traceId: run.traceId,
              reservation, onModelResponse,
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

      if (embeddingInput.mode === "blocked") {
        await finishBlockedSearch("retrieval_policy_unverifiable");
      }
      await assertSearchStillAuthorized();
      const baseline = await retrieveB7ProductBaseline({
        repository,
        userId,
        normalizedQuery: asB7NormalizedQuery(embeddingInput),
        queryEmbedding,
        kind,
        albumId,
        limit,
      });
      let rankedResults = baseline.results;
      let assertVisualsCurrent = assertSearchStillAuthorized;
      if (embeddingInput.mode === "semantic" && baseline.semanticCandidates.length) {
        if (typeof resolveCandidateVisuals !== "function") {
          throw new MediaRetrievalServiceError("retrieval_service_unavailable");
        }
        const visuals = await resolveCandidateVisuals({
          userId, indexEpoch: initialIndexEpoch, candidates: baseline.semanticCandidates,
          assertAuthorized: assertSearchStillAuthorized,
        });
        assertVisualsCurrent = visuals.assertCurrent;
        rankedResults = await rerankMediaRetrievalVisualCandidates({
          candidates: visuals.candidates,
          visualConstraints: embeddingInput.visualConstraints,
          invoke: async candidates => {
            const reranked = await reserveAndCall({
              repository, run, operation: "query-rerank", countUserAction: false,
              assertAuthorized: assertVisualsCurrent, beforeModelCall, afterModelCall,
              invoke: (reservation, onModelResponse) => provider.rerankMediaCandidates({
                query: embeddingInput.semanticText, visualConstraints: embeddingInput.visualConstraints,
                candidates, reservation, onModelResponse,
              }),
            });
            if (reranked.blocked) await finishBlockedSearch(reranked.failureCode);
            return reranked.value;
          },
        });
      } else if (embeddingInput.mode === "semantic") {
        rankedResults = [];
      }
      await assertVisualsCurrent();
      rankedResults = rankedResults.slice(0, Math.min(20, Math.max(1, Number(limit) || 10)));
      const response = projectMediaRetrievalSearchResponse({
        agentRunId: run.id,
        lifecycleStatus: "succeeded",
        method: B7_PRODUCT_BASELINE_METHOD,
        results: toPublicResults(rankedResults),
      });
      await repository.transitionMediaRetrievalRun({
        userId,
        agentRunId: run.id,
        lifecycleStatus: "succeeded",
        failureCode: null,
        eventType: "completed",
        searchIndexEpoch: initialIndexEpoch,
        payload: { searchResponse: response },
      });
      terminalRecorded = true;
      return response;
    } catch (error) {
      if (terminalRecorded) throw error;
      if (error instanceof WorkspaceModelHookError) {
        try {
          await repository.transitionMediaRetrievalRun({ userId, agentRunId: run.id,
            lifecycleStatus: "failed", failureCode: "retrieval_service_unavailable", eventType: "failed" });
        } catch {
          // The workspace owns its failure semantics even if recording the
          // independent retrieval run failure also cannot complete.
        }
        throw error.cause;
      }
      return failRun({ userId, agentRunId: run.id, error });
    }
  };

  const requestMediaRetrievalReindex = async ({ userId, scope, mediaAssetIds, idempotencyKey }) => {
    await ensureRouteEligible();
    await enabledProfile(repository, userId);
    const created = await repository.createOrGetMediaRetrievalRun({
      userId,
      runType: "media-reindex",
      idempotencyKey,
      confirmed: true,
      inputSummary: {
        operation: "reindex",
        scope,
        requestedAssetCount: mediaAssetIds.length,
        requestHash: operationRequestHash({
          operation: "reindex",
          scope,
          mediaAssetIds: [...new Set(mediaAssetIds)].sort(),
        }),
      },
    });
    if (created.reused) {
      return { agentRunId: created.run.id, lifecycleStatus: created.run.lifecycleStatus, reused: true };
    }
    try {
      const jobs = await repository.enqueueReindexJobs({ userId, agentRunId: created.run.id, scope, mediaAssetIds });
      const lifecycleStatus = jobs.enqueued > 0 ? "queued" : "succeeded";
      await repository.transitionMediaRetrievalRun({
        userId,
        agentRunId: created.run.id,
        lifecycleStatus,
        eventType: lifecycleStatus === "queued" ? "queued" : "completed",
        payload: jobs,
      });
      return { agentRunId: created.run.id, lifecycleStatus, jobs, reused: false };
    } catch (error) {
      return failRun({ userId, agentRunId: created.run.id, error });
    }
  };

  const deleteMediaRetrievalIndex = async ({ userId, idempotencyKey }) => {
    const created = await repository.createOrGetMediaRetrievalRun({
      userId,
      runType: "media-purge",
      idempotencyKey,
      confirmed: true,
      inputSummary: {
        operation: "delete-index",
        requestHash: operationRequestHash({ operation: "delete-index" }),
      },
    });
    if (created.reused) {
      return { agentRunId: created.run.id, lifecycleStatus: created.run.lifecycleStatus, reused: true };
    }
    try {
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
    } catch (error) {
      return failRun({ userId, agentRunId: created.run.id, error });
    }
  };

  const enqueueUploadedMediaAsset = async ({ userId, mediaAssetId }) => {
    try {
      await ensureRouteEligible();
    } catch (error) {
      return { queued: false, reasonCode: error?.code || "retrieval_service_unavailable" };
    }
    if (!providerCanSearch(provider)) return { queued: false, reasonCode: "retrieval_not_enabled" };
    const dispatch = await repository.getMediaRetrievalDispatchState({ userId });
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
