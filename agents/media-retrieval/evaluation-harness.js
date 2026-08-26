import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = path.dirname(fileURLToPath(import.meta.url));
const fixtureDirectory = path.join(packageDirectory, "fixtures", "media-retrieval", "v1");
const descriptorKeys = new Set([
  "summary",
  "clothing",
  "scene",
  "actions",
  "objects",
  "ocrText",
  "qualitySignals",
]);

export const isImplemented = true;

const asArray = (value) => (Array.isArray(value) ? value : []);

const hasOnlyExpectedValues = (values, allowed) =>
  asArray(values).every((value) => asArray(allowed).includes(value));

const resolveFixturePath = (fixtureRef) => {
  if (typeof fixtureRef !== "string" || !fixtureRef.startsWith("fixtures/media-retrieval/v1/")) {
    throw new Error("Evaluation fixture must use the versioned media-retrieval fixture path.");
  }
  const fixturePath = path.resolve(packageDirectory, fixtureRef);
  const relative = path.relative(fixtureDirectory, fixturePath);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Evaluation fixture path escapes the fixture directory.");
  }
  return fixturePath;
};

const loadFixture = async (definition) => {
  const fixturePath = resolveFixturePath(definition?.fixtureRef);
  let fixture;
  try {
    fixture = JSON.parse(await fs.readFile(fixturePath, "utf8"));
  } catch {
    throw new Error("Evaluation fixture is unavailable or invalid.");
  }
  if (!fixture || typeof fixture !== "object" || Array.isArray(fixture)) {
    throw new Error("Evaluation fixture must be an object.");
  }
  if (fixture.schemaVersion !== "1.0" || fixture.id !== definition.id) {
    throw new Error("Evaluation fixture does not match its suite definition.");
  }
  return fixture;
};

const runtimeState = (fixture) => ({
  agentEnabled: fixture.state?.agentEnabled !== false,
  providerCallsEnabled: fixture.state?.providerCallsEnabled !== false,
  userRequestRemaining: Number.isInteger(fixture.state?.userRequestRemaining)
    ? fixture.state.userRequestRemaining
    : 1,
  globalBudgetRemainingFen: Number.isInteger(fixture.state?.globalBudgetRemainingFen)
    ? fixture.state.globalBudgetRemainingFen
    : 1,
  ownerId: fixture.state?.ownerId || "user-owner",
  requesterId: fixture.state?.requesterId || "user-owner",
  indexEnabled: fixture.state?.indexEnabled !== false,
  sourceDeleted: fixture.state?.sourceDeleted === true,
  accountDeleted: fixture.state?.accountDeleted === true,
});

const failure = (publicErrorCode, providerCalls = 0) => ({
  terminalPublicStatus: "failed",
  publicErrorCode,
  providerCalls,
});

const success = (providerCalls = 0) => ({
  terminalPublicStatus: "succeeded",
  publicErrorCode: null,
  providerCalls,
});

const runMockScenario = (fixture) => {
  const state = runtimeState(fixture);
  const provider = fixture.mockProvider || {};
  const requiresProvider = fixture.requiresProvider === true;

  if (["get-run", "get-events"].includes(fixture.operation) && state.requesterId !== state.ownerId) {
    return { ...failure("run_not_found"), state };
  }
  if (state.accountDeleted || state.sourceDeleted || !state.indexEnabled) {
    return { ...success(), state };
  }
  if (!requiresProvider) return { ...success(), state };
  if (!state.agentEnabled || !state.providerCallsEnabled) {
    return { ...failure("retrieval_service_unavailable"), state };
  }
  if (state.userRequestRemaining < 1 || state.globalBudgetRemainingFen < 1) {
    return { ...failure("retrieval_budget_exhausted"), state };
  }

  const providerCalls = Number.isInteger(provider.calls) && provider.calls >= 0 ? provider.calls : 0;
  if (provider.outcome === "unknown-charge") {
    return { ...failure("retrieval_service_unavailable", providerCalls), state };
  }
  return { ...success(providerCalls), state };
};

