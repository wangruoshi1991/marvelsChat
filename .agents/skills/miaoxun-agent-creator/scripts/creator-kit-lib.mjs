import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const KIT_VERSION = "0.1.0";

export const SUPPORTED_PROFILES = Object.freeze([
  "conversational",
  "synchronous-tool",
  "asynchronous-generation",
  "orchestrator",
  "event-driven",
  "external-provider",
  "artifact-producing",
  "paid",
  "sensitive-data",
  "high-risk-action",
]);

const REQUIRED_FILES = Object.freeze([
  "README.md",
  "creator-spec.json",
  "instructions.md",
  "handoff.md",
  "progress.md",
  "contracts/creator-spec.schema.json",
  "contracts/submission-manifest.schema.json",
  "contracts/input.schema.json",
  "contracts/output.schema.json",
  "contracts/public-error.schema.json",
  "tests/cases.json",
]);

const TEXT_EXTENSIONS = new Set([".cjs", ".js", ".json", ".md", ".mjs", ".py", ".ts", ".tsx", ".txt"]);
const MAX_FILES = 200;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_PACKAGE_BYTES = 10 * 1024 * 1024;
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const creatorSpecSchemaPath = path.resolve(scriptDirectory, "../schemas/creator-spec.schema.json");
const submissionManifestSchemaPath = path.resolve(scriptDirectory, "../schemas/submission-manifest.schema.json");

