import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { AgentCliError, findRepositoryRoot, formatCommandReport } from "../scripts/lib/agent-cli.js";
import { checkAgentPackage, runAgentCheck } from "../scripts/agent-check.js";
import { createAgentScaffold, runAgentNew } from "../scripts/agent-new.js";
import { evaluateAgentSuite, runAgentEval } from "../scripts/agent-eval.js";
import { releaseAgent, runAgentRelease } from "../scripts/agent-release.js";
import { smokeAgent, runAgentSmoke } from "../scripts/agent-smoke.js";
import { runAgentTest, runAgentTests } from "../scripts/agent-test.js";

const allProfiles = [
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
];

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const createFixtureRepository = async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "miaoxun-agent-cli-"));
  await Promise.all([
    fs.mkdir(path.join(root, "agents"), { recursive: true }),
    fs.mkdir(path.join(root, "backend", "database"), { recursive: true }),
    fs.cp(
      path.join(repositoryRoot, "docs", "agent-sop", "schemas"),
      path.join(root, "docs", "agent-sop", "schemas"),
      { recursive: true },
    ),
  ]);
  await fs.writeFile(path.join(root, "package.json"), '{"type":"module"}\n');
  return root;
};

const validOwners = {
  team: "miaoxun-platform",
  agentOwner: "user:agent-owner",
  capabilityOwner: "user:capability-owner",
  clientOwner: "user:client-owner",
  securityReviewer: "user:security-reviewer",
  releaseOwner: "user:release-owner",
};

const scaffoldInput = (overrides = {}) => ({
  key: "sample-agent",
  name: "Sample Agent",
  profiles: ["asynchronous-generation", "sensitive-data"],
  owners: validOwners,
  ...overrides,
});

test("agent:new creates a non-overwriting asynchronous Agent scaffold with named owners", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  const result = await createAgentScaffold({
    repoRoot: root,
    ...scaffoldInput(),
  });

  const agentDirectory = path.join(root, "agents", "sample-agent");
  const manifest = JSON.parse(
    await fs.readFile(path.join(agentDirectory, "manifest.json"), "utf8"),
  );
  const profileRequirements = JSON.parse(
    await fs.readFile(path.join(agentDirectory, "profile-requirements.json"), "utf8"),
  );

  assert.equal(result.agentKey, "sample-agent");
  assert.deepEqual(manifest.owner, validOwners);
  assert.equal(manifest.execution.mode, "asynchronous");
  assert.equal(manifest.execution.resumable, true);
  assert.equal(manifest.execution.checkpoint.stateSchema, "checkpoint.schema.json");
  assert.deepEqual(profileRequirements.profiles, [
    "asynchronous-generation",
    "sensitive-data",
  ]);
  await assert.doesNotReject(fs.access(path.join(agentDirectory, "checkpoint.schema.json")));
  await assert.doesNotReject(fs.access(path.join(agentDirectory, "agent-card.fixture.json")));
  await assert.doesNotReject(fs.access(path.join(agentDirectory, "runtime-status.fixture.json")));
  await assert.doesNotReject(fs.access(path.join(agentDirectory, "agent-event.fixture.json")));
  await assert.doesNotReject(fs.access(path.join(agentDirectory, "evaluation-suite.json")));
  await assert.doesNotReject(fs.access(path.join(agentDirectory, "tests", "agent-contract.test.js")));
  await assert.doesNotReject(fs.access(path.join(agentDirectory, "test-plan.json")));
});

test("agent:new refuses Agent keys already reserved by migration or route prefixes", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await fs.writeFile(
    path.join(root, "backend", "database", "015_sample-agent.sql"),
    "-- reserved migration prefix\n",
  );
  await assert.rejects(
    createAgentScaffold({ repoRoot: root, ...scaffoldInput() }),
    (error) => error instanceof AgentCliError && error.exitCode === 2,
  );

  await fs.rm(path.join(root, "backend", "database", "015_sample-agent.sql"));
  await fs.mkdir(path.join(root, "backend", "src", "routes"), { recursive: true });
  await fs.writeFile(
    path.join(root, "backend", "src", "routes", "sample-agent-routes.js"),
    'export const prefix = "/api/agents/sample-agent";\n',
  );
  await assert.rejects(
    createAgentScaffold({ repoRoot: root, ...scaffoldInput() }),
    (error) => error instanceof AgentCliError && error.exitCode === 2,
  );
});

