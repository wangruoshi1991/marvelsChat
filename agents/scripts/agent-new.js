import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AgentCliError,
  PROFILE_REQUIREMENTS,
  assertNamedOwners,
  assertNoSecretLikeOptions,
  assertOutputFormat,
  assertProfiles,
  executeCliCommand,
  createCommandReport,
  findRepositoryRoot,
  isSafeAgentKey,
  parseCliOptions,
  stableJson,
} from "./lib/agent-cli.js";

const utcNow = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const identityForKey = (key) => {
  const hash = createHash("sha256").update(key).digest("hex");
  const mark = key
    .split("-")
    .map((part) => part.slice(0, 1).toUpperCase())
    .join("")
    .slice(0, 3);
  return {
    avatarKind: "agent-mark",
    mark: mark || "A",
    shape: "squircle",
    colors: {
      background: `#${hash.slice(0, 6)}`,
      foreground: "#ffffff",
      accent: `#${hash.slice(6, 12)}`,
    },
  };
};

const runtimeForLifecycle = ({ key, version, lifecycle = "draft" }) => {
  const timestamp = utcNow();
  return {
    schemaVersion: "0.2",
    agentKey: key,
    agentVersion: version,
    lifecycle,
    operatorEnabled: false,
    liveness: { state: "unknown", checkedAt: timestamp },
    readiness: { state: "not-ready", checkedAt: timestamp },
    capacity: { state: "unknown", evaluatedAt: timestamp },
    routeEligibility: {
      registered: false,
      lifecycleAllowsUse: false,
      operatorEnabled: false,
      readinessReady: false,
      capacityAvailable: false,
      canRouteNewRun: false,
      reasonCodes: ["lifecycle-not-available", "not-ready"],
    },
    publicAvailability: {
      state: "temporarily-unavailable",
      canStartRun: false,
      reasonCodes: ["lifecycle-not-available", "not-ready"],
    },
    evaluatedAt: timestamp,
  };
};

const executionForProfiles = (profiles) => {
  const hasEventDriven = profiles.includes("event-driven");
  const hasAsynchronous = profiles.includes("asynchronous-generation");
  const hasOrchestrator = profiles.includes("orchestrator");
  const mode = hasEventDriven
    ? "event-driven"
    : hasAsynchronous
      ? "asynchronous"
      : hasOrchestrator
        ? "orchestrated"
        : "synchronous";
  const needsCheckpoint = hasEventDriven || hasAsynchronous;

  return {
    mode,
    idempotencyRequired: hasEventDriven || hasAsynchronous || profiles.includes("synchronous-tool"),
    timeoutSeconds: mode === "synchronous" ? 60 : 900,
    cancellable: mode !== "synchronous",
    resumable: needsCheckpoint,
    maxConcurrentRunsPerUser: 1,
    checkpoint: needsCheckpoint
      ? {
          schemaVersion: "1.0.0",
          stateSchema: "checkpoint.schema.json",
          maxAgeSeconds: 86400,
          recoveryPolicy: "restart-from-safe-boundary",
          compatibilityPolicy: "same-major-only",
        }
      : null,
    deduplicationWindowSeconds: hasEventDriven ? 3600 : null,
    maxDelegationDepth: hasOrchestrator ? 1 : null,
  };
};

const riskForProfiles = (profiles) => {
  const highRisk = profiles.includes("high-risk-action");
  const elevatedRisk = highRisk || profiles.includes("paid") || profiles.includes("sensitive-data");
  return {
    level: highRisk ? "R3" : elevatedRisk ? "R2" : "R1",
    dataClasses: profiles.includes("sensitive-data") ? ["private", "sensitive"] : ["internal"],
    requiresUserConfirmation: elevatedRisk,
    requiresHumanReview: highRisk,
    consentVersion: profiles.includes("sensitive-data") ? "agent-consent-v1" : null,
  };
};

const billingForProfiles = (profiles) => {
  const paid = profiles.includes("paid");
  return {
    mode: paid ? "metered" : "free",
    ...(paid ? { currency: "CNY" } : {}),
    providerCallsDefaultEnabled: false,
    confirmationRequired: paid,
    userDailyLimit: paid ? 1 : null,
    ...(paid ? { globalDailyBudgetFen: 1, alertThresholdPercent: 80 } : {}),
    retryOnUnknownBilling: false,
  };
};