export class CreatorKitError extends Error {
  constructor(code, message, { exitCode = 2 } = {}) {
    super(message);
    this.name = "CreatorKitError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const compareCodeUnits = (left, right) => (left < right ? -1 : left > right ? 1 : 0);
const isPlainObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isNonEmptyString = (value, maximum = 2000) =>
  typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const isSlug = (value) => typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
const isSemver = (value) => typeof value === "string" && /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/.test(value);

function creatorSpecInvalid() {
  throw new CreatorKitError("creator_spec_invalid", "creator-spec.json does not satisfy the public creator contract.");
}

function assertExactKeys(value, required, optional = []) {
  if (!isPlainObject(value)) creatorSpecInvalid();
  const allowed = new Set([...required, ...optional]);
  if (required.some((key) => !(key in value))) creatorSpecInvalid();
  if (Object.keys(value).some((key) => !allowed.has(key))) creatorSpecInvalid();
}

function assertStringArray(value, { minimum = 0, maximum = 50, slug = false } = {}) {
  if (!Array.isArray(value) || value.length < minimum || value.length > maximum) creatorSpecInvalid();
  if (new Set(value).size !== value.length) creatorSpecInvalid();
  for (const item of value) {
    if (slug ? !isSlug(item) : !isNonEmptyString(item, 500)) creatorSpecInvalid();
  }
}

function assertCreatorSpec(spec, availablePaths) {
  assertExactKeys(spec, [
    "$schema",
    "schemaVersion",
    "agent",
    "creator",
    "interaction",
    "dataUse",
    "cost",
    "implementation",
    "integration",
    "verification",
  ]);
  if (spec.$schema !== "./contracts/creator-spec.schema.json" || spec.schemaVersion !== KIT_VERSION) creatorSpecInvalid();

  assertExactKeys(spec.agent, ["key", "name", "version", "description", "goal", "nonGoals", "profiles", "status"]);
  if (!isSlug(spec.agent.key) || !isNonEmptyString(spec.agent.name, 80) || !isSemver(spec.agent.version)) creatorSpecInvalid();
  if (!isNonEmptyString(spec.agent.description, 240) || !isNonEmptyString(spec.agent.goal, 500) || spec.agent.status !== "draft") creatorSpecInvalid();
  assertStringArray(spec.agent.nonGoals, { maximum: 30 });
  assertStringArray(spec.agent.profiles, { minimum: 1, maximum: SUPPORTED_PROFILES.length, slug: true });
  if (spec.agent.profiles.some((profile) => !SUPPORTED_PROFILES.includes(profile))) creatorSpecInvalid();

  assertExactKeys(spec.creator, ["displayName", "team"]);
  if (!isNonEmptyString(spec.creator.displayName, 120)) creatorSpecInvalid();
  if (spec.creator.team !== null && !isNonEmptyString(spec.creator.team, 120)) creatorSpecInvalid();

  assertExactKeys(spec.interaction, ["runMode", "progress", "confirmBeforeActions"]);
  if (!["synchronous", "asynchronous", "event-driven", "orchestrated"].includes(spec.interaction.runMode)) creatorSpecInvalid();
  if (!["none", "stage", "percentage"].includes(spec.interaction.progress)) creatorSpecInvalid();
  assertStringArray(spec.interaction.confirmBeforeActions, { maximum: 30 });

  assertExactKeys(spec.dataUse, ["inputClasses", "externalRecipients", "retentionDays", "deletionSupported", "consentRequired"]);
  assertStringArray(spec.dataUse.inputClasses, { minimum: 1, maximum: 30, slug: true });
  assertStringArray(spec.dataUse.externalRecipients, { maximum: 30 });
  if (spec.dataUse.retentionDays !== null && (!Number.isInteger(spec.dataUse.retentionDays) || spec.dataUse.retentionDays < 1 || spec.dataUse.retentionDays > 3650)) creatorSpecInvalid();
  if (typeof spec.dataUse.deletionSupported !== "boolean" || typeof spec.dataUse.consentRequired !== "boolean") creatorSpecInvalid();

  assertExactKeys(spec.cost, ["mode", "payer", "budgetCny", "realProviderCallsApproved", "retryOnUnknownBilling"]);
  if (!["free", "fixed", "metered"].includes(spec.cost.mode)) creatorSpecInvalid();
  if (!["creator", "user", "platform", "not-applicable"].includes(spec.cost.payer)) creatorSpecInvalid();
  if (spec.cost.budgetCny !== null && (typeof spec.cost.budgetCny !== "number" || !Number.isFinite(spec.cost.budgetCny) || spec.cost.budgetCny <= 0)) creatorSpecInvalid();
  if (spec.cost.realProviderCallsApproved !== false || spec.cost.retryOnUnknownBilling !== false) creatorSpecInvalid();

  assertExactKeys(spec.implementation, ["kind", "entry", "testCommand"]);
  if (!["instructions", "source", "external-service"].includes(spec.implementation.kind)) creatorSpecInvalid();
  if (!isNonEmptyString(spec.implementation.entry, 240)) creatorSpecInvalid();
  if (spec.implementation.testCommand !== null && !isNonEmptyString(spec.implementation.testCommand, 500)) creatorSpecInvalid();
  const normalizedEntry = spec.implementation.entry.replaceAll("\\", "/");
  if (path.posix.normalize(normalizedEntry) !== normalizedEntry || normalizedEntry.startsWith("../") || normalizedEntry.startsWith("/")) creatorSpecInvalid();
  if (!availablePaths.has(normalizedEntry)) creatorSpecInvalid();
  if (spec.implementation.kind === "instructions" && normalizedEntry !== "instructions.md") creatorSpecInvalid();
  if (spec.implementation.kind === "source" && !normalizedEntry.startsWith("src/")) creatorSpecInvalid();
  if (spec.implementation.kind === "external-service" && normalizedEntry !== "handoff.md") creatorSpecInvalid();

  assertExactKeys(spec.integration, ["status", "requestedCapabilities", "requestedArtifactTypes", "minimumClientBuild"]);
  if (!["not-submitted", "submitted"].includes(spec.integration.status)) creatorSpecInvalid();
  assertStringArray(spec.integration.requestedCapabilities, { minimum: 1, maximum: 50, slug: true });
  assertStringArray(spec.integration.requestedArtifactTypes, { maximum: 30, slug: true });
  if (spec.integration.minimumClientBuild !== null && (!Number.isInteger(spec.integration.minimumClientBuild) || spec.integration.minimumClientBuild < 1)) creatorSpecInvalid();

  assertExactKeys(spec.verification, ["environment", "status", "evidence"]);
  if (!["not-run", "local-mock", "local-real"].includes(spec.verification.environment)) creatorSpecInvalid();
  if (!["not-run", "local-checked"].includes(spec.verification.status)) creatorSpecInvalid();
  assertStringArray(spec.verification.evidence, { maximum: 50 });
  if (
    spec.verification.status === "local-checked" &&
    (!["local-mock", "local-real"].includes(spec.verification.environment) || spec.verification.evidence.length === 0)
  ) creatorSpecInvalid();
  if (
    spec.verification.status === "not-run" &&
    (spec.verification.environment !== "not-run" || spec.verification.evidence.length !== 0)
  ) creatorSpecInvalid();

  const profiles = new Set(spec.agent.profiles);
  if (profiles.has("paid")) {
    if (spec.cost.mode === "free" || spec.cost.payer === "not-applicable" || spec.cost.budgetCny === null) creatorSpecInvalid();
  } else if (spec.cost.mode === "free" && (spec.cost.payer !== "not-applicable" || spec.cost.budgetCny !== null)) {
    creatorSpecInvalid();
  }
  if (profiles.has("sensitive-data")) {
    if (!spec.dataUse.consentRequired || !spec.dataUse.deletionSupported) creatorSpecInvalid();
  }
  if (profiles.has("high-risk-action") && spec.interaction.confirmBeforeActions.length === 0) creatorSpecInvalid();
  if (spec.interaction.runMode !== defaultRunMode(spec.agent.profiles)) creatorSpecInvalid();
}

function assertCases(value) {
  if (!isPlainObject(value) || value.schemaVersion !== KIT_VERSION || !Array.isArray(value.cases) || value.cases.length < 3 || value.cases.length > 200) {
    throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
  }
  const ids = new Set();
  for (const item of value.cases) {
    const required = ["id", "category", "fixtureClass", "inputSummary", "expectedBehavior", "status", "environment", "evidence"];
    if (!isPlainObject(item) || required.some((key) => !(key in item)) || Object.keys(item).some((key) => !required.includes(key))) {
      throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    }
    if (!isSlug(item.id) || ids.has(item.id)) throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    ids.add(item.id);
    if (!["normal", "empty", "invalid", "permission", "failure", "cost", "lifecycle", "security"].includes(item.category)) {
      throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    }
    if (!["synthetic", "authorized-non-sensitive"].includes(item.fixtureClass)) throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    if (!isNonEmptyString(item.inputSummary, 500) || !isNonEmptyString(item.expectedBehavior, 1000)) throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    if (!["not-run", "passed", "failed"].includes(item.status)) throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    if (!["not-run", "local-mock", "local-real", "platform-sandbox"].includes(item.environment)) throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    if (!Array.isArray(item.evidence) || item.evidence.length > 30 || item.evidence.some((entry) => !isNonEmptyString(entry, 500))) {
      throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    }
    if (item.status === "passed" && (item.environment === "not-run" || item.evidence.length === 0)) {
      throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    }
    if (item.status === "not-run" && (item.environment !== "not-run" || item.evidence.length !== 0)) {
      throw new CreatorKitError("test_cases_invalid", "tests/cases.json does not satisfy the public test contract.");
    }
  }
}

function isAllowedSubmissionPath(relativePath) {
  if (REQUIRED_FILES.includes(relativePath) || relativePath === "submission-manifest.json") return true;
  const segments = relativePath.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === ".." || segment.startsWith("."))) return false;
  if (!["src", "tests", "contracts", "evidence"].includes(segments[0])) return false;
  return TEXT_EXTENSIONS.has(path.extname(relativePath).toLowerCase());
}

