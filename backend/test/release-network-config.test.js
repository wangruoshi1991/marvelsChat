import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, copyFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { validateReleaseApiOrigin } from "../../scripts/validate-release-api-origin.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readRepoFile = (relativePath) => readFile(path.join(repoRoot, relativePath), "utf8");

test("iOS Release uses the approved IP HTTPS origin without HTTP ATS exceptions", async () => {
  const [project, infoPlist] = await Promise.all([
    readRepoFile("MiaoxunRN/ios/MiaoxunRN.xcodeproj/project.pbxproj"),
    readRepoFile("MiaoxunRN/ios/MiaoxunRN/Info.plist"),
  ]);

  assert.match(project, /MIAOXUN_API_BASE_URL = "https:\/\/8\.153\.167\.11";/);
  assert.equal((project.match(/CURRENT_PROJECT_VERSION = 51;/g) || []).length, 2);
  assert.doesNotMatch(project, /MIAOXUN_TEMP_IP_TESTFLIGHT|http:\/\/8\.153\.167\.11/);
  assert.doesNotMatch(infoPlist, /NSExceptionDomains|NSExceptionAllowsInsecureHTTPLoads/);
  assert.match(infoPlist, /<key>NSAllowsArbitraryLoads<\/key>\s*<false\/>/);
});

test("mobile Release builds invoke the shared origin validator", async () => {
  const [iosProject, androidBuild] = await Promise.all([
    readRepoFile("MiaoxunRN/ios/MiaoxunRN.xcodeproj/project.pbxproj"),
    readRepoFile("MiaoxunRN/android/app/build.gradle"),
  ]);

  assert.match(iosProject, /validate-ios-release-api-origin\.sh/);
  assert.match(androidBuild, /react\.nodeExecutableAndArgs\.get\(\)/);
  assert.match(androidBuild, /\.\.\/\.\.\/scripts\/validate-release-api-origin\.mjs/);
  assert.match(androidBuild, /environment\("MIAOXUN_API_BASE_URL",/);
  assert.match(androidBuild, /if \(requiresReleaseSigning\) \{\s*validateReleaseApiOrigin\(miaoxunApiBaseUrl\)/);
  assert.match(androidBuild, /MIAOXUN_VERSION_CODE must be a positive integer/);
  assert.match(androidBuild, /MIAOXUN_VERSION_CODE[^\n]*\?: "48"/);
  assert.match(androidBuild, /miaoxunVersionCode < 48/);
  assert.doesNotMatch(androidBuild, /MIAOXUN_VERSION_CODE[^\n]*\?:\s*"1"/);
});

test("Release origin validation accepts public IPv4, IPv6, and DNS origins", () => {
  for (const value of [
    "https://8.153.167.11", "https://8.153.167.11/", "https://api.marvelschat.com",
    "https://API.MARVELSCHAT.COM:443/", "https://api.marvelschat.com:8443",
    "https://api.marvelschat.com.", "https://xn--bcher-kva.de",
    "https://[2606:4700:4700::1111]", "https://[2606:4700:4700:0:0:0:0:1111]:8443",
  ]) {
    assert.equal(validateReleaseApiOrigin(value), new URL(value).origin, value);
  }
});

const rejectedOrigins = {
  "local and reserved IPv4": [
    "0.0.0.0", "0.1.2.3", "10.0.0.1", "100.64.0.1", "100.127.255.254",
    "127.0.0.1", "127.0.0.2", "127.255.255.254", "169.254.1.1", "172.16.0.1",
    "172.31.255.254", "192.0.0.1", "192.0.2.1", "192.88.99.1", "192.168.1.5",
    "198.18.0.1", "198.19.255.254", "198.51.100.1", "203.0.113.1", "224.0.0.1",
    "239.255.255.254", "240.0.0.1", "255.255.255.255",
  ].map((host) => `https://${host}`),
  "local and reserved IPv6 including mapped IPv4": [
    "::", "::1", "0:0:0:0:0:0:0:1", "fc00::1", "fd12::1", "fe80::1", "febf::1",
    "ff02::1", "::ffff:127.0.0.1", "::ffff:192.168.1.5", "::ffff:8.153.167.11",
    "0:0:0:0:0:ffff:7f00:1", "::127.0.0.1", "64:ff9b::7f00:1",
    "100::1", "2001::1", "2001:2::1", "2001:db8::1", "2002:7f00:1::1", "3fff::1",
  ].map((host) => `https://[${host}]`),
  "local and reserved hostnames": [
    "localhost", "localhost.", "api.localhost", "api.localhost.", "app.local",
    "app.internal", "app.lan", "app.home", "app.home.arpa", "app.test", "app.invalid",
    "app.example", "app.onion", "app.alt", "intranet",
  ].map((host) => `https://${host}`),
  "nonstandard IP and URL forms": [
    "https://127.1", "https://2130706433", "https://0x7f000001", "https://0177.0.0.1",
    "https://8.153.167.11.", "https://%31%32%37.0.0.1", "https:api.marvelschat.com",
    "https:/api.marvelschat.com", "https:///api.marvelschat.com", "https://api..marvelschat.com",
    "https://api_marvelschat.com", "https://-api.marvelschat.com", "https://api.marvelschat.com\\evil",
    " https://api.marvelschat.com", "https://api.marvelschat.com ", "https://api.\nmarvelschat.com",
    "https://api.marvelschat.com:", "https://api.marvelschat.com:0", "https://api.marvelschat.com:65536",
    "https://api.marvelschat.com:0443", "https://[fe80::1%25en0]",
  ],
  "credentials, non-HTTPS, and non-origin components": [
    "http://8.153.167.11", "ftp://api.marvelschat.com", "https://user:secret@api.marvelschat.com",
    "https://@api.marvelschat.com", "https://api.marvelschat.com/api", "https://api.marvelschat.com//",
    "https://api.marvelschat.com/.", "https://api.marvelschat.com?", "https://api.marvelschat.com#",
    "https://api.marvelschat.com/?token=secret", "https://api.marvelschat.com/#secret", "", null, undefined,
  ],
};

for (const [category, values] of Object.entries(rejectedOrigins)) {
  test(`Release origin validation rejects ${category}`, () => {
    for (const value of values) {
      assert.throws(() => validateReleaseApiOrigin(value), /^Error: Release API origin /, String(value));
    }
  });
}

test("Release origin CLI fails explicitly without echoing credentials", () => {
  const script = path.join(repoRoot, "scripts/validate-release-api-origin.mjs");
  const run = (value) => spawnSync(process.execPath, [script, "--env", "MIAOXUN_API_BASE_URL"], {
    env: { ...process.env, MIAOXUN_API_BASE_URL: value }, encoding: "utf8",
  });
  const accepted = run("https://8.153.167.11");
  assert.equal(accepted.status, 0, accepted.stderr);
  const rejected = run("https://private-user:private-password@api.marvelschat.com");
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /Release API origin/);
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /private-user|private-password|api\.marvelschat\.com/);
  assert.equal(run("").status, 1);
});

