#!/usr/bin/env node
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, open, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import net from "node:net";
import { fileURLToPath } from "node:url";

export const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scriptPath = fileURLToPath(import.meta.url);
const projectId = createHash("sha256").update(repositoryRoot).digest("hex").slice(0, 12);
export const stateRoot = path.join(homedir(), "Library/Application Support/MiaoxunDevelopment", projectId);
export const productionApiOrigin = "https://8.153.167.11";
export const officialBundleId = "com.wangruoshi.miaoxun";
const localApiOrigin = "http://127.0.0.1:4391";
export const simulatorId = "7E81531F-02AE-40FC-98DA-A575CEC9930F";
const postgresRoot = path.join(stateRoot, "postgres");
const logsRoot = path.join(stateRoot, "logs");
const roles = { api: "src/server.js", worker: "src/ai-task-worker.js" };
const identity = { format: 1, repositoryRoot, apiPort: 4391, postgresPort: 55441, database: "miaoxun_development" };

export function developmentEnvironment(base = process.env, root = stateRoot) {
  // Allow OS basics only. Never inherit backend/cloud/Node preload credentials.
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"]
    .filter((key) => base[key] !== undefined).map((key) => [key, base[key]]));
  return Object.assign(env, {
    NODE_ENV: "development", MIAOXUN_DOTENV_ENABLED: "false",
    HOST: "127.0.0.1", PORT: "4391", DEFAULT_ADMIN_ENABLED: "false",
    CREATE_FIRST_USER_AS_ADMIN: "false", ADMIN_EMAILS: "",
    POSTGRES_HOST: "127.0.0.1", POSTGRES_PORT: "55441", POSTGRES_USER: "postgres",
    POSTGRES_PASSWORD: "", POSTGRES_DATABASE: "miaoxun_development", DATABASE_URL: "",
    NEW_API_BASE_URL: "", NEW_API_KEY: "", NEW_API_MODEL: "",
    DASHSCOPE_API_KEY: "", DASHSCOPE_API_BASE_URL: "", DASHSCOPE_WORKSPACE_ID: "", DASHSCOPE_WANX_BASE_URL: "",
    MEDIA_RETRIEVAL_ENABLED: "false", MEDIA_RETRIEVAL_PROVIDER_CALLS_ENABLED: "false",
    MEDIA_RETRIEVAL_DASHSCOPE_API_KEY: "", MEDIA_RETRIEVAL_DASHSCOPE_API_BASE_URL: "",
    AVATAR_3D_ENABLED: "false", AVATAR_3D_PROVIDER_CALLS_ENABLED: "false",
    OSS_BUCKET: "", OSS_ENDPOINT: "", OSS_ACCESS_KEY_ID: "", OSS_ACCESS_KEY_SECRET: "",
    AMAP_WEB_SERVICE_KEY: "", GEOCODING_REVERSE_URL: "", GEOCODING_USER_AGENT: "",
    MIAOXUN_LOCAL_MEDIA_ROOT: path.join(root, "media"),
  });
}

export function disableDevelopmentFetch() {
  // This guard is installed only by __run in this local launcher. API handlers
  // make no loopback fetches; no outbound destination is permitted here.
  globalThis.fetch = async () => {
    const error = new Error("本地开发预览禁止供应商和云端请求。");
    error.code = "DEVELOPMENT_PROVIDER_CALLS_DISABLED";
    throw error;
  };
}

export async function runDevelopmentRuntime(role, { loadModule = specifier => import(specifier) } = {}) {
  if (!roles[role]) throw new Error("Invalid isolated development runtime role.");
  disableDevelopmentFetch();
  const runtime = await loadModule(path.join(repositoryRoot, "backend", roles[role]));
  if (role === "worker") await runtime.startAITaskWorker();
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: repositoryRoot, encoding: "utf8", env: developmentEnvironment(), ...options,
  });
  if (result.error || result.status !== 0) {
    throw new Error(`${program} failed: ${result.error?.message || result.stderr?.trim() || result.stdout?.trim()}`);
  }
  return result.stdout.trim();
}

async function json(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

async function save(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function validateState(create = false) {
  const markerPath = path.join(stateRoot, "owner.json");
  const marker = await json(markerPath);
  if (marker && JSON.stringify(marker) !== JSON.stringify(identity)) throw new Error("Development state ownership does not match this checkout.");
  if (!marker && !create) return false;
  if (!marker) {
    await mkdir(stateRoot, { recursive: true, mode: 0o700 });
    if ((await readdir(stateRoot)).length) throw new Error("Refusing to adopt a nonempty unowned development directory.");
    await save(markerPath, identity);
  }
  await chmod(stateRoot, 0o700);
  await mkdir(logsRoot, { recursive: true, mode: 0o700 });
  return true;
}

function processIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 2) return null;
  const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart=", "-o", "command="], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

async function ownedProcess(role) {
  const record = await json(path.join(stateRoot, `${role}.json`));
  if (!record) return null;
  const current = processIdentity(record.pid);
  if (!current) return null;
  if (current !== record.identity || !current.includes(scriptPath) || !current.includes(`__run ${role} ${stateRoot}`)) {
    throw new Error(`${role} PID no longer belongs to this launcher; refusing to signal it.`);
  }
  return record;
}

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error(`127.0.0.1:${port} is occupied; existing services are preserved.`)));
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => server.close(resolve));
  });
}

