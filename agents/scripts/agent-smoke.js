import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AgentCliError,
  assertNoSecretLikeOptions,
  assertOutputFormat,
  createCommandReport,
  executeCliCommand,
  findRepositoryRoot,
  isSafeAgentKey,
  isPlaceholderOwner,
  parseCliOptions,
} from "./lib/agent-cli.js";

const allowedEnvironments = new Set(["local", "sandbox", "staging"]);

const readJson = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return null;
  }
};

async function assertApprovedCalibration({ repoRoot, agentKey, accountRef }) {
  if (!accountRef || isPlaceholderOwner(accountRef)) {
    throw new AgentCliError("Paid calibration requires a named non-secret account reference.", {
      exitCode: 4,
      code: "calibration_account_required",
    });
  }
  const record = await readJson(
    path.join(repoRoot, "docs", "agents", agentKey, "calibration-record.json"),
  );
  if (
    !record ||
    record.purpose !== "paid-calibration" ||
    isPlaceholderOwner(record.approvedBy) ||
    typeof record.approvedAt !== "string" ||
    !Number.isInteger(record.maxProviderCalls) || record.maxProviderCalls < 1 ||
    !Number.isInteger(record.maxBudgetFen) || record.maxBudgetFen < 0
  ) {
    throw new AgentCliError("Paid calibration requires an approved calibration record with explicit limits.", {
      exitCode: 4,
      code: "calibration_approval_required",
    });
  }
  return record;
}

export async function smokeAgent({
  repoRoot,
  agentKey,
  environment = "local",
  accountRef = null,
  allowApprovedPaidCalibration = false,
}) {
  if (!isSafeAgentKey(agentKey)) {
    throw new AgentCliError("Agent key must be a lowercase slug.");
  }
  if (!allowedEnvironments.has(environment)) {
    throw new AgentCliError("Smoke environment must be local, sandbox, or staging.");
  }

  const agentDirectory = path.join(repoRoot, "agents", agentKey);
  const manifest = await readJson(path.join(agentDirectory, "manifest.json"));
  if (!manifest) {
    throw new AgentCliError("Agent Manifest is unavailable.", { code: "manifest_unavailable" });
  }
  const paid = manifest.profiles?.includes("paid");
  if (allowApprovedPaidCalibration && !paid) {
    throw new AgentCliError("Paid calibration is only valid for a paid Agent profile.");
  }

  const mode = allowApprovedPaidCalibration ? "paid-calibration" : "mock";
  const calibration = allowApprovedPaidCalibration
    ? await assertApprovedCalibration({ repoRoot, agentKey, accountRef })
    : null;
  let adapter;
  try {
    adapter = (await import(pathToFileURL(path.join(agentDirectory, "smoke.js")).href)).default;
  } catch {
    throw new AgentCliError("Smoke adapter is unavailable.", {
      exitCode: 3,
      code: "smoke_adapter_unavailable",
    });
  }
  if (!adapter || typeof adapter.run !== "function") {
    throw new AgentCliError("Smoke adapter is invalid.", {
      exitCode: 3,
      code: "smoke_adapter_invalid",
    });
  }

  const errors = [];
  let result;
  try {
    result = await adapter.run({
      mode,
      environment,
      accountRef,
      calibration: calibration
        ? { maxProviderCalls: calibration.maxProviderCalls, maxBudgetFen: calibration.maxBudgetFen }
        : null,
    });
  } catch {
    errors.push({ code: "smoke_failed", message: "Smoke adapter did not complete successfully." });
  }
  if (!errors.length && result?.status !== "passed") {
    errors.push({ code: "smoke_not_implemented", message: "Smoke adapter did not provide passing evidence." });
  }

  return createCommandReport({
    command: "agent:smoke",
    agentKey,
    status: errors.length ? "failed" : "passed",
    gates: [{
      id: "G5",
      status: errors.length ? "failed" : "passed",
      detail: errors.length ? "Smoke evidence is unavailable or failing." : "Smoke evidence passed.",
    }],
    evidence: errors.length ? [] : result.evidence || [],
    errors,
  });
}

export async function runAgentSmoke(argv = process.argv.slice(2), { repoRoot } = {}) {
  const options = parseCliOptions(argv, {
    valueOptions: ["agent", "environment", "account-ref", "format"],
    flagOptions: ["allow-approved-paid-calibration"],
  });
  assertNoSecretLikeOptions(options);
  assertOutputFormat(options.format);
  if (options._.length) throw new AgentCliError(`Unexpected argument: ${options._[0]}`);
  if (!options.agent) throw new AgentCliError("Option --agent is required.");
  return smokeAgent({
    repoRoot: repoRoot || await findRepositoryRoot(),
    agentKey: options.agent,
    environment: options.environment || "local",
    accountRef: options["account-ref"] || null,
    allowApprovedPaidCalibration: Boolean(options["allow-approved-paid-calibration"]),
  });
}

const isDirectExecution = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) executeCliCommand(runAgentSmoke);