const artifactDefinitions = (profiles) =>
  profiles.includes("artifact-producing")
    ? [
        {
          type: "private-output",
          contentTypes: ["application/json"],
          defaultVisibility: "private",
          retentionDays: 30,
          deletable: true,
          integrityRequired: true,
          viewer: "structured-data",
          minimumAppBuild: null,
        },
      ]
    : [];

const buildManifest = ({ key, name, profiles, owners }) => {
  const version = "0.1.0";
  const artifacts = artifactDefinitions(profiles);
  const execution = executionForProfiles(profiles);
  const risk = riskForProfiles(profiles);
  const billing = billingForProfiles(profiles);
  return {
    schemaVersion: "0.2",
    key,
    name,
    version,
    owner: owners,
    lifecycle: "draft",
    profiles,
    description: `${name} draft scaffold.`,
    limitations: ["This scaffold is not available for production use."],
    entrypoints: ["workspace"],
    catalog: {
      shortDescription: `${name} draft scaffold.`,
      capabilities: [
        {
          key: `${key}-capability`,
          label: `${name} capability`,
          description: "Draft capability pending implementation.",
          inputSummary: "Approved Agent input",
          outputSummary: "Safe Agent result",
        },
      ],
      whenToUse: ["Use only after the Agent passes the required release gates."],
      whenNotToUse: ["Do not use before the Agent is ready."],
      interaction: {
        progress: execution.mode === "synchronous" ? "none" : "stage",
        requiresConfirmation: risk.requiresUserConfirmation,
        artifactAccess: artifacts.length > 0,
      },
    },
    execution,
    capabilities: [`${key}-capability`],
    permissions: [],
    contracts: {
      controlPlaneVersion: "0.2",
      inputSchema: "contracts/input.schema.json",
      outputSchema: "contracts/output.schema.json",
      publicErrorSchema: "contracts/public-error.schema.json",
      eventSchema: "agent-event.fixture.json",
      domainApiPrefix: `/api/agents/${key}`,
    },
    artifacts,
    risk,
    billing,
    dependencies: {
      providers: profiles.includes("external-provider") ? ["unconfigured-provider"] : [],
      runtimeCapabilities: ["control-plane"],
      requiredEnvironmentNames: [],
    },
    audit: {
      eventTypes: [`${key}.run.created`],
      redactedFields: ["authorization", "apiKey", "token", "signedUrl"],
      retentionDays: 180,
      tracePropagation: { required: true, format: "w3c-trace-context" },
    },
    evaluation: {
      suitePath: `${key}/evaluation-suite.json`,
      suiteVersion: "0.1.0",
      minimumPassingScore: 85,
      minimumCaseCount: 1,
      requiresHumanJudgement: false,
    },
    compatibility: {
      minimumAppBuild: null,
      minimumBackendContract: "0.2",
      minimumAgentCardSchema: "0.2",
      replacesAgentVersion: null,
    },
    operations: {
      runbook: `docs/agents/${key}/runbook.md`,
      providerKillSwitch: `${key.replace(/-/g, "_").toUpperCase()}_PROVIDER_CALLS_ENABLED`,
      newRunKillSwitch: `${key.replace(/-/g, "_").toUpperCase()}_ENABLED`,
      deprecationPolicy: "Stop new runs before approved cleanup.",
      adminControls: {
        availability: true,
        recentRuns: true,
        metrics: true,
        cost: true,
        evaluation: true,
        killSwitches: true,
      },
    },
  };
};

const buildAgentCard = (manifest, runtimeStatus) => ({
  schemaVersion: "0.2",
  agentKey: manifest.key,
  agentVersion: manifest.version,
  displayName: manifest.name,
  shortDescription: manifest.catalog.shortDescription,
  capabilities: manifest.catalog.capabilities,
  entrypoints: manifest.entrypoints,
  whenToUse: manifest.catalog.whenToUse,
  whenNotToUse: manifest.catalog.whenNotToUse,
  limitations: manifest.limitations,
  interaction: {
    runMode: manifest.execution.mode,
    progress: manifest.catalog.interaction.progress,
    requiresConfirmation: manifest.catalog.interaction.requiresConfirmation,
    cancellable: manifest.execution.cancellable,
    resumable: manifest.execution.resumable,
  },
  artifactSupport: manifest.artifacts.map((artifact) => ({
    type: artifact.type,
    viewer: artifact.viewer,
    contentTypes: artifact.contentTypes,
  })),
  minimumAppBuild: manifest.compatibility.minimumAppBuild,
  availability: runtimeStatus.publicAvailability,
  updatedAt: runtimeStatus.evaluatedAt,
});

