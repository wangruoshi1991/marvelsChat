import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  CreatorKitError,
  SUPPORTED_PROFILES,
  createCreatorPackage,
  createIntakeReceipt,
  sealCreatorPackage,
  validateCreatorPackage,
  verifyCreatorPackage,
} from "../scripts/creator-kit-lib.mjs";

const execFileAsync = promisify(execFile);
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const skillRoot = path.resolve(testDirectory, "..");
const cliPath = path.join(skillRoot, "scripts", "creator-kit.mjs");

async function makeTemporaryDirectory(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createPackage(overrides = {}) {
  const root = await makeTemporaryDirectory("miaoxun-creator-package-");
  const packageDirectory = path.join(root, "meeting-actions");
  await createCreatorPackage({
    outputDirectory: packageDirectory,
    key: "meeting-actions",
    name: "会议行动项",
    creator: "示例创作者",
    goal: "从会议文字中提取原文明示的行动项",
    profiles: ["synchronous-tool"],
    ...overrides,
  });
  return { root, packageDirectory };
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const creatorSeal = (packageDirectory) => sealCreatorPackage(packageDirectory, {
  ownsOrMaySubmitContent: true,
});

test("public bundle is self-contained and uses one version without internal repository paths", async () => {
  const kit = await readJson(path.join(skillRoot, "kit.json"));
  assert.equal(kit.version, "0.1.0");
  const requiredFiles = [
    "SKILL.md",
    "references/SOP.md",
    "references/GUIDE.md",
    "references/INTEGRATION.md",
    "references/VALIDATION.md",
    "schemas/creator-spec.schema.json",
    "schemas/submission-manifest.schema.json",
    "schemas/test-cases.schema.json",
    "scripts/creator-kit.mjs",
    "scripts/creator-kit-lib.mjs",
  ];
  const forbiddenPaths = [
    ["/", "Users", "/"].join(""),
    ["docs", "/", "agent-sop"].join(""),
    ["agents", "/", "package.json"].join(""),
  ];
  const forbiddenNames = [
    ["G", "T", "L", "C"].join(""),
    ["S", "A", "P"].join(""),
    ["super", "powers"].join(""),
  ];
  for (const relativePath of requiredFiles) {
    const body = await fs.readFile(path.join(skillRoot, relativePath), "utf8");
    assert.ok(body.length > 0, `${relativePath} must not be empty`);
    for (const forbiddenPath of forbiddenPaths) assert.equal(body.includes(forbiddenPath), false);
    for (const forbiddenName of forbiddenNames) {
      assert.doesNotMatch(body, new RegExp(`\\b${forbiddenName}\\b`, "i"));
    }
    assert.doesNotMatch(body, /\.[a-z]*example\b/i);
  }
});

test("init rejects a missing output directory with a stable public error", async () => {
  await assert.rejects(
    createCreatorPackage({
      key: "missing-output",
      name: "Missing Output",
      creator: "Example Creator",
      goal: "Verify a missing output path fails safely",
      profiles: ["synchronous-tool"],
    }),
    (error) => error instanceof CreatorKitError && error.code === "init_arguments_invalid",
  );
});

test("init creates a valid solo-creator package with synthetic unrun cases", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const result = await validateCreatorPackage(packageDirectory);
  assert.equal(result.status, "valid-local-draft");
  assert.equal(result.providerCalls, 0);
  const spec = await readJson(path.join(packageDirectory, "creator-spec.json"));
  assert.equal(spec.creator.team, null);
  assert.equal(spec.integration.status, "not-submitted");
  assert.equal(spec.verification.status, "not-run");
  await fs.access(path.join(packageDirectory, "contracts", "submission-manifest.schema.json"));
  const cases = await readJson(path.join(packageDirectory, "tests", "cases.json"));
  assert.ok(cases.cases.length >= 3);
  assert.ok(cases.cases.every((item) => item.status === "not-run"));
  assert.ok(cases.cases.every((item) => item.fixtureClass === "synthetic"));
});

test("init rejects secret-like input before creating any file", async (t) => {
  const root = await makeTemporaryDirectory("miaoxun-creator-secret-init-");
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const packageDirectory = path.join(root, "unsafe-agent");
  const secret = ["sk", "live", "0123456789abcdefghijklmnop"].join("-");

  await assert.rejects(
    createCreatorPackage({
      outputDirectory: packageDirectory,
      key: "unsafe-agent",
      name: "Unsafe Agent",
      creator: "Example Creator",
      goal: `Use ${secret} to call a model`,
      profiles: ["external-provider"],
    }),
    (error) => error instanceof CreatorKitError && error.code === "secret_material_detected" && !error.message.includes(secret),
  );
  await assert.rejects(fs.stat(packageDirectory), { code: "ENOENT" });
});

test("paid profile requires an explicit payer and budget while keeping real calls disabled", async (t) => {
  const root = await makeTemporaryDirectory("miaoxun-creator-paid-init-");
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const missingConfiguration = path.join(root, "missing-cost");
  await assert.rejects(
    createCreatorPackage({
      outputDirectory: missingConfiguration,
      key: "paid-helper",
      name: "Paid Helper",
      creator: "Example Creator",
      goal: "Perform one confirmed metered operation",
      profiles: ["synchronous-tool", "paid"],
    }),
    (error) => error instanceof CreatorKitError && error.code === "paid_configuration_required",
  );
  await assert.rejects(fs.stat(missingConfiguration), { code: "ENOENT" });

  const configured = path.join(root, "configured-cost");
  await createCreatorPackage({
    outputDirectory: configured,
    key: "paid-helper",
    name: "Paid Helper",
    creator: "Example Creator",
    goal: "Perform one confirmed metered operation",
    profiles: ["synchronous-tool", "paid"],
    payer: "creator",
    budgetCny: 25,
  });
  const spec = await readJson(path.join(configured, "creator-spec.json"));
  assert.equal(spec.cost.payer, "creator");
  assert.equal(spec.cost.budgetCny, 25);
  assert.equal(spec.cost.realProviderCallsApproved, false);
  assert.equal(spec.cost.retryOnUnknownBilling, false);
});

test("every public profile and an additive multi-profile Agent can be initialized", async (t) => {
  const root = await makeTemporaryDirectory("miaoxun-creator-profile-matrix-");
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const profile of SUPPORTED_PROFILES) {
    const key = `profile-${profile}`;
    const paid = profile === "paid";
    const result = await createCreatorPackage({
      outputDirectory: path.join(root, key),
      key,
      name: `Profile ${profile}`,
      creator: "Example Creator",
      goal: `Exercise the ${profile} public creator profile`,
      profiles: [profile],
      ...(paid ? { payer: "creator", budgetCny: 10 } : {}),
    });
    assert.equal(result.status, "valid-local-draft");
  }

  const combined = await createCreatorPackage({
    outputDirectory: path.join(root, "combined-agent"),
    key: "combined-agent",
    name: "Combined Agent",
    creator: "Example Creator",
    goal: "Exercise additive profiles without weakening any declared control",
    profiles: ["event-driven", "asynchronous-generation", "orchestrator", "external-provider", "artifact-producing", "paid", "sensitive-data", "high-risk-action"],
    payer: "creator",
    budgetCny: 50,
  });
  assert.equal(combined.status, "valid-local-draft");
});

