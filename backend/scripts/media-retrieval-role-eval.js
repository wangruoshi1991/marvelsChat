import crypto from "node:crypto";
import { buildVisualEmbeddingInput, MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION } from "../src/media-retrieval-embedding-input.js";
import { QUERY_PROMPT_VERSION } from "../src/media-retrieval-prompts.js";
import { projectMediaRetrievalDiagnostic } from "../src/media-retrieval-errors.js";

// This is semantic-role quality evidence, not deterministic identity detection.
// No embedding or media lookup is performed by this evaluation.
export async function runMediaRetrievalRoleEvaluation({ provider, dataset, allowPaid, onProgress = async () => {} }) {
  if (allowPaid !== true) throw new Error("Explicit paid evaluation approval is required.");
  if (!dataset?.version || !Array.isArray(dataset.cases) || !dataset.cases.length ||
    dataset.cases.length > 100 || new Set(dataset.cases.map(item => item.id)).size !== dataset.cases.length ||
    dataset.cases.some(item => !item.id || typeof item.query !== "string" || !item.query.trim() || item.query.length > 240 ||
      !["semantic", "exact-only", "blocked"].includes(item.mode) ||
      !Array.isArray(item.identityTerms) || !Array.isArray(item.tags))) {
    throw new TypeError("Invalid retrieval role evaluation dataset.");
  }
  const report = {
    queryParsingProvenance: provider.getQueryParsingProvenance?.() || null,
    datasetVersion: dataset.version, datasetSha256: crypto.createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
    queryPromptVersion: QUERY_PROMPT_VERSION, embeddingPolicyVersion: MEDIA_RETRIEVAL_EMBEDDING_POLICY_VERSION,
    actualCostFen: null, passed: false, providerCalls: 0, cases: [], calls: [], failure: null,
  };
  for (const definition of dataset.cases) {
    report.providerCalls += 1;
    const call = { caseId: definition.id, status: "dispatched", latencyMs: null };
    report.calls.push(call);
    await onProgress(report);
    const started = Date.now();
    try {
      const candidate = await provider.parseRetrievalQuery({
        query: definition.query, reservation: { reserved: true, amountFen: 1,
          reservationId: "role-eval-" + report.providerCalls },
      });
      call.status = "succeeded";
      const input = buildVisualEmbeddingInput({ rawQuery: definition.query, candidate });
      const expected = definition.identityTerms.map(term => term.normalize("NFKC").trim()).sort();
      const actual = [...input.identityTerms].sort();
      report.cases.push({ id: definition.id, tags: definition.tags,
        passed: input.mode === definition.mode && JSON.stringify(expected) === JSON.stringify(actual),
        expectedMode: definition.mode, actualMode: input.mode, identityClassificationMatched: JSON.stringify(expected) === JSON.stringify(actual),
        reasonCode: input.reasonCode,
      });
    } catch (error) {
      call.status = "failed-billing-unknown";
      const diagnostic = projectMediaRetrievalDiagnostic(error?.diagnostic);
      report.cases.push({ id: definition.id, tags: definition.tags, passed: false,
        failure: "role-output-unverifiable", diagnostic });
      if (diagnostic?.stage !== "query-validation" || diagnostic?.httpStatus !== 200) {
        report.failure = "role-evaluation-stopped";
      }
    } finally {
      call.latencyMs = Date.now() - started;
      await onProgress(report);
    }
    if (report.failure) break;
  }
  report.passed = !report.failure && report.cases.length === dataset.cases.length &&
    report.cases.every(item => item.passed);
  await onProgress(report);
  return report;
}
