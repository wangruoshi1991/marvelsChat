import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  AgentCliError,
  assertNoSecretLikeOptions,
  assertOutputFormat,
  createCommandReport,
  executeCliCommand,
  findRepositoryRoot,
  isSafeAgentKey,
  parseCliOptions,
} from "./lib/agent-cli.js";

const readJson = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new AgentCliError(`Unable to read required JSON file: ${path.basename(file)}`, {
      code: "invalid_json_fixture",
    });
  }
};

const loadEvaluationSchema = async (repoRoot) => readJson(
  path.join(repoRoot, "docs", "agent-sop", "schemas", "evaluation-suite.schema.json"),
);

const validateEvaluationResult = ({ definition, result }) => {
  const errors = [];
  if (!result || result.passed !== true) {
    errors.push({ code: "evaluation_case_failed", message: `Evaluation case did not pass: ${definition.id}.` });
    return errors;
  }
  if (!Number.isInteger(result.latencyMs) || result.latencyMs > definition.limits.maxLatencyMs) {
    errors.push({ code: "evaluation_latency_limit", message: `Evaluation case exceeded its latency limit: ${definition.id}.` });
  }
  if (!Number.isInteger(result.costFen) || result.costFen > definition.limits.maxCostFen) {
    errors.push({ code: "evaluation_cost_limit", message: `Evaluation case exceeded its cost limit: ${definition.id}.` });
  }
  if (!Number.isInteger(result.providerCalls) || result.providerCalls > definition.limits.maxProviderCalls) {
    errors.push({ code: "evaluation_provider_call_limit", message: `Evaluation case exceeded its provider-call limit: ${definition.id}.` });
  }
  if (result.terminalPublicStatus !== definition.expected.terminalPublicStatus) {
    errors.push({ code: "evaluation_public_status", message: `Evaluation case returned the wrong public status: ${definition.id}.` });
  }
  if (result.publicErrorCode !== definition.expected.publicErrorCode) {
    errors.push({ code: "evaluation_public_error", message: `Evaluation case returned the wrong public error: ${definition.id}.` });
  }
  const eventTypes = new Set(result.eventTypes || []);
  if (!definition.expected.requiredEventTypes.every((eventType) => eventTypes.has(eventType))) {
    errors.push({ code: "evaluation_event_assertion", message: `Evaluation case is missing required events: ${definition.id}.` });
  }
  const artifactAssertions = new Set(result.artifactAssertions || []);
  if (!definition.expected.artifactAssertions.every((assertion) => artifactAssertions.has(assertion))) {
    errors.push({ code: "evaluation_artifact_assertion", message: `Evaluation case is missing artifact assertions: ${definition.id}.` });
  }
  if (definition.review.requiresHumanJudgement && result.humanJudgement !== "approved") {
    errors.push({ code: "evaluation_human_judgement_missing", message: `Evaluation case needs an approved human judgement: ${definition.id}.` });
  }
  return errors;
};