async function collectFiles(packageDirectory, { includeManifest = true } = {}) {
  const root = path.resolve(packageDirectory);
  const rootStat = await fs.lstat(root).catch(() => null);
  if (!rootStat?.isDirectory()) throw new CreatorKitError("package_not_found", "The creator package directory does not exist.");
  const files = [];

  async function walk(directory, prefix = "") {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => compareCodeUnits(left.name, right.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = path.join(directory, entry.name);
      const stat = await fs.lstat(absolutePath);
      if (stat.isSymbolicLink()) throw new CreatorKitError("symlink_not_allowed", "Symbolic links are not allowed in a creator submission.");
      if (stat.isDirectory()) {
        if (entry.name.startsWith(".")) throw new CreatorKitError("submission_path_not_allowed", "The creator submission contains an unsupported path.");
        await walk(absolutePath, relativePath);
        continue;
      }
      if (!stat.isFile() || !isAllowedSubmissionPath(relativePath)) {
        throw new CreatorKitError("submission_path_not_allowed", "The creator submission contains an unsupported path.");
      }
      if (!includeManifest && relativePath === "submission-manifest.json") continue;
      if (stat.size > MAX_FILE_BYTES) throw new CreatorKitError("submission_file_too_large", "A creator submission file exceeds the size limit.");
      const buffer = await fs.readFile(absolutePath);
      let text;
      try {
        text = textDecoder.decode(buffer);
      } catch {
        throw new CreatorKitError("text_files_only", "Creator submissions may contain text files only.");
      }
      files.push({ relativePath, absolutePath, size: stat.size, buffer, text });
      if (files.length > MAX_FILES) throw new CreatorKitError("submission_too_many_files", "The creator submission contains too many files.");
    }
  }

  await walk(root);
  if (files.reduce((total, file) => total + file.size, 0) > MAX_PACKAGE_BYTES) {
    throw new CreatorKitError("submission_too_large", "The creator submission exceeds the total size limit.");
  }
  return files;
}