const buildEventFixture = ({ key, version }) => ({
  schemaVersion: "0.2",
  eventId: `evt-${key}-0001`,
  eventType: "agent.run.accepted",
  occurredAt: utcNow(),
  agentKey: key,
  agentRunId: `run-${key}-0001`,
  capabilityJobId: null,
  traceId: "0123456789abcdef0123456789abcdef",
  parentEventId: null,
  causationId: null,
  attempt: 1,
  sequence: 1,
  deliveryKey: `run-${key}-0001:1:1`,
  visibility: "client",
  stage: "accepted",
  progressPercent: 0,
  redactionApplied: true,
  data: { messageCode: "agent-run-accepted", agentVersion: version },
});

const buildEvaluationSuite = ({ key, version }) => ({
  schemaVersion: "0.2",
  agentKey: key,
  agentVersion: version,
  suiteVersion: "0.1.0",
  fixturePolicy: {
    versioned: true,
    noProductionPersonalData: true,
    storageReference: `fixtures/${key}/v1`,
  },
  cases: [
    {
      id: "contract-validity",
      category: "compatibility",
      fixtureRef: `fixtures/${key}/v1/contract-validity.json`,
      expected: {
        terminalPublicStatus: "succeeded",
        publicErrorCode: null,
        requiredEventTypes: ["agent.run.accepted", "agent.run.succeeded"],
        artifactAssertions: [],
        providerInteraction: "none",
      },
      limits: { maxLatencyMs: 1000, maxCostFen: 0, maxProviderCalls: 0 },
      review: {
        automatedAssertions: ["schemas are valid"],
        requiresHumanJudgement: false,
        qualityRubricRef: null,
      },
    },
  ],
  scoring: {
    minimumPassingScore: 85,
    metrics: [
      {
        key: "contract-correctness",
        weight: 1,
        threshold: 100,
        direction: "higher-is-better",
      },
    ],
  },
});

const buildCheckpointSchema = ({ key }) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: `${key} checkpoint`,
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "stage"],
  properties: {
    schemaVersion: { const: "1.0.0" },
    stage: { type: "string", minLength: 1, maxLength: 80 },
  },
});

const buildProjectionModule = () => `export function projectAgentCard(manifest, runtimeStatus) {
  return {
    schemaVersion: "0.2",
    agentKey: manifest.key,
    agentVersion: manifest.version,
    displayName: manifest.name,
    shortDescription: manifest.catalog.shortDescription,
    capabilities: manifest.catalog.capabilities,
    entrypoints: manifest.entrypoints,
    whenToUse: manifest.catalog.whenToUse,
    whenNotToUse: manifest.catalog.whenNotToUse,
    limitations: manifest.limitations,
    interaction: {
      runMode: manifest.execution.mode,
      progress: manifest.catalog.interaction.progress,
      requiresConfirmation: manifest.catalog.interaction.requiresConfirmation,
      cancellable: manifest.execution.cancellable,
      resumable: manifest.execution.resumable,
    },
    artifactSupport: manifest.artifacts.map(({ type, viewer, contentTypes }) => ({ type, viewer, contentTypes })),
    minimumAppBuild: manifest.compatibility.minimumAppBuild,
    availability: runtimeStatus.publicAvailability,
    updatedAt: runtimeStatus.evaluatedAt,
  };
}
`;

const buildSmokeAdapter = () => `export default {
  async run({ mode }) {
    if (mode !== "mock") {
      throw new Error("This draft Agent only supports mock smoke execution.");
    }
    return {
      status: "not-implemented",
      evidence: [],
    };
  },
};
`;

const buildEvaluationHarness = () => `export const isImplemented = false;

export async function evaluateCase() {
  return {
    passed: false,
    code: "evaluation-not-implemented",
  };
}
`;

const buildTestPlan = ({ profiles }) => ({
  schemaVersion: "0.2",
  deterministicTests: [],
  requiredGates: ["G1", "G2", "G3", "G4"],
  profileRequirements: Object.fromEntries(
    profiles.map((profile) => [profile, PROFILE_REQUIREMENTS[profile]]),
  ),
});