test("Release origin CLI also validates when invoked through a symbolic link", async () => {
  const fixture = await mkdtemp(path.join(tmpdir(), "miaoxun-origin-symlink-"));
  try {
    const link = path.join(fixture, "validator.mjs");
    await symlink(path.join(repoRoot, "scripts/validate-release-api-origin.mjs"), link);
    for (const args of [[link], ["--preserve-symlinks-main", link]]) {
      const result = spawnSync(process.execPath, args, {
        env: { ...process.env, MIAOXUN_API_BASE_URL: "https://127.0.0.2" }, encoding: "utf8",
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Release API origin/);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});

test("the actual Xcode shell phase enforces Release origins and preserves local Debug", async () => {
  const project = await readRepoFile("MiaoxunRN/ios/MiaoxunRN.xcodeproj/project.pbxproj");
  const shellPhases = [...project.matchAll(/shellScript = ("(?:\\.|[^"\\])*");/g)]
    .map((match) => JSON.parse(match[1]));
  const phase = shellPhases.find((source) => source.includes("validate-ios-release-api-origin.sh"));
  assert.ok(phase, "Xcode must invoke the shared Release validation entry point");
  const fixture = await mkdtemp(path.join(tmpdir(), "miaoxun-release-origin-"));
  try {
    const scripts = path.join(fixture, "scripts");
    const srcroot = path.join(fixture, "MiaoxunRN/ios");
    await mkdir(scripts, { recursive: true });
    await mkdir(srcroot, { recursive: true });
    for (const name of ["validate-release-api-origin.mjs", "validate-ios-release-api-origin.sh"]) {
      await copyFile(path.join(repoRoot, "scripts", name), path.join(scripts, name));
    }
    const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    await writeFile(path.join(srcroot, ".xcode.env"), `export NODE_BINARY=${shellQuote(process.execPath)}\n`);
    const run = (value, configuration = "Release") => spawnSync("/bin/sh", ["-c", phase], {
      env: { ...process.env, SRCROOT: srcroot, CONFIGURATION: configuration, MIAOXUN_API_BASE_URL: value },
      encoding: "utf8",
    });
    assert.equal(run("https://8.153.167.11").status, 0);
    for (const value of ["https://127.0.0.2", "https://[::1]", "https://192.168.1.5",
      "https://private-user:private-password@api.marvelschat.com"]) {
      const result = run(value);
      assert.notEqual(result.status, 0, value);
      assert.match(result.stderr, /Release API origin/);
      assert.doesNotMatch(result.stdout + result.stderr, /private-user|private-password/);
    }
    await writeFile(path.join(srcroot, ".xcode.env.local"), "export NODE_BINARY=/missing-node-binary\n");
    assert.notEqual(run("https://8.153.167.11").status, 0, "Invalid explicit Node configuration must fail");
    assert.equal(run("http://127.0.0.1:4390", "Debug").status, 0);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