test("agent:new rejects missing or placeholder owner assignments", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    createAgentScaffold({
      repoRoot: root,
      ...scaffoldInput({
        owners: { ...validOwners, securityReviewer: "role:security-reviewer" },
      }),
    }),
    (error) => error instanceof AgentCliError && error.exitCode === 2,
  );

  await assert.rejects(
    createAgentScaffold({
      repoRoot: root,
      ...scaffoldInput({
        owners: { ...validOwners, releaseOwner: "" },
      }),
    }),
    (error) => error instanceof AgentCliError && error.exitCode === 2,
  );
});

test("agent:new rejects an existing Agent path without modifying it", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  const agentDirectory = path.join(root, "agents", "sample-agent");
  await fs.mkdir(agentDirectory);
  const sentinelPath = path.join(agentDirectory, "sentinel.txt");
  await fs.writeFile(sentinelPath, "keep-me\n");

  await assert.rejects(
    createAgentScaffold({ repoRoot: root, ...scaffoldInput() }),
    (error) => error instanceof AgentCliError && error.exitCode === 2,
  );

  assert.equal(await fs.readFile(sentinelPath, "utf8"), "keep-me\n");
});

test("agent:new records requirements for every supported Agent profile", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  for (const profile of allProfiles) {
    const key = `profile-${profile}`;
    await createAgentScaffold({
      repoRoot: root,
      ...scaffoldInput({ key, profiles: [profile] }),
    });

    const agentDirectory = path.join(root, "agents", key);
    const profileRequirements = JSON.parse(
      await fs.readFile(path.join(agentDirectory, "profile-requirements.json"), "utf8"),
    );

    assert.deepEqual(profileRequirements.profiles, [profile]);
    assert.ok(profileRequirements.requirements[profile].length > 0);
    if (["asynchronous-generation", "event-driven"].includes(profile)) {
      await assert.doesNotReject(fs.access(path.join(agentDirectory, "checkpoint.schema.json")));
    }
  }
});

test("agent:new emits a schema-valid draft package for each supported Agent profile", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  for (const profile of allProfiles) {
    const key = `valid-${profile}`;
    await createAgentScaffold({
      repoRoot: root,
      ...scaffoldInput({ key, profiles: [profile] }),
    });
    const report = await checkAgentPackage({ repoRoot: root, agentKey: key });
    assert.equal(report.status, "passed", `${profile}: ${JSON.stringify(report.errors)}`);
  }
});

test("agent:check accepts a complete draft scaffold and marks later gates inapplicable", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await createAgentScaffold({ repoRoot: root, ...scaffoldInput() });
  const report = await checkAgentPackage({ repoRoot: root, agentKey: "sample-agent" });

  assert.equal(report.status, "passed");
  assert.equal(report.command, "agent:check");
  assert.ok(report.gates.some((gate) => gate.id === "S0-S2" && gate.status === "passed"));
  assert.ok(report.gates.some((gate) => gate.id === "S3+" && gate.status === "not-applicable"));
});

test("agent:check rejects a provider field in an AgentCard", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await createAgentScaffold({ repoRoot: root, ...scaffoldInput() });
  const cardPath = path.join(root, "agents", "sample-agent", "agent-card.fixture.json");
  const card = JSON.parse(await fs.readFile(cardPath, "utf8"));
  card.provider = "forbidden-provider";
  await fs.writeFile(cardPath, `${JSON.stringify(card, null, 2)}\n`);

  const report = await checkAgentPackage({ repoRoot: root, agentKey: "sample-agent" });

  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((error) => error.code === "forbidden_field"));
});

test("agent:check rejects another registry definition with the same identity", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await createAgentScaffold({ repoRoot: root, ...scaffoldInput() });
  const agent = await fs.readFile(path.join(root, "agents", "sample-agent.agent.js"), "utf8");
  await fs.writeFile(
    path.join(root, "agents", "duplicate-agent.agent.js"),
    agent.replaceAll("sample-agent", "duplicate-agent").replaceAll("Sample Agent", "Duplicate Agent"),
  );

  const report = await checkAgentPackage({ repoRoot: root, agentKey: "sample-agent" });

  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((error) => error.code === "identity_not_unique"));
});

