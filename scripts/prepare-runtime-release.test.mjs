import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const run = (command, args, cwd, env) =>
  execFileSync(command, args, { cwd, encoding: "utf8", ...(env ? { env } : {}) }).trim();

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
      "backend/src/media-retrieval-worker.js",
      "backend/src/ai-task-worker.js",
      "backend/database/001.sql",
      "backend/scripts/check.js",
      "backend/scripts/admin-bootstrap.js",
      "backend/scripts/avatar-3d-backfill-mobile-models.js",
      "backend/scripts/check-ai-task-operations.js",
      "backend/scripts/check-chat-attachment-operations.js",
      "backend/scripts/check-ui-preference-upgrade.js",
      "backend/scripts/db-migrate.js",
      "backend/scripts/migrate-site-documents.js",
      "backend/scripts/live-eval-provider.js",
      "backend/test/server.test.js",
      "agents/registry.js",
      "agents/chat-history.js",
      "agents/workspace-contribution.js",
      "agents/scripts/agent-test.js",
      "agents/test/registry.test.js",
      "agents/evals/workspace/plan.jsonl",
      "agents/media-retrieval/tests/agent-contract.test.js",
      "agents/media-retrieval/fixtures/secret-fixture.json",
      "shared/contract.js",
      "shared/agent-catalog.js",
      "shared/site-document.js",
      "shared/media-retrieval-public-contract.js",
      "shared/site-document.d.ts",
      "shared/fixtures/contract.json",
      "scripts/harden-production-release.sh",
      "scripts/check-repository.sh",
      "scripts/backup-production-database.sh",
      "scripts/miaoxun-development.mjs",
      "deploy/docker-compose.prod.yml",
      "deploy/marvels-chat-backend.service.example",
      "deploy/marvels-chat-ai-task-worker.service.example",
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
    // Exercise the real registry import graph in the extracted artifact, so a
    // newly used runtime helper cannot silently disappear from the allowlist.
    const agentSources = readdirSync(join(repositoryRoot, "agents"))
      .filter(name => name.endsWith(".js"));
    for (const name of agentSources) {
      copyFileSync(join(repositoryRoot, "agents", name), join(fixture, "agents", name));
    }
    // Import the actual backend entry points from the extracted runtime.  This
    // catches a missing shared or backend module even when the archive itself
    // and the Agent registry build successfully.
    cpSync(join(repositoryRoot, "backend/src"), join(fixture, "backend/src"), { recursive: true });
    for (const name of ["agent-catalog.js", "site-document.js", "media-retrieval-public-contract.js", "ui-preferences.js", "legacy-ui-preferences.js"]) {
      copyFileSync(join(repositoryRoot, "shared", name), join(fixture, "shared", name));
    }
    write(fixture, "backend/package.json", `${JSON.stringify({
      name: "@miaoxun/backend",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: {
        check: "node ../scripts/check-source-syntax.mjs src scripts test",
        test: "node --test test/*.test.js",
        "test:live-eval": "node scripts/live-eval-provider.js",
        start: "node src/server.js",
        "worker:media-retrieval": "node src/media-retrieval-worker.js",
        "worker:ai-tasks": "node src/ai-task-worker.js",
        "ops:ai-tasks": "node scripts/check-ai-task-operations.js",
        "ops:chat-attachments": "node scripts/check-chat-attachment-operations.js",
        "ops:ui-preference-upgrade": "node scripts/check-ui-preference-upgrade.js",
        "db:migrate": "node scripts/db-migrate.js",
        "admin:bootstrap": "node scripts/admin-bootstrap.js",
        "avatar3d:backfill-mobile": "node scripts/avatar-3d-backfill-mobile-models.js",
      },
      dependencies: { express: "^4.19.2" },
    }, null, 2)}\n`);
    write(fixture, "backend/package-lock.json", '{"lockfileVersion":3}\n');
    write(fixture, "agents/package.json", `${JSON.stringify({
      name: "@miaoxun/agents",
      version: "0.1.0",
      private: true,
      type: "module",
      scripts: { test: "node --test test/*.test.js", "agent:eval": "node scripts/agent-eval.js" },
      exports: { "./registry": "./registry.js" },
      engines: { node: ">=20" },
      dependencies: { ajv: "^8.20.0" },
      overrides: { "fast-uri": "3.1.8" },
    }, null, 2)}\n`);
    write(fixture, "agents/package-lock.json", "{}\n");
    write(fixture, "shared/package.json", '{"type":"module"}\n');
    write(fixture, "scripts/harden-production-release.sh", "#!/usr/bin/env bash\nexit 0\n");
    write(fixture, "backend/.env.production", "MUST_NOT_BE_PACKAGED=true\n");
    write(fixture, ".gitignore", "*.pem\n*.dump\nadmin/public/\nadmin/.env.production.local\n");

    for (const workspace of ["admin", "avatar-web"]) {
      write(
        fixture,
        `${workspace}/package.json`,
        `${JSON.stringify({ private: true, scripts: { build: "node build.mjs" } })}\n`,
      );
      write(
        fixture,
        `${workspace}/package-lock.json`,
        `${JSON.stringify({ name: workspace, version: "0.1.0", lockfileVersion: 3, requires: true, packages: { "": { name: workspace, version: "0.1.0" } } })}\n`,
      );
      write(
        fixture,
        `${workspace}/build.mjs`,
        'import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";\n' +
        'mkdirSync("dist", { recursive: true });\n' +
        'writeFileSync("dist/index.html", "fresh-build");\n' +
        'writeFileSync("dist/build-environment.txt", process.env.VITE_RELEASE_SECRET || "clean");\n' +
        'writeFileSync("dist/local-env-check.txt", existsSync(".env.production.local") ? readFileSync(".env.production.local", "utf8") : "clean");\n' +
        'if (existsSync("public/ignored-release-asset.txt")) writeFileSync("dist/ignored-release-asset.txt", readFileSync("public/ignored-release-asset.txt"));\n',
      );
    }

    run("git", ["init", "-q"], fixture);
    run("git", ["config", "user.email", "release-test@example.invalid"], fixture);
    run("git", ["config", "user.name", "Release Test"], fixture);
    run("git", ["add", "."], fixture);
    run("git", ["commit", "-qm", "test fixture"], fixture);

    write(fixture, "agents/ignored.provider.pem", "MUST_NOT_BE_PACKAGED=true\n");
    write(fixture, "backend/src/ignored-runtime.dump", "MUST_NOT_BE_PACKAGED=true\n");
    write(fixture, "admin/public/ignored-release-asset.txt", "MUST_NOT_BE_PACKAGED=true\n");
    write(fixture, "admin/.env.production.local", "VITE_RELEASE_SECRET=MUST_NOT_BE_PACKAGED\n");
    assert.equal(run("git", ["status", "--porcelain=v1"], fixture), "");

    const output = run(
      "node",
      ["scripts/prepare-runtime-release.mjs", "release-test"],
      fixture,
      { ...process.env, VITE_RELEASE_SECRET: "MUST_NOT_BE_PACKAGED=true" },
    );
    const result = JSON.parse(output.split("\n").at(-1));
    artifactRoot = dirname(result.archive);
    assert.equal(result.id, "release-test");
    assert.ok(existsSync(result.archive));
    assert.equal(
      createHash("sha256").update(readFileSync(result.archive)).digest("hex"),
      result.sha256,
    );

    run("tar", ["-xzf", result.archive, "-C", extracted], fixture);
    const runtime = join(extracted, "runtime");
    const manifest = JSON.parse(
      readFileSync(join(runtime, "release-manifest.json"), "utf8"),
    );
    assert.equal(manifest.sourceHead, run("git", ["rev-parse", "HEAD"], fixture));
    assert.equal(manifest.sourceTree, run("git", ["rev-parse", "HEAD^{tree}"], fixture));
    assert.equal(manifest.includesWorkingTreeChanges, false);
    assert.deepEqual(manifest.runtimePackageProjection.backendScripts, [
      "admin:bootstrap", "avatar3d:backfill-mobile", "db:migrate", "ops:ai-tasks", "ops:chat-attachments", "ops:legacy-publishing-backfill", "ops:ui-preference-upgrade",
      "start", "worker:ai-tasks", "worker:media-retrieval",
    ]);
    assert.equal(readFileSync(join(runtime, "admin/index.html"), "utf8"), "fresh-build");
    assert.equal(readFileSync(join(runtime, "admin/build-environment.txt"), "utf8"), "clean");
    assert.equal(readFileSync(join(runtime, "admin/local-env-check.txt"), "utf8"), "clean");
    assert.equal(existsSync(join(runtime, "admin/ignored-release-asset.txt")), false);
    assert.equal(
      readFileSync(join(runtime, "avatar-web/dist/index.html"), "utf8"),
      "fresh-build",
    );
    assert.equal(existsSync(join(runtime, "backend/.env.production")), false);
    assert.equal(existsSync(join(runtime, "backend/test")), false);
    assert.equal(existsSync(join(runtime, "agents/test")), false);
    assert.equal(existsSync(join(runtime, "agents/scripts")), false);
    assert.equal(existsSync(join(runtime, "agents/evals")), false);
    assert.equal(existsSync(join(runtime, "agents/media-retrieval")), false);
    assert.equal(existsSync(join(runtime, "agents/package-lock.json")), false);
    assert.equal(existsSync(join(runtime, "shared/site-document.d.ts")), false);
    assert.equal(existsSync(join(runtime, "shared/fixtures")), false);
    assert.equal(existsSync(join(runtime, "scripts/check-repository.sh")), false);
    assert.equal(existsSync(join(runtime, "scripts/backup-production-database.sh")), false);
    assert.equal(existsSync(join(runtime, "scripts/miaoxun-development.mjs")), false);
    const packagedAgents = JSON.parse(run("node", ["--input-type=module", "--eval",
      'import { listAgents } from "./agents/registry.js"; console.log(JSON.stringify((await listAgents()).map(agent => agent.key).sort()));',
    ], runtime));
    assert.deepEqual(packagedAgents, agentSources
      .filter(name => name.endsWith(".agent.js"))
      .map(name => name.slice(0, -".agent.js".length)).sort());
    // Dependencies are installed separately on the deployment host; provide
    // the already-installed backend dependencies without adding them to the
    // artifact. No database, provider, or persistent listener is started.
    symlinkSync(join(repositoryRoot, "backend/node_modules"), join(runtime, "backend/node_modules"), "dir");
    const backendImports = run("node", ["--input-type=module", "--eval",
      'await import("./backend/src/server.js"); await import("./backend/src/ai-task-worker.js"); await import("./backend/src/media-retrieval-worker.js"); console.log("backend-imports-ok"); process.exit(0);',
    ], runtime, { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "test", MIAOXUN_DOTENV_ENABLED: "false", HOST: "127.0.0.1", PORT: "0" });
    assert.equal(backendImports, "backend-imports-ok");
    assert.ok(existsSync(join(runtime, "agents/chat-history.js")));
    assert.ok(existsSync(join(runtime, "agents/workspace-contribution.js")));
    assert.ok(existsSync(join(runtime, "shared/site-document.js")));
    assert.ok(existsSync(join(runtime, "shared/media-retrieval-public-contract.js")));
    assert.ok(existsSync(join(runtime, "shared/ui-preferences.js")));
    assert.ok(existsSync(join(runtime, "shared/legacy-ui-preferences.js")));
    assert.ok(existsSync(join(runtime, "backend/scripts/check-ai-task-operations.js")));
    assert.ok(existsSync(join(runtime, "backend/scripts/check-chat-attachment-operations.js")));
    assert.ok(existsSync(join(runtime, "backend/scripts/check-ui-preference-upgrade.js")));
    assert.equal(existsSync(join(runtime, "backend/scripts/live-eval-provider.js")), false);
    assert.ok(existsSync(join(runtime, "scripts/harden-production-release.sh")));
    const runtimePackage = JSON.parse(readFileSync(join(runtime, "backend/package.json"), "utf8"));
    assert.deepEqual(Object.keys(runtimePackage.scripts).sort(), [
      "admin:bootstrap", "avatar3d:backfill-mobile", "db:migrate", "ops:ai-tasks", "ops:chat-attachments", "ops:ui-preference-upgrade",
      "start", "worker:ai-tasks", "worker:media-retrieval",
    ]);
    for (const value of Object.values(runtimePackage.scripts)) {
      for (const [, path] of value.matchAll(/\bnode\s+((?:src|scripts)\/[^\s]+)/g)) {
        assert.ok(existsSync(join(runtime, "backend", path)), `${path} must be packaged`);
      }
    }
    const runtimeAgentPackage = JSON.parse(readFileSync(join(runtime, "agents/package.json"), "utf8"));
    assert.equal(runtimeAgentPackage.type, "module");
    assert.equal(runtimeAgentPackage.dependencies, undefined);
    assert.equal(runtimeAgentPackage.scripts, undefined);
    assert.equal(existsSync(join(runtime, "agents/ignored.provider.pem")), false);
    assert.equal(existsSync(join(runtime, "backend/src/ignored-runtime.dump")), false);
    assert.ok(existsSync(join(runtime, "deploy/miaoxun-admin-location.nginx.example")));
    assert.ok(existsSync(join(runtime, "deploy/marvels-chat-ai-task-worker.service.example")));
    assert.deepEqual(
      manifest.files.map((entry) => entry.path),
      [...manifest.files.map((entry) => entry.path)].sort((left, right) =>
        left.localeCompare(right),
      ),
    );
    assert.ok(manifest.files.every((entry) => /^[a-f0-9]{64}$/.test(entry.sha256)));
    for (const entry of manifest.files) {
      assert.equal(
        createHash("sha256")
          .update(readFileSync(join(runtime, entry.path)))
          .digest("hex"),
        entry.sha256,
        entry.path,
      );
    }
  } finally {
    rmSync(fixture, { force: true, recursive: true });
    rmSync(extracted, { force: true, recursive: true });
    if (artifactRoot) rmSync(artifactRoot, { force: true, recursive: true });
  }
});
