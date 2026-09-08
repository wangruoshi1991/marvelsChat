import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
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
  parseCliOptions,
  stableJson,
} from "./lib/agent-cli.js";
import { checkAgentPackage } from "./agent-check.js";
import { evaluateAgentSuite } from "./agent-eval.js";
import { runAgentTests } from "./agent-test.js";

const execFile = promisify(execFileCallback);
const allowedEnvironments = new Set(["sandbox", "staging"]);

const readJson = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new AgentCliError(`Unable to read required JSON file: ${path.basename(file)}`, {
      code: "invalid_json_fixture",
    });
  }
};

const defaultInspectGit = async (repoRoot) => {
  try {
    const [{ stdout: sha }, { stdout: status }] = await Promise.all([
      execFile("git", ["rev-parse", "HEAD"], { cwd: repoRoot }),
      execFile("git", ["status", "--porcelain"], { cwd: repoRoot }),
    ]);
    return { available: true, clean: status.trim() === "", sha: sha.trim() };
  } catch {
    return { available: false, clean: false, sha: null };
  }
};

const writeReleaseEvidence = async ({ repoRoot, agentKey, evidence }) => {
  const directory = path.join(repoRoot, "docs", "agents", agentKey, "release-evidence");
  await fs.mkdir(directory, { recursive: true });
  const digest = createHash("sha256").update(stableJson(evidence)).digest("hex");
  const filename = `${evidence.git.sha.slice(0, 12)}-${digest.slice(0, 12)}.json`;
  const file = path.join(directory, filename);
  await fs.writeFile(file, stableJson({ ...evidence, digest }), { flag: "wx" });
  return { file, digest };
};

export async function releaseAgent({
  repoRoot,
  agentKey,
  environment,
  inspectGit = defaultInspectGit,
  writeEvidence = writeReleaseEvidence,
}) {
  if (!isSafeAgentKey(agentKey)) {
    throw new AgentCliError("Agent key must be a lowercase slug.");
  }
  if (!allowedEnvironments.has(environment)) {
    throw new AgentCliError("Release evidence environment must be sandbox or staging.");
  }

  const git = await inspectGit(repoRoot);
  if (!git.available || !/^[a-f0-9]{40}$/i.test(git.sha || "")) {
    throw new AgentCliError("Git metadata is unavailable; release evidence cannot be formed.", {
      exitCode: 3,
      code: "git_unavailable",
    });
  }
  if (!git.clean) {
    return createCommandReport({
      command: "agent:release",
      agentKey,
      status: "failed",
      gates: [{ id: "G0", status: "failed", detail: "Release evidence requires a clean worktree." }],
      errors: [{ code: "dirty_worktree", message: "Release evidence cannot be created from a dirty worktree." }],
    });
  }

  const manifest = await readJson(path.join(repoRoot, "agents", agentKey, "manifest.json"));
  if (!new Set(["sandbox", "limited_release", "available"]).has(manifest.lifecycle)) {
    return createCommandReport({
      command: "agent:release",
      agentKey,
      status: "failed",
      gates: [{ id: "G0", status: "failed", detail: "Agent lifecycle is not eligible for release evidence." }],
      errors: [{ code: "release_lifecycle_ineligible", message: "Draft or review Agents cannot create release evidence." }],
    });
  }

  const [checkReport, testReport, evaluationReport] = await Promise.all([
    checkAgentPackage({ repoRoot, agentKey }),
    runAgentTests({ repoRoot, agentKey }),
    evaluateAgentSuite({ repoRoot, agentKey }),
  ]);
  const reports = [checkReport, testReport, evaluationReport];
  if (reports.some((report) => report.status !== "passed")) {
    return createCommandReport({
      command: "agent:release",
      agentKey,
      status: "failed",
      gates: [{ id: "G0-G7", status: "failed", detail: "Required local release evidence is incomplete." }],
      evidence: reports.map((report) => `${report.command}:${report.status}`),
      errors: [{ code: "release_evidence_incomplete", message: "Required check, test, or evaluation evidence did not pass." }],
    });
  }

  const evidence = {
    schemaVersion: "0.2",
    agentKey,
    environment,
    generatedAt: new Date().toISOString(),
    git: { sha: git.sha },
    reports: reports.map((report) => ({
      command: report.command,
      status: report.status,
      gates: report.gates,
      evidence: report.evidence,
    })),
  };
  const written = await writeEvidence({ repoRoot, agentKey, evidence });
  return createCommandReport({
    command: "agent:release",
    agentKey,
    status: "passed",
    gates: [{ id: "G0-G7", status: "passed", detail: "Release evidence was generated without deployment." }],
    evidence: [path.relative(repoRoot, written.file), `sha256:${written.digest}`],
  });
}

export async function runAgentRelease(argv = process.argv.slice(2), { repoRoot } = {}) {
  const options = parseCliOptions(argv, { valueOptions: ["agent", "environment", "format"] });
  assertNoSecretLikeOptions(options);
  assertOutputFormat(options.format);
  if (options._.length) throw new AgentCliError(`Unexpected argument: ${options._[0]}`);
  if (!options.agent) throw new AgentCliError("Option --agent is required.");
  if (!options.environment) throw new AgentCliError("Option --environment is required.");
  return releaseAgent({
    repoRoot: repoRoot || await findRepositoryRoot(),
    agentKey: options.agent,
    environment: options.environment,
  });
}

const isDirectExecution = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) executeCliCommand(runAgentRelease);