export async function evaluateAgentSuite({ repoRoot, agentKey }) {
  if (!isSafeAgentKey(agentKey)) {
    throw new AgentCliError("Agent key must be a lowercase slug.");
  }

  const agentDirectory = path.join(repoRoot, "agents", agentKey);
  const [manifest, suite, schema] = await Promise.all([
    readJson(path.join(agentDirectory, "manifest.json")),
    readJson(path.join(agentDirectory, "evaluation-suite.json")),
    loadEvaluationSchema(repoRoot),
  ]);
  const errors = [];
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validate(suite)) {
    errors.push({ code: "evaluation_schema_invalid", message: "Evaluation suite does not match the SOP schema." });
  }
  if (suite.agentKey !== agentKey || suite.agentVersion !== manifest.version) {
    errors.push({ code: "evaluation_agent_mismatch", message: "Evaluation suite does not match the Agent Manifest." });
  }
  if (!Array.isArray(suite.cases) || suite.cases.length < manifest.evaluation.minimumCaseCount) {
    errors.push({ code: "evaluation_case_count", message: "Evaluation suite has fewer cases than required." });
  }
  if (suite.cases?.some((testCase) => testCase.expected.providerInteraction === "approved-calibration-only")) {
    errors.push({ code: "paid_calibration_not_allowed", message: "Paid calibration belongs to agent:smoke, not agent:eval." });
  }

  let harness;
  try {
    harness = await import(pathToFileURL(path.join(agentDirectory, "evaluation-harness.js")).href);
  } catch {
    errors.push({ code: "evaluation_harness_unavailable", message: "Evaluation harness is unavailable." });
  }
  if (harness && harness.isImplemented !== true) {
    errors.push({ code: "evaluation_not_implemented", message: "Evaluation harness is not implemented." });
  }
  if (harness && typeof harness.evaluateCase !== "function") {
    errors.push({ code: "evaluation_harness_invalid", message: "Evaluation harness does not export evaluateCase." });
  }

  const results = [];
  if (!errors.length) {
    for (const definition of suite.cases) {
      let result;
      try {
        result = await harness.evaluateCase({ definition, mode: "mock" });
      } catch {
        errors.push({ code: "evaluation_case_failed", message: `Evaluation case could not be executed: ${definition.id}.` });
        continue;
      }
      results.push({ id: definition.id, passed: result?.passed === true });
      errors.push(...validateEvaluationResult({ definition, result }));
    }
  }

  const totalCases = Array.isArray(suite.cases) ? suite.cases.length : 0;
  const passedCases = results.filter((result) => result.passed).length;
  const score = totalCases ? Math.round((passedCases / totalCases) * 100) : 0;
  const syntheticContractOnly =
    suite.fixturePolicy?.evidenceScope === "synthetic-contract-only" &&
    suite.fixturePolicy?.empiricalQualityEvidence === false &&
    suite.scoring?.scope === "synthetic-contract-only" &&
    suite.scoring?.empiricalQualityEvidence === false;
  if (!errors.length && score < suite.scoring.minimumPassingScore) {
    errors.push({
      code: syntheticContractOnly ? "contract_case_coverage_incomplete" : "evaluation_score_below_threshold",
      message: syntheticContractOnly
        ? "Synthetic contract cases did not all pass."
        : "Evaluation score is below the required threshold.",
    });
  }

  return createCommandReport({
    command: "agent:eval",
    agentKey,
    status: errors.length ? "failed" : "passed",
    gates: [{
      id: "G4",
      status: errors.length ? "failed" : "passed",
      detail: errors.length
        ? "Versioned evaluation did not pass."
        : syntheticContractOnly
          ? "Versioned synthetic contract checks passed."
          : "Versioned evaluation passed.",
    }],
    evidence: errors.length
      ? []
      : syntheticContractOnly
        ? [
          `evaluation-suite:${suite.suiteVersion}`,
          `contract-cases:${passedCases}/${totalCases}`,
          "evidence-scope:synthetic-contract-only",
        ]
        : [`evaluation-suite:${suite.suiteVersion}`, `score:${score}`],
    errors,
  });
}

export async function runAgentEval(argv = process.argv.slice(2), { repoRoot } = {}) {
  const options = parseCliOptions(argv, { valueOptions: ["agent", "suite", "format"] });
  assertNoSecretLikeOptions(options);
  assertOutputFormat(options.format);
  if (options._.length) throw new AgentCliError(`Unexpected argument: ${options._[0]}`);
  if (!options.agent) throw new AgentCliError("Option --agent is required.");
  if (options.suite && options.suite !== "default") {
    throw new AgentCliError("Only the default versioned evaluation suite is supported.");
  }
  return evaluateAgentSuite({
    repoRoot: repoRoot || await findRepositoryRoot(),
    agentKey: options.agent,
  });
}

const isDirectExecution = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) executeCliCommand(runAgentEval);
