import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  AgentCliError,
  assertNoSecretLikeOptions,
  assertOutputFormat,
  assertPathInsideDirectory,
  createCommandReport,
  executeCliCommand,
  findRepositoryRoot,
  isSafeAgentKey,
  parseCliOptions,
} from "./lib/agent-cli.js";

const requiredGates = ["G1", "G2", "G3", "G4"];

const readJson = async (file) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    throw new AgentCliError(`Unable to read required JSON file: ${path.basename(file)}`, {
      code: "invalid_json_fixture",
    });
  }
};

const runNodeTests = ({ cwd, files }) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, ["--test", ...files], {
    cwd,
    stdio: "ignore",
  });
  child.once("error", reject);
  child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
});

const testPlanErrors = ({ testPlan, agentDirectory }) => {
  const errors = [];
  if (!Array.isArray(testPlan?.deterministicTests)) {
    return [{ code: "invalid_test_plan", message: "Test plan must declare deterministicTests." }];
  }
  if (!Array.isArray(testPlan.requiredGates)) {
    errors.push({ code: "invalid_test_plan", message: "Test plan must declare requiredGates." });
  }

  for (const testCase of testPlan.deterministicTests) {
    if (!testCase || typeof testCase.id !== "string" || typeof testCase.file !== "string") {
      errors.push({ code: "invalid_test_plan", message: "Each deterministic test requires id and file." });
      continue;
    }
    try {
      const file = path.resolve(agentDirectory, testCase.file);
      assertPathInsideDirectory(agentDirectory, file);
      if (!file.endsWith(".test.js")) {
        errors.push({ code: "invalid_test_plan", message: "Deterministic tests must use .test.js files." });
      }
    } catch (error) {
      errors.push({ code: error.code || "unsafe_test_path", message: "Test file path is unsafe." });
    }
  }
  return errors;
};

export async function runAgentTests({ repoRoot, agentKey, execute = runNodeTests }) {
  if (!isSafeAgentKey(agentKey)) {
    throw new AgentCliError("Agent key must be a lowercase slug.");
  }

  const agentDirectory = path.join(repoRoot, "agents", agentKey);
  const [manifest, testPlan] = await Promise.all([
    readJson(path.join(agentDirectory, "manifest.json")),
    readJson(path.join(agentDirectory, "test-plan.json")),
  ]);
  const errors = testPlanErrors({ testPlan, agentDirectory });
  const testDefinitions = testPlan.deterministicTests || [];

  if (!errors.length && testDefinitions.length === 0) {
    errors.push({
      code: "no_applicable_tests",
      message: "No deterministic Agent tests are declared; draft scaffolds are not a passing test result.",
    });
  }

  const expectedGates = new Set(testPlan.requiredGates || requiredGates);
  for (const gate of requiredGates) {
    if (!expectedGates.has(gate)) {
      errors.push({ code: "missing_required_gate", message: `Test plan is missing ${gate}.` });
    }
  }

  const files = [];
  if (!errors.length) {
    for (const testDefinition of testDefinitions) {
      const file = path.resolve(agentDirectory, testDefinition.file);
      try {
        assertPathInsideDirectory(agentDirectory, file);
        await fs.access(file);
        files.push(file);
      } catch {
        errors.push({ code: "missing_test_file", message: `A declared Agent test file is unavailable: ${testDefinition.id}.` });
      }
    }
  }

  if (!errors.length) {
    let result;
    try {
      result = await execute({ cwd: repoRoot, files });
    } catch {
      throw new AgentCliError("The local test runtime is unavailable.", {
        exitCode: 3,
        code: "test_runtime_unavailable",
      });
    }
    if (result.exitCode !== 0 || result.signal) {
      errors.push({ code: "agent_test_failed", message: "One or more deterministic Agent tests failed." });
    }
  }

  const gates = requiredGates.map((id) => ({
    id,
    status: errors.length ? "failed" : "passed",
    detail: errors.length ? "Deterministic test coverage is incomplete or failing." : "Deterministic test coverage passed.",
  }));
  if (manifest.lifecycle === "draft") {
    gates.push({
      id: "release",
      status: "not-applicable",
      detail: "Draft Agents cannot satisfy release test evidence.",
    });
  }

  return createCommandReport({
    command: "agent:test",
    agentKey,
    status: errors.length ? "failed" : "passed",
    gates,
    evidence: errors.length ? [] : files.map((file) => path.relative(repoRoot, file)),
    errors,
  });
}

export async function runAgentTest(argv = process.argv.slice(2), { repoRoot } = {}) {
  const options = parseCliOptions(argv, { valueOptions: ["agent", "format"] });
  assertNoSecretLikeOptions(options);
  assertOutputFormat(options.format);
  if (options._.length) throw new AgentCliError(`Unexpected argument: ${options._[0]}`);
  if (!options.agent) throw new AgentCliError("Option --agent is required.");
  return runAgentTests({
    repoRoot: repoRoot || await findRepositoryRoot(),
    agentKey: options.agent,
  });
}

const isDirectExecution = import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectExecution) executeCliCommand(runAgentTest);