const checkAssertions = ({ fixture, result }) => {
  const evidence = fixture.evidence || {};
  const query = fixture.query || {};
  const checks = {
    "only-owner-results": () => asArray(evidence.resultOwners).every((ownerId) => ownerId === result.state.ownerId),
    "scene-and-object-evidence": () =>
      asArray(evidence.usedEvidence).includes("scene:park") && asArray(evidence.usedEvidence).includes("object:bicycle"),
    "provider-call-cap": () => result.providerCalls === 2,
    "video-frame-cap": () => Number.isInteger(evidence.videoFrameCount) && evidence.videoFrameCount <= 6 && result.providerCalls <= 12,
    "no-audio-transcript": () => evidence.storedAudioTranscript === false,
    "video-timestamp": () => Number.isFinite(evidence.timestampSeconds) && evidence.timestampSeconds >= 0,
    "exact-ocr-evidence": () => typeof query.exactOcr === "string" && evidence.ocrMatch === query.exactOcr,
    "frozen-top-five": () =>
      JSON.stringify(asArray(evidence.resultIds)) === JSON.stringify(asArray(evidence.expectedResultIds)),
    "declared-visual-evidence": () => hasOnlyExpectedValues(evidence.usedEvidence, evidence.declaredVisualEvidence),
    "owner-predicate": () => evidence.queryOwnerId === result.state.ownerId,
    "cross-user-not-found": () => result.terminalPublicStatus === "failed" && result.publicErrorCode === "run_not_found",
    "soft-deleted-not-queryable": () => result.state.sourceDeleted && asArray(evidence.resultIds).length === 0,
    "disabled-index-empty": () => !result.state.indexEnabled && asArray(evidence.resultIds).length === 0,
    "account-purge-derived-removed": () => result.state.accountDeleted && evidence.derivedIndexCount === 0,
    "identity-removed-before-embedding": () =>
      asArray(query.identityTerms).every((term) => !String(evidence.embeddingText || "").toLowerCase().includes(String(term).toLowerCase())),
    "celebrity-exact-evidence": () => result.providerCalls === 0 && evidence.exactTextMatch === true,
    "parse-fail-closed": () => query.parseConfidence === "low" && result.providerCalls === 0 && query.visualQuery === "",
    "descriptor-allowlist": () => asArray(evidence.persistedDescriptorKeys).every((key) => descriptorKeys.has(key)),
    "disabled-no-call": () => !result.state.agentEnabled && result.providerCalls === 0,
    "user-limit-blocks": () => result.state.userRequestRemaining === 0 && result.publicErrorCode === "retrieval_budget_exhausted",
    "global-budget-blocks": () => result.state.globalBudgetRemainingFen === 0 && result.publicErrorCode === "retrieval_budget_exhausted",
    "unknown-charge-no-retry": () => evidence.retryScheduled === false && result.providerCalls === 1,
    "checkpoint-resume": () => evidence.resumedFromCheckpoint === "descriptor" && evidence.completedCheckpoints === true,
    "delivery-deduplicated": () => evidence.deliveryOccurrences === 2 && evidence.deliveredCount === 1,
    "monotonic-events": () => {
      const sequence = asArray(evidence.eventSequence);
      return sequence.every((value, index) => Number.isInteger(value) && (index === 0 || value > sequence[index - 1]));
    },
    "empty-no-invented-match": () => asArray(evidence.resultIds).length === 0 && evidence.inventedMatch === false,
    "identity-no-semantic-fallback": () => result.providerCalls === 0 && evidence.exactTextMatch === false && asArray(evidence.resultIds).length === 0,
    "unavailable-no-fallback": () => result.terminalPublicStatus === "failed" && result.providerCalls === 0 && evidence.fallbackSearchUsed === false,
  };

  const passedChecks = [];
  for (const check of asArray(fixture.checks)) {
    if (typeof checks[check] !== "function" || !checks[check]()) return { passed: false, passedChecks };
    passedChecks.push(check);
  }
  return { passed: true, passedChecks };
};

export async function evaluateCase({ definition, mode }) {
  if (mode !== "mock") {
    throw new Error("The media-retrieval evaluation harness only supports mock mode.");
  }

  const fixture = await loadFixture(definition);
  const result = runMockScenario(fixture);
  const assertionResult = checkAssertions({ fixture, result });
  const eventTypes = [
    "agent.run.accepted",
    result.terminalPublicStatus === "succeeded" ? "agent.run.succeeded" : "agent.run.failed",
  ];

  return {
    passed: assertionResult.passed,
    // Fixtures exercise contract behavior only; they are never quality evidence.
    evidenceScope: "synthetic-contract-only",
    empiricalQualityEvidence: false,
    latencyMs: Number.isInteger(fixture.latencyMs) && fixture.latencyMs >= 0 ? fixture.latencyMs : 0,
    costFen: 0,
    providerCalls: result.providerCalls,
    terminalPublicStatus: result.terminalPublicStatus,
    publicErrorCode: result.publicErrorCode,
    eventTypes,
    artifactAssertions: assertionResult.passedChecks,
  };
}