test("validation rejects missing contracts and never echoes private content", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.rm(path.join(packageDirectory, "contracts", "output.schema.json"));

  await assert.rejects(
    validateCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "required_file_missing" && !error.message.includes("会议"),
  );
});

test("validation rejects a passing test without an executed environment", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const casesPath = path.join(packageDirectory, "tests", "cases.json");
  const cases = await readJson(casesPath);
  cases.cases[0].status = "passed";
  cases.cases[0].evidence = ["Synthetic assertion output recorded locally."];
  await writeJson(casesPath, cases);

  await assert.rejects(
    validateCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "test_cases_invalid",
  );
});

test("validation rejects secret material without returning the secret", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const secret = ["sk", "live", "0123456789abcdefghijklmnop"].join("-");
  await fs.appendFile(path.join(packageDirectory, "handoff.md"), `\napiKey = ${secret}\n`, "utf8");

  await assert.rejects(
    validateCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "secret_material_detected" && !error.message.includes(secret),
  );
});

test("validation rejects symlinks that could escape the submission", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.symlink("/etc/hosts", path.join(packageDirectory, "evidence", "outside.txt"));

  await assert.rejects(
    validateCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "symlink_not_allowed",
  );
});

test("intake validates but never imports or executes creator source", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const marker = path.join(root, "creator-code-ran");
  await fs.mkdir(path.join(packageDirectory, "src"), { recursive: true });
  await fs.writeFile(
    path.join(packageDirectory, "src", "agent.mjs"),
    `import fs from "node:fs"; fs.writeFileSync(${JSON.stringify(marker)}, "unsafe");\n`,
    "utf8",
  );
  const specPath = path.join(packageDirectory, "creator-spec.json");
  const spec = await readJson(specPath);
  spec.implementation = { kind: "source", entry: "src/agent.mjs", testCommand: "node --test" };
  await writeJson(specPath, spec);

  await creatorSeal(packageDirectory);
  const receipt = await createIntakeReceipt(packageDirectory);
  assert.equal(receipt.status, "accepted-for-review");
  assert.equal(receipt.runtimeAvailability, "not-integrated");
  assert.equal(receipt.isApproval, false);
  await assert.rejects(fs.stat(marker), { code: "ENOENT" });
});

