import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createWorkerHealthReporter, isWorkerHealthy } from "../src/worker-health.js";

test("worker health requires a live local process and a fresh successful update from this instance", (t) => {
  const directory = mkdtempSync(join(tmpdir(), "miaoxun-worker-health-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "first.json");
  const peerPath = join(directory, "peer.json");
  let now = Date.now();
  const first = createWorkerHealthReporter({ path, now: () => now });
  const peer = createWorkerHealthReporter({ path: peerPath, now: () => now });
  const check = () => isWorkerHealthy({ path, now: () => now, maxAgeMs: 100 });
  assert.equal(check(), false);
  first(true);
  assert.equal(check(), true);
  now += 101;
  peer(true);
  assert.equal(check(), false);
  assert.equal(isWorkerHealthy({ path: peerPath, now: () => now, maxAgeMs: 100 }), true);
  first(true);
  assert.equal(check(), true);
  first(false);
  assert.equal(check(), false);

  const source = new URL("../src/worker-health.js", import.meta.url).href;
  const exited = spawnSync(process.execPath, ["--input-type=module", "-e", `
    import { createWorkerHealthReporter } from ${JSON.stringify(source)};
    createWorkerHealthReporter({ path: process.argv[1] })(true);
  `, path]);
  assert.equal(exited.status, 0);
  assert.equal(isWorkerHealthy({ path, maxAgeMs: 10000 }), false);
});