test("agent:check requires implementation references after a draft enters sandbox", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await createAgentScaffold({ repoRoot: root, ...scaffoldInput() });
  const agentDirectory = path.join(root, "agents", "sample-agent");
  const manifestPath = path.join(agentDirectory, "manifest.json");
  const runtimePath = path.join(agentDirectory, "runtime-status.fixture.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  const runtime = JSON.parse(await fs.readFile(runtimePath, "utf8"));
  manifest.lifecycle = "sandbox";
  runtime.lifecycle = "sandbox";
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`);

  const report = await checkAgentPackage({ repoRoot: root, agentKey: "sample-agent" });

  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((error) => error.code === "missing_migration_reference"));
  assert.ok(report.errors.some((error) => error.code === "missing_route_reference"));
  assert.ok(report.errors.some((error) => error.code === "missing_audit_test_reference"));
  assert.ok(report.gates.some((gate) => gate.id === "S3+" && gate.status === "failed"));
});

test("agent:test and agent:eval fail a draft scaffold instead of treating skipped work as passed", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await createAgentScaffold({ repoRoot: root, ...scaffoldInput() });

  const testReport = await runAgentTests({ repoRoot: root, agentKey: "sample-agent" });
  const evaluationReport = await evaluateAgentSuite({ repoRoot: root, agentKey: "sample-agent" });

  assert.equal(testReport.status, "failed");
  assert.ok(testReport.errors.some((error) => error.code === "no_applicable_tests"));
  assert.equal(evaluationReport.status, "failed");
  assert.ok(evaluationReport.errors.some((error) => error.code === "evaluation_not_implemented"));
});

test("agent:smoke blocks unsafe environments and paid calibration without approval", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await createAgentScaffold({ repoRoot: root, ...scaffoldInput({ profiles: ["paid"] }) });

  await assert.rejects(
    smokeAgent({ repoRoot: root, agentKey: "sample-agent", environment: "production" }),
    (error) => error instanceof AgentCliError && error.exitCode === 2,
  );
  await assert.rejects(
    smokeAgent({
      repoRoot: root,
      agentKey: "sample-agent",
      environment: "sandbox",
      allowApprovedPaidCalibration: true,
    }),
    (error) => error instanceof AgentCliError && error.exitCode === 4,
  );
});

test("agent:release rejects a dirty worktree before creating release evidence", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));

  await createAgentScaffold({ repoRoot: root, ...scaffoldInput() });
  const report = await releaseAgent({
    repoRoot: root,
    agentKey: "sample-agent",
    environment: "staging",
    inspectGit: async () => ({ available: true, clean: false, sha: "a".repeat(40) }),
  });

  assert.equal(report.status, "failed");
  assert.ok(report.errors.some((error) => error.code === "dirty_worktree"));
  await assert.rejects(fs.access(path.join(root, "docs", "agents", "sample-agent", "release-evidence")));
});

test("all Agent commands reject secret-like arguments without echoing the supplied value", async (t) => {
  const root = await createFixtureRepository();
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  const secret = "never-echo-this-value";
  const commands = [
    runAgentNew,
    runAgentCheck,
    runAgentTest,
    runAgentEval,
    runAgentSmoke,
    runAgentRelease,
  ];

  for (const command of commands) {
    await assert.rejects(
      command(["--api-key", secret], { repoRoot: root }),
      (error) =>
        error instanceof AgentCliError &&
        error.exitCode === 2 &&
        !error.message.includes(secret),
    );
  }
});

test("command reports support text and JSON output without leaking command input", () => {
  const report = {
    command: "agent:check",
    sopVersion: "0.2.0",
    agentKey: "sample-agent",
    status: "failed",
    gates: [{ id: "S0-S2", status: "failed", detail: "Contract validation failed." }],
    evidence: [],
    warnings: [],
    errors: [{ code: "schema_invalid", message: "Fixture is invalid." }],
  };

  assert.deepEqual(JSON.parse(formatCommandReport(report, "json")), report);
  assert.match(formatCommandReport(report), /agent:check \(sample-agent\): failed/);
  assert.match(formatCommandReport(report), /error \[schema_invalid\]: Fixture is invalid\./);
});

test("repository discovery uses the Agent package and SOP markers instead of a root package file", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "miaoxun-agent-root-"));
  t.after(async () => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, "agents", "scripts"), { recursive: true });
  await fs.mkdir(path.join(root, "docs", "agent-sop"), { recursive: true });
  await fs.writeFile(path.join(root, "agents", "package.json"), "{}\n");

  assert.equal(await findRepositoryRoot(path.join(root, "agents", "scripts")), root);
});
