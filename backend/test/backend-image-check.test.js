import assert from "node:assert/strict";
import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const imageCheck = path.join(repoRoot, "scripts/check-backend-image.sh");

test("backend image smoke check supplies an explicit production CORS origin", async (t) => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), "miaoxun-backend-image-check-"));
  t.after(() => rm(fixture, { recursive: true, force: true }));

  const fakeDocker = path.join(fixture, "docker");
  const argsFile = path.join(fixture, "docker-args");
  await writeFile(fakeDocker, `#!/usr/bin/env bash
set -euo pipefail
command="$1"
shift
case "$command" in
  run)
    printf '%s\\n' "$@" > "$FAKE_DOCKER_ARGS"
    grep -Fxq 'CORS_ORIGIN=https://smoke.invalid' "$FAKE_DOCKER_ARGS"
    printf 'fixture-container\\n'
    ;;
  exec|logs|rm)
    ;;
  *)
    exit 1
    ;;
esac
`);
  await chmod(fakeDocker, 0o755);

  const result = spawnSync("/bin/bash", [imageCheck, "fixture-image"], {
    cwd: repoRoot,
    env: {
      ...process.env,
      PATH: `${fixture}:${process.env.PATH}`,
      FAKE_DOCKER_ARGS: argsFile,
    },
    encoding: "utf8",
  });

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const args = await readFile(argsFile, "utf8");
  assert.match(args, /^NODE_ENV=production$/m);
  assert.match(args, /^CORS_ORIGIN=https:\/\/smoke\.invalid$/m);
});