function containsSecretLikeMaterial(text) {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
    /\bAKIA[A-Z0-9]{16}\b/,
    /\b(?:sk|pk)-(?:live|test|prod)?[-_A-Za-z0-9]{16,}\b/,
    /(?:api[-_ ]?key|access[-_ ]?key|secret|token|password|credential)\s*[:=]\s*["']?[^\s"',]{8,}/i,
    /[?&](?:X-Amz-Signature|Signature)=[A-Za-z0-9%_-]{16,}/i,
  ];
  return patterns.some((pattern) => pattern.test(text));
}

async function parsePackageJson(files, relativePath, errorCode) {
  const file = files.find((entry) => entry.relativePath === relativePath);
  if (!file) throw new CreatorKitError("required_file_missing", "The creator submission is missing a required file.");
  try {
    return JSON.parse(file.text);
  } catch {
    throw new CreatorKitError(errorCode, "A creator submission JSON file is invalid.");
  }
}

export async function validateCreatorPackage(packageDirectory) {
  const files = await collectFiles(packageDirectory);
  const paths = new Set(files.map((file) => file.relativePath));
  for (const requiredPath of REQUIRED_FILES) {
    if (!paths.has(requiredPath)) throw new CreatorKitError("required_file_missing", "The creator submission is missing a required file.");
  }
  if (files.some((file) => containsSecretLikeMaterial(file.text))) {
    throw new CreatorKitError("secret_material_detected", "The creator submission contains secret-like material.");
  }
  const spec = await parsePackageJson(files, "creator-spec.json", "creator_spec_invalid");
  assertCreatorSpec(spec, paths);
  const cases = await parsePackageJson(files, "tests/cases.json", "test_cases_invalid");
  assertCases(cases);
  for (const contractPath of ["contracts/input.schema.json", "contracts/output.schema.json", "contracts/public-error.schema.json"]) {
    const contract = await parsePackageJson(files, contractPath, "contract_schema_invalid");
    if (!isPlainObject(contract) || contract.type !== "object" || !isPlainObject(contract.properties)) {
      throw new CreatorKitError("contract_schema_invalid", "A public contract schema is invalid.");
    }
  }
  return {
    command: "check",
    kitVersion: KIT_VERSION,
    agentKey: spec.agent.key,
    status: "valid-local-draft",
    providerCalls: 0,
    filesChecked: files.length,
    warnings: ["Local validation is not platform approval or runtime verification."],
  };
}