const buildIntegrationDeclaration = () => ({
  schemaVersion: "0.2",
  migrationFiles: [],
  routeFiles: [],
  auditTestFiles: [],
  deterministicTestFiles: [],
  auditEventTypes: [],
});

const buildContractTest = ({ key }) => `import test from "node:test";

test.skip("${key} draft contract requires implementation", () => {});
`;

const buildContractSchema = ({ title }) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title,
  type: "object",
  additionalProperties: false,
});

const buildAgentModule = ({ key, name, identity }) => `export default {
  key: ${JSON.stringify(key)},
  name: ${JSON.stringify(name)},
  version: "0.1.0",
  category: "draft",
  description: "Draft Agent scaffold.",
  capabilities: [${JSON.stringify(`${key}-capability`)}],
  permissions: [],
  identity: ${JSON.stringify(identity, null, 2)},
};
`;

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listFiles(entryPath);
    return [entryPath];
  }));
  return nested.flat();
}

async function assertAgentKeyIsAvailable({ repoRoot, key }) {
  const agentsDirectory = path.join(repoRoot, "agents");
  const agentDirectory = path.join(agentsDirectory, key);
  const agentModule = path.join(agentsDirectory, `${key}.agent.js`);
  const documentationDirectory = path.join(repoRoot, "docs", "agents", key);

  for (const candidate of [agentDirectory, agentModule, documentationDirectory]) {
    if (await fs.stat(candidate).catch(() => null)) {
      throw new AgentCliError(`Refusing to overwrite existing path: ${candidate}`);
    }
  }

  const existingAgentFiles = await fs.readdir(agentsDirectory).catch(() => []);
  for (const file of existingAgentFiles.filter((entry) => entry.endsWith(".agent.js"))) {
    const content = await fs.readFile(path.join(agentsDirectory, file), "utf8");
    if (new RegExp(`key\\s*:\\s*["']${key}["']`).test(content)) {
      throw new AgentCliError(`Agent key is already registered: ${key}`);
    }
  }

  const migrationDirectory = path.join(repoRoot, "backend", "database");
  const normalizedKey = key.replace(/-/g, "[-_]");
  const migrationPattern = new RegExp(`(?:^|[_-])${normalizedKey}(?:[_-]|\\.)`, "i");
  const migrationFiles = await fs.readdir(migrationDirectory).catch(() => []);
  if (migrationFiles.some((file) => migrationPattern.test(file))) {
    throw new AgentCliError(`Agent key is already reserved by a database migration: ${key}`);
  }

  const routeDirectory = path.join(repoRoot, "backend", "src", "routes");
  const routePrefixes = [
    `/api/agents/${key}`,
    `/api/station/${key}`,
    `/api/admin/${key}`,
  ];
  const routeFiles = await listFiles(routeDirectory);
  for (const routeFile of routeFiles) {
    const content = await fs.readFile(routeFile, "utf8").catch(() => "");
    if (routePrefixes.some((prefix) => content.includes(prefix))) {
      throw new AgentCliError(`Agent key is already reserved by a route prefix: ${key}`);
    }
  }
}

