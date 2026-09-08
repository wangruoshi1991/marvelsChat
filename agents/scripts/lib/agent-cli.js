import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

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

export const PROFILE_REQUIREMENTS = Object.freeze({
  conversational: ["prompt-evaluation", "context-boundary", "permission-refusal"],
  "synchronous-tool": ["timeout", "idempotency", "side-effect-verification"],
  "asynchronous-generation": [
    "state-machine",
    "concurrent-claim",
    "checkpoint-restore",
    "resume",
    "cancel",
    "event-order",
    "progress-monotonicity",
  ],
  orchestrator: ["child-permissions", "loop-limit", "compensation", "call-tree-audit"],
  "event-driven": [
    "deduplication",
    "out-of-order",
    "replay",
    "checkpoint-restore",
    "pause",
    "dead-letter",
  ],
  "external-provider": ["provider-contract", "timeout", "safe-error-mapping", "calibration"],
  "artifact-producing": ["ownership", "format-validation", "viewer", "retention", "deletion"],
  paid: ["user-quota", "global-budget", "billing-disposition", "retry-safety", "circuit-breaker"],
  "sensitive-data": ["consent", "data-minimization", "redaction", "retention", "account-deletion"],
  "high-risk-action": [
    "second-confirmation",
    "human-or-admin-approval",
    "reversal-or-compensation",
  ],
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRootFromScript = path.resolve(scriptDirectory, "../../..");

export class AgentCliError extends Error {
  constructor(message, { exitCode = 2, code = "agent_cli_invalid" } = {}) {
    super(message);
    this.name = "AgentCliError";
    this.exitCode = exitCode;
    this.code = code;
  }
}

export const isSafeAgentKey = (value) =>
  typeof value === "string" && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value);

export const isPlaceholderOwner = (value) =>
  typeof value !== "string" || !value.trim() || /^role:/i.test(value.trim());

export function assertNamedOwners(owners) {
  const required = [
    "team",
    "agentOwner",
    "capabilityOwner",
    "clientOwner",
    "securityReviewer",
    "releaseOwner",
  ];
  for (const field of required) {
    if (isPlaceholderOwner(owners?.[field])) {
      throw new AgentCliError(`A named ${field} is required.`);
    }
  }
}

export function assertProfiles(profiles) {
  if (!Array.isArray(profiles) || profiles.length === 0) {
    throw new AgentCliError("At least one Agent profile is required.");
  }
  if (new Set(profiles).size !== profiles.length) {
    throw new AgentCliError("Agent profiles must be unique.");
  }
  for (const profile of profiles) {
    if (!SUPPORTED_PROFILES.includes(profile)) {
      throw new AgentCliError(`Unsupported Agent profile: ${profile}`);
    }
  }
}

export async function findRepositoryRoot(startDirectory = repoRootFromScript) {
  let current = path.resolve(startDirectory);
  while (true) {
    const [agentsPackageStat, agentsStat, sopStat] = await Promise.all([
      fs.stat(path.join(current, "agents", "package.json")).catch(() => null),
      fs.stat(path.join(current, "agents")).catch(() => null),
      fs.stat(path.join(current, "docs", "agent-sop")).catch(() => null),
    ]);
    if (agentsPackageStat?.isFile() && agentsStat?.isDirectory() && sopStat?.isDirectory()) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw new AgentCliError("Unable to find the repository root.", {
        exitCode: 3,
        code: "repository_root_not_found",
      });
    }
    current = parent;
  }
}

export function createCommandReport({
  command,
  agentKey = null,
  status = "passed",
  gates = [],
  evidence = [],
  warnings = [],
  errors = [],
}) {
  return {
    command,
    sopVersion: "0.2.0",
    agentKey,
    status,
    gates,
    evidence,
    warnings,
    errors,
  };
}

export const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

const secretLikeOptionPattern = /(?:api[-_]?key|token|password|secret|credential|access[-_]?key)/i;

export function assertNoSecretLikeArguments(argv) {
  for (const token of argv) {
    if (!token.startsWith("--")) continue;
    const option = token.slice(2).split("=", 1)[0];
    if (secretLikeOptionPattern.test(option)) {
      throw new AgentCliError(`Option --${option} is not allowed.`, {
        code: "secret_like_option",
      });
    }
  }
}

export function parseCliOptions(argv, { valueOptions = [], flagOptions = [] } = {}) {
  assertNoSecretLikeArguments(argv);
  const values = new Set(valueOptions);
  const flags = new Set(flagOptions);
  const result = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      result._.push(token);
      continue;
    }
    const option = token.slice(2);
    if (values.has(option)) {
      if (result[option] !== undefined) {
        throw new AgentCliError(`Option --${option} may only be provided once.`);
      }
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new AgentCliError(`Option --${option} requires a value.`);
      }
      result[option] = value;
      index += 1;
      continue;
    }
    if (flags.has(option)) {
      if (result[option] !== undefined) {
        throw new AgentCliError(`Option --${option} may only be provided once.`);
      }
      result[option] = true;
      continue;
    }
    throw new AgentCliError(`Unsupported option: --${option}`);
  }

  return result;
}

export function assertNoSecretLikeOptions(options) {
  for (const option of Object.keys(options)) {
    if (option !== "_" && secretLikeOptionPattern.test(option)) {
      throw new AgentCliError(`Option --${option} is not allowed.`, {
        code: "secret_like_option",
      });
    }
  }
}

export function assertOutputFormat(format) {
  if (format && !["text", "json"].includes(format)) {
    throw new AgentCliError("Option --format must be text or json.");
  }
}

export function formatCommandReport(report, format = "text") {
  assertOutputFormat(format);
  if (format === "json") return stableJson(report);

  const lines = [
    `${report.command}${report.agentKey ? ` (${report.agentKey})` : ""}: ${report.status}`,
  ];
  for (const gate of report.gates || []) {
    lines.push(`gate ${gate.id}: ${gate.status}${gate.detail ? ` - ${gate.detail}` : ""}`);
  }
  for (const evidence of report.evidence || []) lines.push(`evidence: ${evidence}`);
  for (const warning of report.warnings || []) {
    lines.push(`warning${warning.code ? ` [${warning.code}]` : ""}: ${warning.message || warning}`);
  }
  for (const error of report.errors || []) {
    lines.push(`error${error.code ? ` [${error.code}]` : ""}: ${error.message || error}`);
  }
  return `${lines.join("\n")}\n`;
}

export function reportExitCode(report) {
  return report.status === "passed" ? 0 : 1;
}

export function outputFormatFromArgv(argv) {
  const index = argv.indexOf("--format");
  if (index < 0) return "text";
  return argv[index + 1] || "text";
}

export async function executeCliCommand(run, argv = process.argv.slice(2)) {
  const format = outputFormatFromArgv(argv);
  try {
    const report = await run(argv);
    process.stdout.write(formatCommandReport(report, format));
    process.exitCode = reportExitCode(report);
  } catch (error) {
    const exitCode = error instanceof AgentCliError ? error.exitCode : 1;
    const message = error instanceof Error ? error.message : "Agent command failed.";
    process.stderr.write(`${message}\n`);
    process.exitCode = exitCode;
  }
}

export function assertPathInsideDirectory(directory, candidate) {
  const relative = path.relative(directory, candidate);
  if (relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))) {
    return;
  }
  throw new AgentCliError("Agent file path must remain inside the Agent package.");
}