function defaultRunMode(profiles) {
  if (profiles.includes("event-driven")) return "event-driven";
  if (profiles.includes("asynchronous-generation")) return "asynchronous";
  if (profiles.includes("orchestrator")) return "orchestrated";
  return "synchronous";
}

function buildCreatorSpec({ key, name, creator, goal, profiles, payer, budgetCny }) {
  const runMode = defaultRunMode(profiles);
  const sensitive = profiles.includes("sensitive-data");
  const paid = profiles.includes("paid");
  const highRisk = profiles.includes("high-risk-action");
  return {
    $schema: "./contracts/creator-spec.schema.json",
    schemaVersion: KIT_VERSION,
    agent: {
      key,
      name,
      version: "0.1.0",
      description: `${name} creator draft.`,
      goal,
      nonGoals: ["Do not perform actions outside the confirmed goal."],
      profiles,
      status: "draft",
    },
    creator: { displayName: creator, team: null },
    interaction: {
      runMode,
      progress: runMode === "synchronous" ? "none" : "stage",
      confirmBeforeActions: highRisk ? ["Confirm immediately before the high-impact action."] : [],
    },
    dataUse: {
      inputClasses: sensitive ? ["private-user-input"] : ["user-provided-input"],
      externalRecipients: [],
      retentionDays: sensitive ? 30 : null,
      deletionSupported: sensitive,
      consentRequired: sensitive,
    },
    cost: {
      mode: paid ? "metered" : "free",
      payer: paid ? payer : "not-applicable",
      budgetCny: paid ? budgetCny : null,
      realProviderCallsApproved: false,
      retryOnUnknownBilling: false,
    },
    implementation: { kind: "instructions", entry: "instructions.md", testCommand: null },
    integration: {
      status: "not-submitted",
      requestedCapabilities: [`${key}-capability`],
      requestedArtifactTypes: profiles.includes("artifact-producing") ? ["private-output"] : [],
      minimumClientBuild: null,
    },
    verification: { environment: "not-run", status: "not-run", evidence: [] },
  };
}

const contractSchema = ({ title, properties = {}, required = [] }) => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title,
  type: "object",
  additionalProperties: false,
  required,
  properties,
});