function postgresRunning() {
  const result = spawnSync("pg_ctl", ["-D", postgresRoot, "status"], { encoding: "utf8", env: developmentEnvironment() });
  if (result.error) throw result.error;
  return result.status === 0;
}

function postgresSql(sql, database = "postgres") {
  return command("psql", ["-X", "-w", "-h", "127.0.0.1", "-p", "55441", "-U", "postgres", "-d", database, "-At", "-c", sql]);
}

function assertPostgresOwnership() {
  if (postgresSql("SHOW data_directory") !== postgresRoot) throw new Error("PostgreSQL port belongs to another cluster.");
}

export async function sourceSnapshot() {
  const files = command("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"])
    .split("\0").filter(Boolean).sort();
  const digest = createHash("sha256");
  for (const file of files) {
    // Store hashes only. Runtime files and ignored credentials are never read.
    if (path.basename(file) === ".env") continue;
    digest.update(file).update("\0");
    try { digest.update(await readFile(path.join(repositoryRoot, file))); }
    catch (error) { if (error.code !== "ENOENT") throw error; digest.update("deleted"); }
    digest.update("\0");
  }
  return { commit: command("git", ["rev-parse", "HEAD"]),
    branch: command("git", ["branch", "--show-current"]),
    dirty: Boolean(command("git", ["status", "--porcelain"])), sha256: digest.digest("hex") };
}

async function startProcess(role) {
  const log = await open(path.join(logsRoot, `${role}.log`), "a", 0o600);
  const child = spawn(process.execPath, [scriptPath, "__run", role, stateRoot], {
    cwd: repositoryRoot, env: developmentEnvironment(), detached: true, stdio: ["ignore", log.fd, log.fd],
  });
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", reject); });
  child.unref();
  await log.close();
  const processInfo = processIdentity(child.pid);
  if (!processInfo) throw new Error(`${role} exited during startup; inspect its log.`);
  await save(path.join(stateRoot, `${role}.json`), { pid: child.pid, identity: processInfo });
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitReady() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (!(await ownedProcess("api")) || !(await ownedProcess("worker"))) throw new Error("API/Worker exited; inspect development logs.");
    try {
      const response = await fetch(`${localApiOrigin}/api/ready`, { signal: AbortSignal.timeout(Math.max(1, Math.min(1000, deadline - Date.now()))) });
      if (response.ok && (await response.json()).ok) return;
    } catch { /* startup is bounded; final failure is explicit */ }
    await delay(200);
  }
  throw new Error("Development API did not become database-ready within 20 seconds.");
}