test("seal is deterministic for package content and verify detects tampering", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await creatorSeal(packageDirectory);
  const second = await creatorSeal(packageDirectory);
  assert.equal(first.packageDigest, second.packageDigest);
  const verified = await verifyCreatorPackage(packageDirectory);
  assert.equal(verified.packageDigest, first.packageDigest);

  await fs.appendFile(path.join(packageDirectory, "README.md"), "\nchanged\n", "utf8");
  await assert.rejects(
    verifyCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "package_digest_mismatch",
  );
});

test("verify rejects sealed-manifest identity or attestation tampering", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await creatorSeal(packageDirectory);
  const manifestPath = path.join(packageDirectory, "submission-manifest.json");
  const manifest = await readJson(manifestPath);

  manifest.agentKey = "different-agent";
  await writeJson(manifestPath, manifest);
  await assert.rejects(
    verifyCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "submission_manifest_invalid",
  );

  manifest.agentKey = "meeting-actions";
  manifest.attestations.ownsOrMaySubmitContent = false;
  await writeJson(manifestPath, manifest);
  await assert.rejects(
    verifyCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "submission_manifest_invalid",
  );
});

test("seal orders ASCII paths by stable code units", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(packageDirectory, "evidence", "B.txt"), "upper\n", "utf8");
  await fs.writeFile(path.join(packageDirectory, "evidence", "a.txt"), "lower\n", "utf8");

  const manifest = await creatorSeal(packageDirectory);
  const paths = manifest.files.map((file) => file.path);
  const expected = [...paths].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
  assert.deepEqual(paths, expected);
});

test("seal requires the creator to attest ownership explicitly", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await assert.rejects(
    sealCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "creator_attestation_required",
  );
  await assert.rejects(fs.stat(path.join(packageDirectory, "submission-manifest.json")), { code: "ENOENT" });
});

test("intake refuses an unsealed package and cannot declare publication", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await assert.rejects(
    createIntakeReceipt(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "submission_manifest_missing",
  );
});

