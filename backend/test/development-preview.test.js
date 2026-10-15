import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { cpSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { developmentEnvironment, disableDevelopmentFetch, officialBundleId, parseDevelopmentArguments, productionApiOrigin, repositoryRoot, runDevelopmentRuntime, simulatorId } from "../../scripts/miaoxun-development.mjs";
import { runIOSBuild } from "../../scripts/miaoxun-development-ios.mjs";

test("development subprocesses exclude inherited provider credentials and preload hooks", () => {
  const env = developmentEnvironment({ HOME: "/test-home", PATH: "/test-path", NEW_API_KEY: "private-key", DATABASE_URL: "private-database", NODE_OPTIONS: "--require private-hook", POSTGRES_PASSWORD: "private-password", OTHER_SECRET: "secret" }, "/private/development");
  assert.equal(env.HOME, "/test-home");
  assert.equal(env.MIAOXUN_DOTENV_ENABLED, "false");
  assert.equal(env.NEW_API_KEY, "");
  assert.equal(env.DATABASE_URL, "");
  assert.equal(env.POSTGRES_PASSWORD, "");
  assert.equal(env.NODE_OPTIONS, undefined);
  assert.equal(env.OTHER_SECRET, undefined);
  assert.equal(env.MIAOXUN_LOCAL_MEDIA_ROOT, "/private/development/media");
  assert.equal(env.POSTGRES_DATABASE, "miaoxun_development");
});

test("isolated runtime denies an outbound request before any network operation", async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error("should not be called"); };
  try {
    disableDevelopmentFetch();
    await assert.rejects(fetch("https://provider.invalid/private"), { code: "DEVELOPMENT_PROVIDER_CALLS_DISABLED" });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test("the development launcher explicitly starts the imported AI worker with outbound requests already blocked", async () => {
  const previous = globalThis.fetch;
  let started = 0;
  try {
    await runDevelopmentRuntime("worker", { loadModule: async specifier => {
      assert.equal(specifier, path.join(repositoryRoot, "backend/src/ai-task-worker.js"));
      await assert.rejects(fetch("https://provider.invalid/private"), { code: "DEVELOPMENT_PROVIDER_CALLS_DISABLED" });
      return { startAITaskWorker: async () => { started++; } };
    } });
    assert.equal(started, 1);
    await runDevelopmentRuntime("api", { loadModule: async specifier => {
      assert.equal(specifier, path.join(repositoryRoot, "backend/src/server.js"));
      return { startAITaskWorker: () => { throw new Error("API must not start a second worker"); } };
    } });
  } finally { globalThis.fetch = previous; }
});

function configProbe(dotenvEnabled) {
  const configUrl = pathToFileURL(path.join(repositoryRoot, "backend/src/config.js")).href;
  const storageUrl = pathToFileURL(path.join(repositoryRoot, "backend/src/local-media-storage.js")).href;
  const source = `import dotenv from 'dotenv';
    let loaded = false;
    dotenv.config = () => { loaded = true; process.env.NEW_API_KEY = 'test-file-value'; return {}; };
    const { config } = await import(${JSON.stringify(configUrl)});
    const { localMediaPathForObjectKey } = await import(${JSON.stringify(storageUrl)});
    console.log(JSON.stringify({ loaded, providerConfigured: Boolean(config.newApi.apiKey), root: localMediaPathForObjectKey('owner/file.txt') }));`;
  const env = developmentEnvironment(process.env, "/private/development");
  if (dotenvEnabled) delete env.MIAOXUN_DOTENV_ENABLED;
  const result = spawnSync(process.execPath, ["--input-type=module", "--eval", source], { cwd: path.join(repositoryRoot, "backend"), env, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("development configuration skips checkout dotenv and isolates local media files", () => {
  assert.deepEqual(configProbe(false), { loaded: false, providerConfigured: false, root: "/private/development/media/owner/file.txt" });
});

test("normal runtime retains its existing dotenv loading behavior", () => {
  assert.equal(configProbe(true).loaded, true);
  assert.equal(configProbe(true).providerConfigured, true);
});

test("the official launcher accepts build-only exclusively for ios and rejects unknown or repeated arguments", () => {
  assert.deepEqual(parseDevelopmentArguments(["ios"]), { action: "ios", buildOnly: false });
  assert.deepEqual(parseDevelopmentArguments(["ios", "--build-only"]), { action: "ios", buildOnly: true });
  assert.deepEqual(parseDevelopmentArguments(["status"]), { action: "status" });
  for (const args of [[], ["ios", "--preview"], ["ios", "--build-only", "--build-only"], ["ios", "--build-only=true"],
    ["status", "--build-only"], ["verify-local-start", "ignored"], ["stop", "--unknown"], ["--build-only", "ios"]]) {
    assert.throws(() => parseDevelopmentArguments(args), /Usage:/);
  }
  const rejected = spawnSync(process.execPath, [path.join(repositoryRoot, "scripts/miaoxun-development.mjs"), "ios", "--unknown"], { encoding: "utf8" });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /ios \[--build-only\]/);
});

async function iosBuildFixture(t, { deviceState = "Shutdown", failure, mutateOfficial = false, changeSource = false, invalidOrigin = false, unavailableOfficial = false, invalidSignature = false } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "miaoxun-build-only-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const originalApp = path.join(root, "existing-official.app");
  let installedApp = originalApp;
  const data = path.join(root, "existing-data");
  await mkdir(originalApp);
  await writeFile(path.join(originalApp, "Info.plist"), "existing-info");
  await writeFile(path.join(originalApp, "main.jsbundle"), "existing-js");
  const commands = [];
  const builds = [];
  let snapshots = 0;
  const dependencies = {
    root, report: () => {},
    snapshot: async () => ({ commit: "fixture-commit", branch: "codex/fixture", dirty: true, sha256: changeSource && snapshots++ ? "changed" : "frozen" }),
    request: async url => { assert.equal(url, `${productionApiOrigin}/api/ready`); return { ok: true, json: async () => ({ ok: true }) }; },
    executeCommand: (program, args, optional = false) => {
      commands.push({ program, args, optional });
      if (program === "xcrun" && args[1] === "list") return JSON.stringify({ devices: { "iOS-test": [{ udid: simulatorId, name: "iPhone 17", state: deviceState, deviceTypeIdentifier: "iPhone-17" }] } });
      if (program === "xcrun" && args[1] === "get_app_container") {
        assert.equal(args[2], simulatorId);
        assert.equal(args[3], officialBundleId);
        if (unavailableOfficial) { assert.equal(optional, false); throw new Error("Cannot read installed app"); }
        return args[4] === "app" ? installedApp : data;
      }
      if (program === "/usr/libexec/PlistBuddy") return ({
        CFBundleIdentifier: officialBundleId, CFBundleDisplayName: "妙讯", MiaoxunAPIBaseURL: invalidOrigin ? "https://wrong.invalid" : productionApiOrigin,
        CFBundleShortVersionString: "1.0", CFBundleVersion: "46", CFBundleExecutable: "MiaoxunRN",
      })[args[1].slice("Print :".length)];
      if (program === "codesign") {
        if (invalidSignature && args[0] === "--verify") throw new Error("fixture signature failed");
        return args[0] === "--verify" ? "" : "<plist>fixture-entitlements</plist>";
      }
      if (program === "xcrun" && args[1] === "install") {
        installedApp = path.join(root, "updated-official.app");
        cpSync(args[3], installedApp, { recursive: true });
        return "";
      }
      if ((program === "xcrun" && ["boot", "bootstatus", "launch"].includes(args[1])) || program === "open") return "";
      throw new Error(`Unexpected command: ${program} ${args.join(" ")}`);
    },
    runBuild: async (args, buildLog) => {
      builds.push(args);
      await writeFile(buildLog, "isolated build fixture");
      if (failure) throw new Error(failure);
      const product = path.join(root, "DerivedData/Build/Products/Debug-iphonesimulator/MiaoxunRN.app");
      await mkdir(product, { recursive: true });
      for (const [file, body] of Object.entries({ "Info.plist": "candidate-info", "main.jsbundle": "candidate-js", MiaoxunRN: "candidate-executable" })) await writeFile(path.join(product, file), body);
      if (mutateOfficial) await writeFile(path.join(originalApp, "Info.plist"), "unexpected-external-update");
    },
  };
  const evidence = async () => {
    const dirs = await readdir(path.join(root, "builds"));
    assert.equal(dirs.length, 1);
    return JSON.parse(await readFile(path.join(root, "builds", dirs[0], "build.json"), "utf8"));
  };
  const mutations = () => commands.filter(({ program, args }) => program === "open" || (program === "xcrun" && ["boot", "bootstatus", "install", "launch"].includes(args[1])));
  return { dependencies, builds, commands, evidence, mutations };
}

for (const deviceState of ["Shutdown", "Booted"]) {
  test(`build-only verifies and records the candidate without changing a ${deviceState} official simulator app`, async t => {
    const fixture = await iosBuildFixture(t, { deviceState });
    const { evidence, evidenceRoot } = await runIOSBuild({ buildOnly: true }, fixture.dependencies);
    assert.equal(evidence.mode, "build-only");
    assert.equal(evidence.status, "built");
    assert.equal(evidence.installed, false);
    assert.equal(evidence.launched, false);
    assert.equal(evidence.officialUnchanged, true);
    assert.deepEqual(evidence.officialBefore, evidence.officialAfter);
    assert.deepEqual(evidence.source, evidence.sourceAfter);
    for (const key of ["jsSha256", "infoSha256", "productSha256", "executableSha256", "entitlementSha256"]) assert.match(evidence[key], /^[a-f0-9]{64}$/);
    assert.deepEqual(fixture.mutations(), []);
    assert.equal(fixture.builds.length, 1);
    const args = fixture.builds[0];
    assert.equal(args[args.indexOf("-destination") + 1], `id=${simulatorId}`);
    assert.equal(args[args.indexOf("-derivedDataPath") + 1], path.join(fixture.dependencies.root, "DerivedData"));
    assert.ok(args.includes(`PRODUCT_BUNDLE_IDENTIFIER=${officialBundleId}`));
    assert.ok(args.includes(`MIAOXUN_API_BASE_URL=${productionApiOrigin}`));
    assert.equal(args.at(-1), "build");
    assert.ok(fixture.commands.some(({ program, args: commandArgs }) => program === "codesign" && commandArgs.includes("--strict")));
    assert.deepEqual(await fixture.evidence(), evidence);
    assert.equal(JSON.parse(await readFile(path.join(evidenceRoot, "product-manifest.json"), "utf8")).length, 3);
  });
}

for (const [label, options, expectedError] of [
  ["failed build", { failure: "fixture build failed" }, /fixture build failed/],
  ["changed checkout", { changeSource: true }, /Checkout changed/],
  ["wrong origin", { invalidOrigin: true }, /identity\/origin validation failed/],
  ["invalid signature", { invalidSignature: true }, /fixture signature failed/],
  ["changed installed metadata", { mutateOfficial: true }, /installed official app metadata changed/],
]) {
  test(`build-only records ${label} as failure and never installs or launches`, async t => {
    const fixture = await iosBuildFixture(t, options);
    await assert.rejects(runIOSBuild({ buildOnly: true }, fixture.dependencies), expectedError);
    const evidence = await fixture.evidence();
    assert.equal(evidence.status, "failed");
    assert.match(evidence.error, expectedError);
    assert.equal(evidence.officialUnchanged, !options.mutateOfficial);
    assert.equal(evidence.installed, false);
    assert.equal(evidence.launched, false);
    assert.deepEqual(fixture.mutations(), []);
  });
}

test("build-only refuses to infer an absent official app when its identity cannot be read", async t => {
  const fixture = await iosBuildFixture(t, { unavailableOfficial: true });
  await assert.rejects(runIOSBuild({ buildOnly: true }, fixture.dependencies), /Cannot read installed app/);
  assert.equal(fixture.builds.length, 0);
  assert.deepEqual(fixture.mutations(), []);
});

test("the ordinary ios build still updates the same official app and launches the fixed simulator", async t => {
  const fixture = await iosBuildFixture(t);
  const { evidence } = await runIOSBuild({}, fixture.dependencies);
  assert.equal(evidence.mode, "install");
  assert.equal(evidence.status, "installed");
  assert.equal(evidence.installed, true);
  assert.equal(evidence.launched, true);
  assert.equal(evidence.officialAfter.jsSha256, evidence.jsSha256);
  assert.equal(evidence.officialBefore.data, evidence.officialAfter.data);
  assert.deepEqual(fixture.mutations().map(({ program, args }) => program === "open" ? "open" : args[1]), ["boot", "bootstatus", "install", "launch", "open"]);
});
