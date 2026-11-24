import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function createWorkerHealthReporter({
  path = process.env.MIAOXUN_WORKER_HEALTH_PATH,
  now = Date.now,
} = {}) {
  if (!path) return () => {};
  if (!isAbsolute(path)) throw new TypeError("Worker health path must be absolute");
  rmSync(path, { force: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  return (healthy) => {
    if (!healthy) {
      rmSync(path, { force: true });
      return;
    }
    writeFileSync(temporaryPath, JSON.stringify({ pid: process.pid, checkedAt: now() }), { mode: 0o600 });
    renameSync(temporaryPath, path);
  };
}

export function isWorkerHealthy({
  path = process.env.MIAOXUN_WORKER_HEALTH_PATH,
  now = Date.now,
  maxAgeMs,
} = {}) {
  if (!path || !isAbsolute(path) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) return false;
  try {
    const { pid, checkedAt } = JSON.parse(readFileSync(path, "utf8"));
    const age = now() - checkedAt;
    if (!Number.isSafeInteger(pid) || pid <= 0 || !Number.isSafeInteger(checkedAt) || age < 0 || age >= maxAgeMs) return false;
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = isWorkerHealthy({ maxAgeMs: Number(process.argv[2]) }) ? 0 : 1;
}