export async function createCreatorPackage({
  outputDirectory,
  key,
  name,
  creator,
  goal,
  profiles = ["conversational"],
  payer,
  budgetCny,
}) {
  if (
    !isNonEmptyString(outputDirectory, 1000) ||
    outputDirectory.includes("\0") ||
    !isSlug(key) ||
    !isNonEmptyString(name, 80) ||
    !isNonEmptyString(creator, 120) ||
    !isNonEmptyString(goal, 500)
  ) {
    throw new CreatorKitError("init_arguments_invalid", "The init command requires a safe key, name, creator and goal.");
  }
  if (!Array.isArray(profiles) || profiles.length === 0 || new Set(profiles).size !== profiles.length || profiles.some((profile) => !SUPPORTED_PROFILES.includes(profile))) {
    throw new CreatorKitError("init_arguments_invalid", "The init command contains an unsupported Agent profile.");
  }
  if ([name, creator, goal].some((value) => containsSecretLikeMaterial(value))) {
    throw new CreatorKitError("secret_material_detected", "The creator submission contains secret-like material.");
  }
  if (profiles.includes("paid")) {
    if (!["creator", "user", "platform"].includes(payer) || typeof budgetCny !== "number" || !Number.isFinite(budgetCny) || budgetCny <= 0) {
      throw new CreatorKitError("paid_configuration_required", "A paid Agent requires an explicit payer and positive CNY budget before initialization.");
    }
  } else if (payer !== undefined || budgetCny !== undefined) {
    throw new CreatorKitError("init_arguments_invalid", "Payer and budget options require the paid profile.");
  }
  const target = path.resolve(outputDirectory);
  const existing = await fs.lstat(target).catch(() => null);
  if (existing) throw new CreatorKitError("output_exists", "The output directory already exists.");
  await fs.mkdir(path.join(target, "contracts"), { recursive: true });
  await fs.mkdir(path.join(target, "tests"), { recursive: true });
  await fs.mkdir(path.join(target, "evidence"), { recursive: true });
  const spec = buildCreatorSpec({ key, name, creator, goal, profiles, payer, budgetCny });
  const files = new Map([
    ["creator-spec.json", stableJson(spec)],
    ["README.md", `# ${name}\n\nStatus: local creator draft. This package is not approved, integrated or published.\n\nGoal: ${goal}\n\nRun the public creator-kit check, seal --attest-owner and verify commands before submission.\n`],
    ["instructions.md", `# Agent Instructions\n\nHelp the user achieve this confirmed goal: ${goal}\n\nStay within the declared input, permission, cost and action boundaries. Return no fabricated result when information is missing.\n`],
    ["handoff.md", "# Platform Handoff\n\n- Requested entry and result presentation: describe before submission.\n- Known limitations: local draft only.\n- Provider, data recipient and cost configuration: none enabled.\n- Runtime/API/App integration: not implemented and requires platform review.\n"],
    ["progress.md", "# Progress\n\n- Current stage: local draft\n- Actual verification: not run\n- Platform integration: not submitted\n- Next action: complete contracts, implementation and synthetic tests\n"],
    ["contracts/creator-spec.schema.json", await fs.readFile(creatorSpecSchemaPath, "utf8")],
    ["contracts/submission-manifest.schema.json", await fs.readFile(submissionManifestSchemaPath, "utf8")],
    ["contracts/input.schema.json", stableJson(contractSchema({
      title: `${name} input`,
      properties: { input: { type: "string", minLength: 1, maxLength: 10000 } },
      required: ["input"],
    }))],
    ["contracts/output.schema.json", stableJson(contractSchema({
      title: `${name} output`,
      properties: { result: { type: "string", maxLength: 50000 } },
      required: ["result"],
    }))],
    ["contracts/public-error.schema.json", stableJson(contractSchema({
      title: `${name} public error`,
      properties: {
        code: { type: "string", pattern: "^[a-z][a-z0-9_]*$" },
        message: { type: "string", minLength: 1, maxLength: 240 },
        retryable: { type: "boolean" },
      },
      required: ["code", "message", "retryable"],
    }))],
    ["tests/cases.json", stableJson({
      schemaVersion: KIT_VERSION,
      cases: [
        { id: "normal-input", category: "normal", fixtureClass: "synthetic", inputSummary: "A valid synthetic request", expectedBehavior: "Returns output that satisfies the declared output contract", status: "not-run", environment: "not-run", evidence: [] },
        { id: "empty-input", category: "empty", fixtureClass: "synthetic", inputSummary: "An empty request", expectedBehavior: "Returns a safe public input error without fabricating a result", status: "not-run", environment: "not-run", evidence: [] },
        { id: "permission-denied", category: "permission", fixtureClass: "synthetic", inputSummary: "A request without required permission", expectedBehavior: "Stops before side effects and returns a safe non-secret error", status: "not-run", environment: "not-run", evidence: [] },
      ],
    })],
  ]);
  for (const [relativePath, body] of files) {
    await fs.writeFile(path.join(target, relativePath), body, "utf8");
  }
  return validateCreatorPackage(target);
}

async function buildManifestFiles(packageDirectory) {
  const files = await collectFiles(packageDirectory, { includeManifest: false });
  return files.map((file) => ({ path: file.relativePath, size: file.size, sha256: sha256(file.buffer) }));
}

function digestManifestFiles(files) {
  return sha256(JSON.stringify(files));
}

