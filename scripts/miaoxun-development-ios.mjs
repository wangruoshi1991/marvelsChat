import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, open, readFile, readdir, readlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { productionApiOrigin, officialBundleId, repositoryRoot, simulatorId, sourceSnapshot, stateRoot } from "./miaoxun-development.mjs";

const apiOrigin = productionApiOrigin;

function command(program, args, optional = false) {
  const result = spawnSync(program, args, { cwd: repositoryRoot, encoding: "utf8" });
  if (result.error || result.status !== 0) {
    if (optional) return null;
    throw new Error(`${program} failed: ${result.error?.message || result.stderr?.trim() || result.stdout?.trim()}`);
  }
  return result.stdout.trim();
}

async function hashFile(file) { return createHash("sha256").update(await readFile(file)).digest("hex"); }
async function productManifest(directory, relative = "") {
  const files = [];
  for (const entry of (await readdir(path.join(directory, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) files.push(...await productManifest(directory, name));
    else if (entry.isSymbolicLink()) files.push({ path: name, symlink: await readlink(path.join(directory, name)) });
    else files.push({ path: name, sha256: await hashFile(path.join(directory, name)) });
  }
  return files;
}
async function runXcodebuild(args, buildLog) {
  const log = await open(buildLog, "a", 0o600);
  try {
    const child = spawn("xcodebuild", args, { cwd: path.join(repositoryRoot, "MiaoxunRN"), stdio: ["ignore", log.fd, log.fd] });
    const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
    if (code !== 0) throw new Error(`Simulator build failed (${code}); inspect ${buildLog}`);
  } finally { await log.close(); }
}

// The second argument injects host operations for isolated tests. The CLI uses
// these defaults exclusively; it offers no device, identity or origin override.
export async function runIOSBuild({ buildOnly = false } = {}, {
  executeCommand = command, runBuild = runXcodebuild, snapshot = sourceSnapshot,
  request = globalThis.fetch, root = stateRoot, report = console.log,
} = {}) {
  if (typeof buildOnly !== "boolean") throw new Error("buildOnly must be a boolean.");
  const derivedData = path.join(root, "DerivedData");
  const appPath = path.join(derivedData, "Build/Products/Debug-iphonesimulator/MiaoxunRN.app");
  const evidenceRoot = path.join(root, "builds", new Date().toISOString().replaceAll(/[:.]/g, "-"));
  const plist = key => executeCommand("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, path.join(appPath, "Info.plist")]);
  const officialContainer = (type, optional = false) => executeCommand("xcrun", ["simctl", "get_app_container", simulatorId, officialBundleId, type], optional);
  const officialIdentity = async () => {
    // Candidate-only mode must observe the existing product successfully. It
    // cannot treat a simctl failure as proof that no official app is installed.
    const app = officialContainer("app", !buildOnly);
    const data = officialContainer("data", !app);
    if (buildOnly && (!app || !data)) throw new Error("Cannot verify the existing official app without changing the Simulator.");
    return { app, data,
      // Read executable product metadata only, never account files or Keychain.
      infoSha256: app ? await hashFile(path.join(app, "Info.plist")) : null,
      jsSha256: app ? await hashFile(path.join(app, "main.jsbundle")) : null };
  };
  const source = await snapshot();
  const readyResponse = await request(`${apiOrigin}/api/ready`, { signal: AbortSignal.timeout(10000) });
  if (!readyResponse.ok || !(await readyResponse.json()).ok) throw new Error("The production API is not ready; the installed app was preserved.");
  const devices = JSON.parse(executeCommand("xcrun", ["simctl", "list", "devices", "available", "--json"]));
  const runtimeEntry = Object.entries(devices.devices).find(([, entries]) => entries.some((entry) => entry.udid === simulatorId));
  const device = runtimeEntry?.[1].find((entry) => entry.udid === simulatorId);
  if (!device || device.name !== "iPhone 17") throw new Error("The authorized existing iPhone 17 Simulator is unavailable.");
  const before = await officialIdentity();
  await mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  const buildLog = path.join(evidenceRoot, "xcodebuild.log");
  const evidence = { startedAt: new Date().toISOString(), mode: buildOnly ? "build-only" : "install", source,
    device: { name: device.name, udid: simulatorId, runtime: runtimeEntry[0], deviceType: device.deviceTypeIdentifier, stateBefore: device.state },
    configuration: "Debug", bundleId: officialBundleId, displayName: "妙讯", apiOrigin,
    appPath, installed: false, launched: false, officialBefore: before, buildLog };
  let failure;
  try {
    report(`Building 妙讯 for ${device.name} (${simulatorId}), using ${apiOrigin}. Mode: ${evidence.mode}. Log: ${buildLog}`);
    const args = ["-workspace", "ios/MiaoxunRN.xcworkspace", "-scheme", "MiaoxunRN", "-configuration", "Debug",
      "-destination", `id=${simulatorId}`, "-derivedDataPath", derivedData,
      `PRODUCT_BUNDLE_IDENTIFIER=${officialBundleId}`, "MIAOXUN_APP_DISPLAY_NAME=妙讯", `MIAOXUN_API_BASE_URL=${apiOrigin}`, "build"];
    await runBuild(args, buildLog);
    evidence.sourceAfter = await snapshot();
    if (evidence.sourceAfter.sha256 !== source.sha256) throw new Error("Checkout changed during build; preview was not installed. Freeze source and rebuild.");
    if (plist("CFBundleIdentifier") !== officialBundleId || plist("CFBundleDisplayName") !== "妙讯" || plist("MiaoxunAPIBaseURL") !== apiOrigin) {
      throw new Error("App identity/origin validation failed; the installed app was preserved.");
    }
    executeCommand("codesign", ["--verify", "--deep", "--strict", appPath]);
    const signing = executeCommand("codesign", ["-d", "--entitlements", ":-", appPath]);
    await writeFile(path.join(evidenceRoot, "entitlements.plist"), `${signing}\n`, { mode: 0o600 });
    const jsSha256 = await hashFile(path.join(appPath, "main.jsbundle"));
    const manifest = await productManifest(appPath);
    const productSha256 = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
    await writeFile(path.join(evidenceRoot, "product-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    Object.assign(evidence, { builtAt: new Date().toISOString(), version: plist("CFBundleShortVersionString"), build: plist("CFBundleVersion"),
      jsSha256, productSha256, infoSha256: await hashFile(path.join(appPath, "Info.plist")),
      executableSha256: await hashFile(path.join(appPath, plist("CFBundleExecutable"))),
      entitlementSha256: await hashFile(path.join(evidenceRoot, "entitlements.plist")), signingEntitlements: "entitlements.plist" });
    if (!buildOnly) {
      if (device.state !== "Booted") executeCommand("xcrun", ["simctl", "boot", simulatorId]);
      executeCommand("xcrun", ["simctl", "bootstatus", simulatorId, "-b"]);
      executeCommand("xcrun", ["simctl", "install", simulatorId, appPath]);
      evidence.installed = true;
      evidence.installedApp = officialContainer("app");
      evidence.installedData = officialContainer("data");
      if (await hashFile(path.join(evidence.installedApp, "main.jsbundle")) !== jsSha256) throw new Error("Installed product/container validation failed.");
      evidence.dataContainerRelocated = Boolean(before.data && before.data !== evidence.installedData);
      executeCommand("xcrun", ["simctl", "launch", simulatorId, officialBundleId]);
      evidence.launched = true;
      executeCommand("open", ["-a", "Simulator", "--args", "-CurrentDeviceUDID", simulatorId]);
    }
  } catch (error) { failure = error; }
  try {
    evidence.officialAfter = await officialIdentity();
    evidence.officialUnchanged = isDeepStrictEqual(before, evidence.officialAfter);
    if (buildOnly && !evidence.officialUnchanged) failure ||= new Error("The installed official app metadata changed during the candidate build; candidate verification failed.");
  } catch (error) {
    evidence.officialAfter = null;
    evidence.officialUnchanged = null;
    evidence.officialVerificationError = error.message;
    failure ||= error;
  }
  evidence.status = failure ? "failed" : buildOnly ? "built" : "installed";
  if (failure) evidence.error = failure.message;
  evidence.finishedAt = new Date().toISOString();
  await writeFile(path.join(evidenceRoot, "build.json"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
  if (failure) throw failure;
  report(`${buildOnly ? "妙讯 candidate built and verified; the installed app was preserved." : "妙讯 installed and launched using the production API."} Evidence: ${path.join(evidenceRoot, "build.json")}`);
  return { evidence, evidenceRoot };
}
