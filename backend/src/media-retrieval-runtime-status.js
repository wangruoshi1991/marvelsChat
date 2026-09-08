import { getMediaRetrievalConfigStatus, config } from "./config.js";
import { query, withTransaction } from "./db.js";
import { getOssRuntimeStatus } from "./asset-storage-service.js";
import { createMediaRetrievalRepository } from "./media-retrieval-repository.js";

const LIFECYCLE_ROUTEABLE = new Set(["limited_release", "available"]);
const toTimestamp = (value) => new Date(value).toISOString().replace(/\.\d{3}Z$/, "Z");
const safeNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);

const defaultOverview = async () => {
  try {
    return await createMediaRetrievalRepository({ query, withTransaction }).getMediaRetrievalAdminOverview();
  } catch {
    return {
      controls: null,
      workerLastSeenAt: null,
      globalCost: { reserved_fen: 0, estimated_fen: 0, unknown_fen: 0 },
    };
  }
};

const defaultVectorReady = async () => {
  try {
    const rows = await query("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ready");
    return rows[0]?.ready === true;
  } catch {
    return false;
  }
};

export async function buildMediaRetrievalRuntimeStatus({
  evaluatedAt = new Date(),
  configStatus = getMediaRetrievalConfigStatus(config),
  vectorReady,
  ossReady,
  overview,
} = {}) {
  const [resolvedVectorReady, resolvedOverview] = await Promise.all([
    vectorReady === undefined ? defaultVectorReady() : Boolean(vectorReady),
    overview === undefined ? defaultOverview() : overview,
  ]);
  const resolvedOssReady = ossReady === undefined ? Boolean(getOssRuntimeStatus().configured) : Boolean(ossReady);
  const controls = resolvedOverview?.controls || {};
  const now = new Date(evaluatedAt);
  const checkedAt = toTimestamp(now);
  const heartbeat = resolvedOverview?.workerLastSeenAt ? new Date(resolvedOverview.workerLastSeenAt) : null;
  const heartbeatAgeMs = heartbeat && Number.isFinite(heartbeat.getTime()) ? now.getTime() - heartbeat.getTime() : Infinity;
  const workerHealthy = heartbeatAgeMs >= 0 && heartbeatAgeMs <= 30_000;
  const operatorEnabled = Boolean(controls.agent_enabled);
  const queueEnabled = Boolean(controls.index_requests_enabled);
  const providerEnabled = Boolean(controls.provider_calls_enabled && configStatus.providerCallsEnabled);
  const lifecycle = controls.lifecycle || "draft";
  const budget = safeNumber(controls.global_daily_budget_fen);
  const usedBudget = ["reserved_fen", "estimated_fen", "unknown_fen"]
    .reduce((total, key) => total + safeNumber(resolvedOverview?.globalCost?.[key]), 0);
  const capacityState = !budget || usedBudget >= budget
    ? "exhausted"
    : usedBudget / budget >= 0.8
      ? "limited"
      : "available";
  const dependenciesReady = Boolean(
    resolvedVectorReady &&
      resolvedOssReady &&
      configStatus.configured &&
      configStatus.enabled &&
      providerEnabled &&
      workerHealthy,
  );
  const readinessState = dependenciesReady ? "ready" : "not-ready";
  const lifecycleAllowsUse = LIFECYCLE_ROUTEABLE.has(lifecycle);
  const capacityAvailable = capacityState === "available" || capacityState === "limited";
  const reasonCodes = [];
  if (!lifecycleAllowsUse) reasonCodes.push("lifecycle-not-available");
  if (!operatorEnabled || !queueEnabled) reasonCodes.push("operator-disabled");
  if (!dependenciesReady) reasonCodes.push("not-ready");
  if (!capacityAvailable) reasonCodes.push("capacity-limited");
  const canRouteNewRun = Boolean(
    lifecycleAllowsUse &&
      operatorEnabled &&
      queueEnabled &&
      dependenciesReady &&
      capacityAvailable,
  );
  return {
    schemaVersion: "0.2",
    agentKey: "media-retrieval",
    agentVersion: "0.1.0",
    lifecycle,
    operatorEnabled,
    liveness: {
      state: workerHealthy ? "healthy" : heartbeat ? "unhealthy" : "unknown",
      checkedAt,
      lastSeenAt: heartbeat && Number.isFinite(heartbeat.getTime()) ? toTimestamp(heartbeat) : null,
    },
    readiness: {
      state: readinessState,
      checkedAt,
    },
    capacity: {
      state: capacityState,
      evaluatedAt: checkedAt,
    },
    routeEligibility: {
      registered: true,
      lifecycleAllowsUse,
      operatorEnabled,
      readinessReady: readinessState === "ready",
      capacityAvailable,
      canRouteNewRun,
      reasonCodes,
    },
    publicAvailability: {
      state: canRouteNewRun ? "available" : "temporarily-unavailable",
      canStartRun: canRouteNewRun,
      reasonCodes,
    },
    evaluatedAt: checkedAt,
  };
}