export async function sealCreatorPackage(packageDirectory, { ownsOrMaySubmitContent = false } = {}) {
  if (ownsOrMaySubmitContent !== true) {
    throw new CreatorKitError("creator_attestation_required", "The creator must explicitly attest that the content may be submitted.");
  }
  const validation = await validateCreatorPackage(packageDirectory);
  const files = await buildManifestFiles(packageDirectory);
  const manifest = {
    $schema: "./contracts/submission-manifest.schema.json",
    schemaVersion: KIT_VERSION,
    kitVersion: KIT_VERSION,
    agentKey: validation.agentKey,
    creatorStatus: "sealed-for-submission",
    isApproval: false,
    files,
    packageDigest: digestManifestFiles(files),
    attestations: {
      ownsOrMaySubmitContent,
      containsNoCredentials: true,
      evidenceIsNotPlatformApproval: true,
    },
  };
  await fs.writeFile(path.join(path.resolve(packageDirectory), "submission-manifest.json"), stableJson(manifest), "utf8");
  return { command: "seal", status: "sealed-for-submission", providerCalls: 0, ...manifest };
}

export async function verifyCreatorPackage(packageDirectory) {
  const validation = await validateCreatorPackage(packageDirectory);
  const manifestPath = path.join(path.resolve(packageDirectory), "submission-manifest.json");
  const manifestText = await fs.readFile(manifestPath, "utf8").catch(() => null);
  if (manifestText === null) throw new CreatorKitError("submission_manifest_missing", "The creator package has not been sealed.");
  let manifest;
  try {
    manifest = JSON.parse(manifestText);
  } catch {
    throw new CreatorKitError("submission_manifest_invalid", "The submission manifest is invalid.");
  }
  const files = await buildManifestFiles(packageDirectory);
  const expectedDigest = digestManifestFiles(files);
  const manifestKeys = [
    "$schema",
    "schemaVersion",
    "kitVersion",
    "agentKey",
    "creatorStatus",
    "isApproval",
    "files",
    "packageDigest",
    "attestations",
  ];
  const attestationKeys = ["ownsOrMaySubmitContent", "containsNoCredentials", "evidenceIsNotPlatformApproval"];
  if (
    !isPlainObject(manifest) ||
    Object.keys(manifest).length !== manifestKeys.length ||
    manifestKeys.some((key) => !(key in manifest)) ||
    manifest.$schema !== "./contracts/submission-manifest.schema.json" ||
    manifest.schemaVersion !== KIT_VERSION ||
    manifest.kitVersion !== KIT_VERSION ||
    manifest.agentKey !== validation.agentKey ||
    manifest.creatorStatus !== "sealed-for-submission" ||
    manifest.isApproval !== false ||
    !isPlainObject(manifest.attestations) ||
    Object.keys(manifest.attestations).length !== attestationKeys.length ||
    attestationKeys.some((key) => manifest.attestations[key] !== true)
  ) {
    throw new CreatorKitError("submission_manifest_invalid", "The submission manifest is invalid.");
  }
  if (
    !Array.isArray(manifest.files) ||
    JSON.stringify(manifest.files) !== JSON.stringify(files) ||
    manifest.packageDigest !== expectedDigest
  ) {
    throw new CreatorKitError("package_digest_mismatch", "The sealed creator package does not match its manifest.");
  }
  return {
    command: "verify",
    status: "verified-creator-seal",
    agentKey: manifest.agentKey,
    packageDigest: expectedDigest,
    providerCalls: 0,
    isApproval: false,
  };
}

export async function createIntakeReceipt(packageDirectory) {
  const verification = await verifyCreatorPackage(packageDirectory);
  return {
    command: "intake",
    kitVersion: KIT_VERSION,
    agentKey: verification.agentKey,
    packageDigest: verification.packageDigest,
    status: "accepted-for-review",
    runtimeAvailability: "not-integrated",
    isApproval: false,
    providerCalls: 0,
    checks: ["structure", "contracts", "secret-scan", "creator-seal"],
    nextRequiredStages: ["platform-review", "capability-integration", "sandbox-verification", "release-approval"],
    warnings: ["This local receipt is not signed platform approval and does not make the Agent callable."],
  };
}
