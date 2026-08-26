import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import {
  AgentCliError,
  PROFILE_REQUIREMENTS,
  assertNamedOwners,
  assertNoSecretLikeOptions,
  assertOutputFormat,
  assertPathInsideDirectory,
  createCommandReport,
  executeCliCommand,
  findRepositoryRoot,
  isSafeAgentKey,
  parseCliOptions,
} from "./lib/agent-cli.js";

const fixtureSchemas = {
  manifest: "agent-manifest.schema.json",
  card: "agent-card.schema.json",
  runtimeStatus: "runtime-status.schema.json",
  event: "agent-event.schema.json",
  evaluation: "evaluation-suite.schema.json",
};

const forbiddenClientFieldNames = new Set([
  "apikey",
  "authorization",
  "secret",
  "signedurl",
  "storagekey",
  "endpoint",
  "provider",
]);

const draftLifecycles = new Set(["draft", "review"]);

const readJson = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    throw new AgentCliError(`Unable to read required JSON file: ${path.basename(file)}`, {
      code: "invalid_json_fixture",
    });
  }
};

const addError = (errors, code, message) => {
  errors.push({ code, message });
};

const scanForbiddenFieldNames = (value, pathPrefix = "", findings = []) => {
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanForbiddenFieldNames(item, `${pathPrefix}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== "object") return findings;
  for (const [key, child] of Object.entries(value)) {
    const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    const nextPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (forbiddenClientFieldNames.has(normalized)) findings.push(nextPath);
    scanForbiddenFieldNames(child, nextPath, findings);
  }
  return findings;
};

const validIdentity = (identity) =>
  identity?.avatarKind === "agent-mark" &&
  typeof identity.mark === "string" &&
  identity.mark.trim() &&
  ["circle", "squircle", "rounded"].includes(identity.shape) &&
  typeof identity.colors?.background === "string" &&
  typeof identity.colors?.foreground === "string" &&
  typeof identity.colors?.accent === "string";

async function validateFixture({ repoRoot, fixture, value, errors }) {
  const schemaFile = path.join(repoRoot, "docs", "agent-sop", "schemas", fixtureSchemas[fixture]);
  let schema;
  try {
    schema = await readJson(schemaFile);
  } catch (error) {
    addError(errors, "schema_unavailable", `Required ${fixture} schema is unavailable.`);
    return;
  }

  try {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(schema);
    if (!validate(value)) {
      const details = (validate.errors || [])
        .slice(0, 5)
        .map((issue) => `${issue.instancePath || "/"} ${issue.message || "is invalid"}`)
        .join("; ");
      addError(errors, "schema_invalid", `${fixture} fixture is invalid: ${details}`);
    }
  } catch {
    addError(errors, "schema_unavailable", `Required ${fixture} schema could not be compiled.`);
  }
}

async function loadAgentModule(file) {
  try {
    return (await import(pathToFileURL(file).href)).default;
  } catch {
    throw new AgentCliError("Unable to load the Agent definition.", {
      code: "agent_definition_unavailable",
    });
  }
}

async function validateRegistryUniqueness({ repoRoot, agentKey, agent, errors }) {
  const agentsDirectory = path.join(repoRoot, "agents");
  const files = (await fs.readdir(agentsDirectory).catch(() => []))
    .filter((file) => file.endsWith(".agent.js"));
  const identity = JSON.stringify(agent.identity);
  for (const file of files) {
    const candidateFile = path.join(agentsDirectory, file);
    if (candidateFile === path.join(agentsDirectory, `${agentKey}.agent.js`)) continue;
    let candidate;
    try {
      candidate = await loadAgentModule(candidateFile);
    } catch {
      addError(errors, "registry_definition_unavailable", `Unable to load registered Agent definition: ${file}`);
      continue;
    }
    if (candidate.key === agent.key) {
      addError(errors, "registry_key_not_unique", "Agent definition key is not unique in the registry.");
    }
    if (JSON.stringify(candidate.identity) === identity) {
      addError(errors, "identity_not_unique", "Agent identity is not unique in the registry.");
    }
  }
}

function validateProfileConsistency({ manifest, runtimeStatus, card, errors }) {
  const profiles = new Set(manifest.profiles || []);
  const execution = manifest.execution || {};
  if (profiles.has("asynchronous-generation") && (execution.mode !== "asynchronous" || !execution.checkpoint || !execution.resumable)) {
    addError(errors, "profile_execution_mismatch", "Asynchronous-generation requires resumable asynchronous checkpoints.");
  }
  if (profiles.has("event-driven") && (execution.mode !== "event-driven" || !execution.checkpoint || !execution.idempotencyRequired)) {
    addError(errors, "profile_execution_mismatch", "Event-driven requires checkpointed, idempotent event execution.");
  }
  if (profiles.has("orchestrator") && execution.mode !== "orchestrated") {
    addError(errors, "profile_execution_mismatch", "Orchestrator requires orchestrated execution.");
  }
  if (profiles.has("paid") && (
    manifest.billing?.mode !== "metered" ||
    manifest.billing?.confirmationRequired !== true ||
    manifest.billing?.providerCallsDefaultEnabled !== false ||
    manifest.billing?.retryOnUnknownBilling !== false
  )) {
    addError(errors, "paid_profile_mismatch", "Paid profile requires disabled-by-default metered billing controls.");
  }
  if (profiles.has("sensitive-data") && (
    manifest.risk?.level === "R0" ||
    !manifest.risk?.consentVersion ||
    !manifest.risk?.dataClasses?.includes("sensitive")
  )) {
    addError(errors, "sensitive_profile_mismatch", "Sensitive-data profile requires explicit consent and sensitive data classification.");
  }
  if (profiles.has("high-risk-action") && (
    manifest.risk?.level !== "R3" || manifest.risk?.requiresHumanReview !== true
  )) {
    addError(errors, "high_risk_profile_mismatch", "High-risk-action requires R3 and human review.");
  }
  if (JSON.stringify(card.availability) !== JSON.stringify(runtimeStatus.publicAvailability)) {
    addError(errors, "availability_projection_mismatch", "AgentCard availability must match RuntimeStatus public availability.");
  }
  if (card.minimumAppBuild !== manifest.compatibility?.minimumAppBuild) {
    addError(errors, "minimum_app_build_mismatch", "AgentCard minimum app build must match the Manifest.");
  }
}

async function validateImplementationReferences({
  repoRoot,
  agentDirectory,
  manifest,
  testPlan,
  integration,
}) {
  const errors = [];
  const checkFiles = async ({ references, allowedDirectory, missingCode, invalidCode, contains }) => {
    if (!Array.isArray(references) || references.length === 0) {
      addError(errors, missingCode, "Required implementation reference is missing.");
      return;
    }
    for (const reference of references) {
      if (typeof reference !== "string" || !reference) {
        addError(errors, invalidCode, "Implementation reference must be a non-empty path.");
        continue;
      }
      const file = path.resolve(repoRoot, reference);
      try {
        assertPathInsideDirectory(repoRoot, file);
      } catch {
        addError(errors, invalidCode, "Implementation reference path is unsafe.");
        continue;
      }
      const allowedRoot = path.resolve(repoRoot, allowedDirectory);
      if (file !== allowedRoot && !file.startsWith(`${allowedRoot}${path.sep}`)) {
        addError(errors, invalidCode, "Implementation reference points outside its allowed area.");
        continue;
      }
      let contents;
      try {
        contents = await fs.readFile(file, "utf8");
      } catch {
        addError(errors, invalidCode, "Implementation reference file is unavailable.");
        continue;
      }
      if (contains && !contains(contents)) {
        addError(errors, invalidCode, "Implementation reference does not declare the expected contract.");
      }
    }
  };

  if (!integration || integration.schemaVersion !== "0.2") {
    addError(errors, "integration_declaration_invalid", "Integration declaration must use schema version 0.2.");
    return errors;
  }

  await checkFiles({
    references: integration.migrationFiles,
    allowedDirectory: "backend/database",
    missingCode: "missing_migration_reference",
    invalidCode: "invalid_migration_reference",
  });
  await checkFiles({
    references: integration.routeFiles,
    allowedDirectory: "backend/src/routes",
    missingCode: "missing_route_reference",
    invalidCode: "invalid_route_reference",
    contains: (contents) => contents.includes(manifest.contracts.domainApiPrefix),
  });
  await checkFiles({
    references: integration.auditTestFiles,
    allowedDirectory: "backend/test",
    missingCode: "missing_audit_test_reference",
    invalidCode: "invalid_audit_test_reference",
    contains: (contents) => manifest.audit.eventTypes.some((eventType) => contents.includes(eventType)),
  });

  const expectedTestFiles = (testPlan.deterministicTests || []).map((definition) => definition.file).sort();
  const actualTestFiles = Array.isArray(integration.deterministicTestFiles)
    ? [...integration.deterministicTestFiles].sort()
    : [];
  if (expectedTestFiles.length === 0 || actualTestFiles.length === 0) {
    addError(errors, "missing_deterministic_test_reference", "Sandbox and later Agents require deterministic test references.");
  } else if (JSON.stringify(expectedTestFiles) !== JSON.stringify(actualTestFiles)) {
    addError(errors, "deterministic_test_reference_mismatch", "Integration test references must match the Agent test plan.");
  }
  if (JSON.stringify(integration.auditEventTypes || []) !== JSON.stringify(manifest.audit.eventTypes || [])) {
    addError(errors, "audit_event_reference_mismatch", "Integration audit events must match the Manifest audit declaration.");
  }
  return errors;
}

export async function checkAgentPackage({ repoRoot, agentKey }) {
  if (!isSafeAgentKey(agentKey)) {
    throw new AgentCliError("Agent key must be a lowercase slug.");
  }

  const agentDirectory = path.join(repoRoot, "agents", agentKey);
  const fixturePaths = {
    manifest: path.join(agentDirectory, "manifest.json"),
    card: path.join(agentDirectory, "agent-card.fixture.json"),
    runtimeStatus: path.join(agentDirectory, "runtime-status.fixture.json"),
    event: path.join(agentDirectory, "agent-event.fixture.json"),
    evaluation: path.join(agentDirectory, "evaluation-suite.json"),
    profileRequirements: path.join(agentDirectory, "profile-requirements.json"),
    projection: path.join(agentDirectory, "manifest-projection.js"),
    testPlan: path.join(agentDirectory, "test-plan.json"),
    integration: path.join(agentDirectory, "integration.json"),
    evaluationHarness: path.join(agentDirectory, "evaluation-harness.js"),
    agentModule: path.join(repoRoot, "agents", `${agentKey}.agent.js`),
  };
  const errors = [];

  const requiredFiles = Object.values(fixturePaths);
  for (const file of requiredFiles) {
    if (!await fs.stat(file).catch(() => null)) {
      addError(errors, "missing_required_file", `Required Agent file is missing: ${path.basename(file)}`);
    }
  }
  if (errors.length) {
    return createCommandReport({
      command: "agent:check",
      agentKey,
      status: "failed",
      errors,
    });
  }

  const fixtures = {
    manifest: await readJson(fixturePaths.manifest),
    card: await readJson(fixturePaths.card),
    runtimeStatus: await readJson(fixturePaths.runtimeStatus),
    event: await readJson(fixturePaths.event),
    evaluation: await readJson(fixturePaths.evaluation),
    profileRequirements: await readJson(fixturePaths.profileRequirements),
    testPlan: await readJson(fixturePaths.testPlan),
    integration: await readJson(fixturePaths.integration),
  };

  await Promise.all([
    validateFixture({ repoRoot, fixture: "manifest", value: fixtures.manifest, errors }),
    validateFixture({ repoRoot, fixture: "card", value: fixtures.card, errors }),
    validateFixture({ repoRoot, fixture: "runtimeStatus", value: fixtures.runtimeStatus, errors }),
    validateFixture({ repoRoot, fixture: "event", value: fixtures.event, errors }),
    validateFixture({ repoRoot, fixture: "evaluation", value: fixtures.evaluation, errors }),
  ]);

  try {
    assertNamedOwners(fixtures.manifest.owner);
  } catch {
    addError(errors, "owner_placeholder", "All Agent owner assignments must be named people or teams.");
  }

  if (fixtures.manifest.key !== agentKey) {
    addError(errors, "agent_key_mismatch", "Manifest key does not match the requested Agent key.");
  }
  if (fixtures.card.agentKey !== agentKey || fixtures.runtimeStatus.agentKey !== agentKey || fixtures.event.agentKey !== agentKey || fixtures.evaluation.agentKey !== agentKey) {
    addError(errors, "fixture_agent_key_mismatch", "All contract fixtures must use the requested Agent key.");
  }

  const forbiddenFields = [
    ...scanForbiddenFieldNames(fixtures.card, "agentCard"),
    ...scanForbiddenFieldNames(fixtures.event, "agentEvent"),
  ];
  for (const field of forbiddenFields) {
    addError(errors, "forbidden_field", `Client-safe fixture contains forbidden field: ${field}`);
  }

  const agent = await loadAgentModule(fixturePaths.agentModule).catch((error) => {
    addError(errors, error.code || "agent_definition_unavailable", "Unable to load Agent definition.");
    return null;
  });
  if (agent) {
    if (agent.key !== fixtures.manifest.key || agent.version !== fixtures.manifest.version) {
      addError(errors, "registry_mismatch", "Agent definition key or version differs from the Manifest.");
    }
    if (!validIdentity(agent.identity)) {
      addError(errors, "invalid_identity", "Agent definition identity is invalid.");
    }
    await validateRegistryUniqueness({ repoRoot, agentKey, agent, errors });
  }

  try {
    const projection = await import(pathToFileURL(fixturePaths.projection).href);
    const projected = projection.projectAgentCard(fixtures.manifest, fixtures.runtimeStatus);
    if (JSON.stringify(projected) !== JSON.stringify(fixtures.card)) {
      addError(errors, "projection_mismatch", "AgentCard fixture differs from the safe Manifest projection.");
    }
  } catch {
    addError(errors, "projection_unavailable", "Unable to load the Manifest projection.");
  }

  if (fixtures.profileRequirements?.schemaVersion !== "0.2") {
    addError(errors, "profile_requirements_invalid", "Profile requirements must use schema version 0.2.");
  }
  const manifestProfiles = fixtures.manifest.profiles || [];
  if (JSON.stringify(fixtures.profileRequirements?.profiles) !== JSON.stringify(manifestProfiles)) {
    addError(errors, "profile_requirements_mismatch", "Profile requirements must match Manifest profiles.");
  }
  for (const profile of manifestProfiles) {
    const expected = PROFILE_REQUIREMENTS[profile] || [];
    const actual = fixtures.profileRequirements?.requirements?.[profile];
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      addError(errors, "profile_requirement_missing", `Profile requirements do not match for ${profile}.`);
    }
  }
  if (fixtures.evaluation.cases.length < fixtures.manifest.evaluation.minimumCaseCount) {
    addError(errors, "evaluation_case_count", "Evaluation suite has fewer cases than the Manifest requires.");
  }
  if (!Array.isArray(fixtures.testPlan?.deterministicTests) || !Array.isArray(fixtures.testPlan?.requiredGates)) {
    addError(errors, "test_plan_invalid", "Agent test plan must declare deterministic tests and required gates.");
  }
  validateProfileConsistency({
    manifest: fixtures.manifest,
    runtimeStatus: fixtures.runtimeStatus,
    card: fixtures.card,
    errors,
  });

  const implementationErrors = draftLifecycles.has(fixtures.manifest.lifecycle)
    ? []
    : await validateImplementationReferences({
      repoRoot,
      agentDirectory,
      manifest: fixtures.manifest,
      testPlan: fixtures.testPlan,
      integration: fixtures.integration,
    });
  errors.push(...implementationErrors);

  const gates = [
    {
      id: "S0-S2",
      status: errors.length ? "failed" : "passed",
      detail: errors.length ? "Contract validation failed." : "Contract fixtures and safe projections are valid.",
    },
    {
      id: "S3+",
      status: draftLifecycles.has(fixtures.manifest.lifecycle)
        ? "not-applicable"
        : implementationErrors.length ? "failed" : "passed",
      detail: draftLifecycles.has(fixtures.manifest.lifecycle)
        ? "Implementation gates are not applicable while lifecycle is draft or review."
        : implementationErrors.length
          ? "Implementation references are incomplete or invalid."
          : "Implementation references are valid.",
    },
  ];

  return createCommandReport({
    command: "agent:check",
    agentKey,
    status: errors.length ? "failed" : "passed",
    gates,
    evidence: errors.length ? [] : ["manifest", "agent-card", "runtime-status", "agent-event", "evaluation-suite"],
    errors,
  });
}

export async function runAgentCheck(argv = process.argv.slice(2), { repoRoot } = {}) {
  const options = parseCliOptions(argv, {
    valueOptions: ["agent", "format"],
  });
  assertNoSecretLikeOptions(options);
  if (options._.length) {
    throw new AgentCliError(`Unexpected argument: ${options._[0]}`);
  }
  if (!options.agent) {
    throw new AgentCliError("Option --agent is required.");
  }
  assertOutputFormat(options.format);
  return checkAgentPackage({
    repoRoot: repoRoot || await findRepositoryRoot(),
    agentKey: options.agent,
  });
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  executeCliCommand(runAgentCheck);
}
