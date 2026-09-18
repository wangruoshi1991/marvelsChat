import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8" }).trim();

const write = (root, path, contents) => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, contents);
};

test("packages only a clean committed source tree with fresh frontend builds", () => {
  const fixture = mkdtempSync(join(tmpdir(), "miaoxun-release-fixture-"));
  const extracted = mkdtempSync(join(tmpdir(), "miaoxun-release-extracted-"));
  let artifactRoot = null;

  try {
    mkdirSync(join(fixture, "scripts"));
    copyFileSync(
      join(repositoryRoot, "scripts/prepare-runtime-release.mjs"),
      join(fixture, "scripts/prepare-runtime-release.mjs"),
    );

    for (const path of [
      "backend/src/server.js",
      "backend/database/001.sql",
      "backend/scripts/check.js",
      "backend/test/server.test.js",
      "agents/registry.js",
      "shared/contract.js",
      "deploy/docker-compose.prod.yml",
      "deploy/marvels-chat-backend.service.example",
      "deploy/marvels-chat-database-backup.service.example",
      "deploy/marvels-chat-database-backup.timer.example",
      "deploy/marvels-chat-media-retrieval-worker.service.example",
      "deploy/miaoxun-admin-location.nginx.example",
      "deploy/miaoxun-database-backup.env.example",
      "deploy/miaoxun-postgresql.conf",
      "deploy/miaoxun-postgresql.pg_hba.conf",
      "deploy/miaoxun-prod.env.example",
    ]) {
      write(fixture, path, "export default true;\n");
    }
    write(fixture, "backend/package.json", '{"private":true}\n');
    write(fixture, "backend/package-lock.json", '{"lockfileVersion":3}\n');
    write(fixture, "backend/.env.production", "MUST_NOT_BE_PACKAGED=true\n");

    for (const workspace of ["admin", "avatar-web"]) {
      write(
        fixture,
        `${workspace}/package.json`,
        `${JSON.stringify({ private: true, scripts: { build: "node build.mjs" } })}\n`,
      );
      write(
        fixture,
        `${workspace}/build.mjs`,
        'import { mkdirSync, writeFileSync } from "node:fs";\n' +
          'mkdirSync("dist", { recursive: true });\n' +
          'writeFileSync("dist/index.html", "fresh-build");\n',
      );
    }

    run("git", ["init", "-q"], fixture);
    run("git", ["config", "user.email", "release-test@example.invalid"], fixture);
    run("git", ["config", "user.name", "Release Test"], fixture);
    run("git", ["add", "."], fixture);
    run("git", ["commit", "-qm", "test fixture"], fixture);

    const output = run(
      "node",
      ["scripts/prepare-runtime-release.mjs", "release-test"],
      fixture,
    );
    const result = JSON.parse(output.split("\n").at(-1));
    artifactRoot = dirname(result.archive);
    assert.equal(result.id, "release-test");
    assert.ok(existsSync(result.archive));

    run("tar", ["-xzf", result.archive, "-C", extracted], fixture);
    const runtime = join(extracted, "runtime");
    const manifest = JSON.parse(
      readFileSync(join(runtime, "release-manifest.json"), "utf8"),
    );
    assert.equal(manifest.sourceHead, run("git", ["rev-parse", "HEAD"], fixture));
    assert.equal(manifest.sourceTree, run("git", ["rev-parse", "HEAD^{tree}"], fixture));
    assert.equal(manifest.includesWorkingTreeChanges, false);
    assert.equal(readFileSync(join(runtime, "admin/index.html"), "utf8"), "fresh-build");
    assert.equal(
      readFileSync(join(runtime, "avatar-web/dist/index.html"), "utf8"),
      "fresh-build",
    );
    assert.equal(existsSync(join(runtime, "backend/.env.production")), false);
    assert.ok(existsSync(join(runtime, "deploy/miaoxun-admin-location.nginx.example")));
    assert.deepEqual(
      manifest.files.map((entry) => entry.path),
      [...manifest.files.map((entry) => entry.path)].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    assert.ok(manifest.files.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
  } finally {
    rmSync(fixture, { force: true, recursive: true });
    rmSync(extracted, { force: true, recursive: true });
    if (artifactRoot) rmSync(artifactRoot, { force: true, recursive: true });
  }
});