test("invalid public state and unsupported profile fail closed", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const specPath = path.join(packageDirectory, "creator-spec.json");
  const spec = await readJson(specPath);
  spec.integration.status = "published";
  spec.agent.profiles.push("unrestricted-shell");
  await writeJson(specPath, spec);

  await assert.rejects(
    validateCreatorPackage(packageDirectory),
    (error) => error instanceof CreatorKitError && error.code === "creator_spec_invalid",
  );
});

test("copied kit runs outside a Git repository from init through intake", async (t) => {
  const root = await makeTemporaryDirectory("miaoxun-public-kit-e2e-");
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const copiedSkill = path.join(root, "miaoxun-agent-creator");
  const packageDirectory = path.join(root, "calendar-helper");
  await fs.cp(skillRoot, copiedSkill, { recursive: true });
  const copiedCli = path.join(copiedSkill, "scripts", "creator-kit.mjs");
  const commonOptions = { cwd: root, encoding: "utf8" };

  await execFileAsync(process.execPath, [
    copiedCli,
    "init",
    "--output",
    packageDirectory,
    "--key",
    "calendar-helper",
    "--name",
    "日程建议",
    "--creator",
    "独立创作者",
    "--goal",
    "根据用户主动提供的信息生成日程草稿",
    "--profiles",
    "conversational,synchronous-tool",
    "--format",
    "json",
  ], commonOptions);
  await execFileAsync(process.execPath, [copiedCli, "check", packageDirectory, "--format", "json"], commonOptions);
  await execFileAsync(process.execPath, [copiedCli, "seal", packageDirectory, "--attest-owner", "--format", "json"], commonOptions);
  await execFileAsync(process.execPath, [copiedCli, "verify", packageDirectory, "--format", "json"], commonOptions);
  const { stdout } = await execFileAsync(
    process.execPath,
    [copiedCli, "intake", packageDirectory, "--format", "json"],
    commonOptions,
  );
  const receipt = JSON.parse(stdout);
  assert.equal(receipt.status, "accepted-for-review");
  assert.equal(receipt.runtimeAvailability, "not-integrated");
  assert.equal(receipt.providerCalls, 0);
});

test("CLI rejects secret-like inline options without echoing their value", async (t) => {
  const { root, packageDirectory } = await createPackage();
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const secret = ["sk", "live", "0123456789abcdefghijklmnop"].join("-");
  await assert.rejects(
    execFileAsync(process.execPath, [cliPath, "check", packageDirectory, `--api-key=${secret}`, "--format", "json"], {
      encoding: "utf8",
    }),
    (error) => {
      assert.doesNotMatch(error.stderr, new RegExp(secret));
      const body = JSON.parse(error.stderr);
      assert.equal(body.code, "secret_option_not_allowed");
      return true;
    },
  );
});

test("bundled example is sealed, synthetic and explicitly not integrated", async () => {
  const exampleDirectory = path.join(skillRoot, "examples", "meeting-actions");
  const verified = await verifyCreatorPackage(exampleDirectory);
  const receipt = await createIntakeReceipt(exampleDirectory);
  const spec = await readJson(path.join(exampleDirectory, "creator-spec.json"));
  const cases = await readJson(path.join(exampleDirectory, "tests", "cases.json"));
  const publicSchema = await fs.readFile(path.join(skillRoot, "schemas", "creator-spec.schema.json"), "utf8");
  const exampleSchema = await fs.readFile(path.join(exampleDirectory, "contracts", "creator-spec.schema.json"), "utf8");

  assert.equal(verified.status, "verified-creator-seal");
  assert.equal(exampleSchema, publicSchema);
  assert.equal(spec.creator.team, null);
  assert.equal(spec.verification.status, "not-run");
  assert.ok(cases.cases.every((item) => item.fixtureClass === "synthetic"));
  assert.ok(cases.cases.every((item) => item.status === "not-run"));
  assert.equal(receipt.runtimeAvailability, "not-integrated");
  assert.equal(receipt.isApproval, false);
});