export async function createAgentScaffold({ repoRoot, key, name, profiles, owners }) {
  if (!isSafeAgentKey(key)) {
    throw new AgentCliError("Agent key must be a lowercase slug.");
  }
  if (typeof name !== "string" || !name.trim()) {
    throw new AgentCliError("Agent name is required.");
  }
  assertProfiles(profiles);
  assertNamedOwners(owners);
  await assertAgentKeyIsAvailable({ repoRoot, key });

  const agentDirectory = path.join(repoRoot, "agents", key);
  const documentationDirectory = path.join(repoRoot, "docs", "agents", key);
  const manifest = buildManifest({ key, name: name.trim(), profiles, owners });
  const runtimeStatus = runtimeForLifecycle({ key, version: manifest.version });
  const card = buildAgentCard(manifest, runtimeStatus);
  const identity = identityForKey(key);
  const contractsDirectory = path.join(agentDirectory, "contracts");
  const testsDirectory = path.join(agentDirectory, "tests");
  const writes = [
    [path.join(repoRoot, "agents", `${key}.agent.js`), buildAgentModule({ key, name: name.trim(), identity })],
    [path.join(agentDirectory, "manifest.json"), stableJson(manifest)],
    [path.join(agentDirectory, "agent-card.fixture.json"), stableJson(card)],
    [path.join(agentDirectory, "runtime-status.fixture.json"), stableJson(runtimeStatus)],
    [path.join(agentDirectory, "agent-event.fixture.json"), stableJson(buildEventFixture({ key, version: manifest.version }))],
    [path.join(agentDirectory, "evaluation-suite.json"), stableJson(buildEvaluationSuite({ key, version: manifest.version }))],
    [
      path.join(agentDirectory, "profile-requirements.json"),
      stableJson({
        schemaVersion: "0.2",
        profiles,
        requirements: Object.fromEntries(profiles.map((profile) => [profile, PROFILE_REQUIREMENTS[profile]])),
      }),
    ],
    [path.join(agentDirectory, "manifest-projection.js"), buildProjectionModule()],
    [path.join(agentDirectory, "smoke.js"), buildSmokeAdapter()],
    [path.join(agentDirectory, "evaluation-harness.js"), buildEvaluationHarness()],
    [path.join(agentDirectory, "test-plan.json"), stableJson(buildTestPlan({ profiles }))],
    [path.join(agentDirectory, "integration.json"), stableJson(buildIntegrationDeclaration())],
    [path.join(testsDirectory, "agent-contract.test.js"), buildContractTest({ key })],
    [path.join(contractsDirectory, "input.schema.json"), stableJson(buildContractSchema({ title: `${key} input` }))],
    [path.join(contractsDirectory, "output.schema.json"), stableJson(buildContractSchema({ title: `${key} output` }))],
    [path.join(contractsDirectory, "public-error.schema.json"), stableJson(buildContractSchema({ title: `${key} public error` }))],
    [path.join(documentationDirectory, ".gitkeep"), ""],
  ];

  if (manifest.execution.checkpoint) {
    writes.push([
      path.join(agentDirectory, "checkpoint.schema.json"),
      stableJson(buildCheckpointSchema({ key })),
    ]);
  }

  const createdFiles = [];
  let createdAgentDirectory = false;
  let createdDocumentationDirectory = false;
  try {
    await fs.mkdir(agentDirectory);
    createdAgentDirectory = true;
    await fs.mkdir(contractsDirectory);
    await fs.mkdir(testsDirectory);
    await fs.mkdir(documentationDirectory, { recursive: true });
    createdDocumentationDirectory = true;
    for (const [file, content] of writes) {
      await fs.writeFile(file, content, { encoding: "utf8", flag: "wx" });
      createdFiles.push(file);
    }
  } catch (error) {
    await Promise.all(createdFiles.reverse().map((file) => fs.unlink(file).catch(() => {})));
    if (createdAgentDirectory) {
      await fs.rmdir(contractsDirectory).catch(() => {});
      await fs.rmdir(testsDirectory).catch(() => {});
      await fs.rmdir(agentDirectory).catch(() => {});
    }
    if (createdDocumentationDirectory) await fs.rmdir(documentationDirectory).catch(() => {});
    throw error;
  }

  return { agentKey: key, createdPaths: writes.map(([file]) => file) };
}

export async function runAgentNew(argv = process.argv.slice(2), { repoRoot } = {}) {
  const options = parseCliOptions(argv, {
    valueOptions: [
      "key",
      "name",
      "profiles",
      "owner-team",
      "agent-owner",
      "capability-owner",
      "client-owner",
      "security-reviewer",
      "release-owner",
      "format",
    ],
  });
  assertNoSecretLikeOptions(options);
  assertOutputFormat(options.format);
  if (options._.length) {
    throw new AgentCliError(`Unexpected argument: ${options._[0]}`);
  }
  const resolvedRepoRoot = repoRoot || await findRepositoryRoot();

  const result = await createAgentScaffold({
    repoRoot: resolvedRepoRoot,
    key: options.key,
    name: options.name,
    profiles: options.profiles?.split(",").map((profile) => profile.trim()).filter(Boolean),
    owners: {
      team: options["owner-team"],
      agentOwner: options["agent-owner"],
      capabilityOwner: options["capability-owner"],
      clientOwner: options["client-owner"],
      securityReviewer: options["security-reviewer"],
      releaseOwner: options["release-owner"],
    },
  });

  return createCommandReport({
    command: "agent:new",
    agentKey: result.agentKey,
    evidence: result.createdPaths.map((file) => path.relative(resolvedRepoRoot, file)),
  });
}

const isDirectExecution = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) {
  executeCliCommand(runAgentNew);
}