async function start() {
  await validateState(true);
  const running = await Promise.all(Object.keys(roles).map(ownedProcess));
  if (running.every(Boolean)) {
    const previous = await json(path.join(stateRoot, "runtime.json"));
    if (previous?.source?.sha256 !== (await sourceSnapshot()).sha256) throw new Error("Source changed since startup. Run verify-local-restart to load the current backend.");
    await waitReady();
    return;
  }
  if (running.some(Boolean)) throw new Error("Partial startup detected. Run verify-local-restart; no existing process was replaced.");
  await assertPortFree(4391);
  if (!(await json(path.join(postgresRoot, "initialized.json")))) {
    await assertPortFree(55441);
    const initializing = await mkdtemp(path.join(stateRoot, "postgres-initializing-"));
    try {
      command("initdb", ["-D", initializing, "-U", "postgres", "--auth-local=trust", "--auth-host=trust", "--encoding=UTF8", "--no-locale"]);
      await writeFile(path.join(initializing, "postgresql.conf"), "\nlisten_addresses = '127.0.0.1'\nport = 55441\nunix_socket_directories = ''\n", { flag: "a" });
      await save(path.join(initializing, "initialized.json"), { format: 1 });
      await rename(initializing, postgresRoot);
    } catch (error) {
      await rm(initializing, { recursive: true, force: true });
      throw error;
    }
  }
  if (!postgresRunning()) {
    await assertPortFree(55441);
    command("pg_ctl", ["-D", postgresRoot, "-l", path.join(logsRoot, "postgres.log"), "-w", "start"]);
  }
  assertPostgresOwnership();
  const env = developmentEnvironment();
  await writeFile(path.join(stateRoot, "runtime.env"), Object.entries(env).filter(([key]) => !["PATH", "HOME", "TMPDIR", "LANG", "LC_ALL"].includes(key)).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", { mode: 0o600 });
  const migrationOutput = command(process.execPath, [path.join(repositoryRoot, "backend/scripts/db-migrate.js")]);
  console.log(migrationOutput);
  await save(path.join(stateRoot, "runtime.json"), { startedAt: new Date().toISOString(), source: await sourceSnapshot(), providerCallsEnabled: false, apiOrigin: localApiOrigin });
  try {
    await startProcess("api");
    await startProcess("worker");
    await waitReady();
  } catch (error) {
    await stopProcesses();
    throw error;
  }
}

async function stopProcesses() {
  for (const role of ["worker", "api"]) {
    const record = await ownedProcess(role);
    if (record) {
      process.kill(record.pid, "SIGTERM");
      for (let attempt = 0; attempt < 175 && processIdentity(record.pid); attempt += 1) await delay(200);
      if (processIdentity(record.pid)) throw new Error(`${role} did not stop within 35 seconds; preserved database and process.`);
    }
    await rm(path.join(stateRoot, `${role}.json`), { force: true });
  }
}

async function stop() {
  if (!(await validateState())) return;
  await stopProcesses();
  if (postgresRunning()) {
    assertPostgresOwnership();
    command("pg_ctl", ["-D", postgresRoot, "-m", "fast", "-w", "stop"]);
  }
}

export async function developmentStatus() {
  if (!(await validateState())) return { initialized: false, stateRoot, apiOrigin: localApiOrigin };
  const processes = {};
  for (const role of Object.keys(roles)) processes[role] = Boolean(await ownedProcess(role));
  const postgres = postgresRunning();
  if (postgres) assertPostgresOwnership();
  let health = null;
  let ready = null;
  if (processes.api) {
    for (const endpoint of ["health", "ready"]) {
      try {
        const response = await fetch(`${localApiOrigin}/api/${endpoint}`, { signal: AbortSignal.timeout(2000) });
        const evidence = { status: response.status, body: await response.json() };
        if (endpoint === "health") health = evidence; else ready = evidence;
      } catch { /* report explicit unavailability below */ }
    }
  }
  const runtime = await json(path.join(stateRoot, "runtime.json"));
  const checkoutSource = await sourceSnapshot();
  return { initialized: true, stateRoot, apiOrigin: localApiOrigin, postgres, processes, health, ready,
    schemaMigrations: postgres ? Number(postgresSql("SELECT count(*) FROM schema_migrations", identity.database)) : null,
    sourceMatchesCheckout: runtime?.source?.sha256 === checkoutSource.sha256, checkoutSource, runtime };
}

async function withLock(operation) {
  await validateState(true);
  const lockPath = path.join(stateRoot, "operation.lock");
  let lock;
  try { lock = await open(lockPath, "wx", 0o600); }
  catch (error) { if (error.code === "EEXIST") throw new Error("A development operation lock exists; inspect its PID before removing a stale lock.", { cause: error }); throw error; }
  try { await lock.writeFile(String(process.pid)); await operation(); }
  finally { await lock.close(); await rm(lockPath, { force: true }); }
}

export function parseDevelopmentArguments(args) {
  const [action, ...rest] = args;
  if (action === "ios" && (rest.length === 0 || (rest.length === 1 && rest[0] === "--build-only"))) {
    return { action, buildOnly: rest.length === 1 };
  }
  if (["verify-local-start", "stop", "verify-local-restart", "status"].includes(action) && rest.length === 0) return { action };
  if (action === "__run" && rest.length === 2 && roles[rest[0]] && rest[1] === stateRoot) return { action, role: rest[0] };
  throw new Error("Usage: node scripts/miaoxun-development.mjs ios [--build-only]|stop|status|verify-local-start|verify-local-restart");
}

async function main() {
  const { action, role, buildOnly } = parseDevelopmentArguments(process.argv.slice(2));
  if (action === "__run") {
    if (process.env.MIAOXUN_DOTENV_ENABLED !== "false") throw new Error("Invalid isolated development process invocation.");
    await runDevelopmentRuntime(role);
    return;
  }
  if (action === "verify-local-start") await withLock(start);
  else if (action === "stop") await withLock(stop);
  else if (action === "verify-local-restart") await withLock(async () => { await stop(); await start(); });
  else if (action === "status") { console.log(JSON.stringify(await developmentStatus(), null, 2)); return; }
  else if (action === "ios") {
    await withLock(async () => {
      const { runIOSBuild } = await import("./miaoxun-development-ios.mjs");
      await runIOSBuild({ buildOnly });
    });
    return;
  }
  console.log(JSON.stringify(await developmentStatus(), null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
