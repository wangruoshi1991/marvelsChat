import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createAITaskRunner } from "./ai-task-runner.js";
import { executeMessageTask } from "./ai-message-task-service.js";
import { executeSiteTask } from "./ai-site-task-service.js";
import { createAgentWorkspaceRunner } from "./agent-workspace-runner.js";
import { executeWorkspaceNode } from "./agent-workspace-service.js";
import { checkDatabase, closeDatabase, query } from "./db.js";
import { aiClientContracts } from "./ai-client-contract.js";
import { config } from "./config.js";
import { createChatAttachmentMaintenance } from "./chat-attachment-lifecycle.js";
import { comicImageProvider } from "./comic-image-provider.js";
import { createComicRenderExecutor } from "./comic-render-executor.js";
import { createComicRenderStorage } from "./comic-render-storage.js";
import { recordAITaskWorkerStatus } from "./ai-task-worker-status-repository.js";
import { getOssRuntimeStatus } from "./asset-storage-service.js";

// This is a process/database liveness diagnostic, not proof that the queue or a
// model call is progressing. Check lastSuccessfulPollAt and queue age as well.
export function createAITaskWorkerHeartbeat({
  runner, checkConnection = () => query("SELECT 1 AS ok"), logger = console,
  intervalMs = 30000, timeoutMs = 5000, now = () => Date.now(),
  recordStatus = null, instanceId = crypto.randomUUID(), capabilities = [],
} = {}) {
  let timer;
  let stopped = false;
  let pending = null;
  let lastDatabaseSuccessAt = null;
  const runOnce = async () => {
    if (stopped || pending) return false;
    const check = Promise.resolve().then(checkConnection).then(async () => {
      if (stopped) return;
      const state = runner.getState();
      const lastPoll = Date.parse(state.lastSuccessfulPollAt);
      const live = state.state === "running" || (state.state === "idle" && Number.isFinite(lastPoll) && now() - lastPoll < 90000);
      await recordStatus?.({ instanceId, state: live ? "ready" : "starting", capabilities });
    });
    pending = check;
    const settled = () => { if (pending === check) pending = null; };
    void check.then(settled, settled);
    let timeout;
    try {
      await Promise.race([check, new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("AI_TASK_WORKER_HEARTBEAT_TIMEOUT")), timeoutMs);
      })]);
      if (stopped) return false;
      lastDatabaseSuccessAt = new Date(now()).toISOString();
      logger.log(JSON.stringify({ type: "ai_task_worker_heartbeat", checkedAt: lastDatabaseSuccessAt,
        databaseConnected: true, lastDatabaseSuccessAt, ...runner.getState() }));
      return true;
    } catch {
      if (!stopped) logger.error(JSON.stringify({ type: "ai_task_worker_heartbeat", checkedAt: new Date(now()).toISOString(),
        databaseConnected: false, lastDatabaseSuccessAt, code: "AI_TASK_WORKER_DATABASE_CHECK_FAILED", ...runner.getState() }));
      return false;
    } finally {
      clearTimeout(timeout);
      // A timed-out database operation may still be waiting for a pool slot.
      // Keep it pending until it settles; never pile up more heartbeat queries.
    }
  };
  return {
    runOnce,
    start() {
      if (timer || stopped) return;
      void runOnce();
      timer = setInterval(() => { void runOnce(); }, intervalMs);
      timer.unref?.();
    },
    async stop() {
      stopped = true; clearInterval(timer);
      if (pending) await pending.catch(() => {});
      await recordStatus?.({ instanceId, state: "stopped", capabilities: [] });
    },
  };
}

export function createComicRenderMaintenance({ storage, configured, logger = console, intervalMs = 60000 } = {}) {
  let timer, pending = null, stopped = false;
  const runOnce = () => {
    if (stopped || pending || !configured) return Promise.resolve(false);
    pending = Promise.resolve().then(() => storage.collectCleanup()).then(() => true).catch(() => {
      logger.error(JSON.stringify({ type: "comic_storage_cleanup_failed", code: "COMIC_STORAGE_CLEANUP_FAILED" }));
      return false;
    }).finally(() => { pending = null; });
    return pending;
  };
  return { runOnce, start() { if (timer || stopped || !configured) return; void runOnce(); timer = setInterval(runOnce, intervalMs); timer.unref?.(); },
    async stop() { stopped = true; clearInterval(timer); if (pending) await pending; } };
}

export async function startAITaskWorker({
  check = checkDatabase, close = closeDatabase, createRunner = createAITaskRunner,
  createWorkspaceRunner = createAgentWorkspaceRunner,
  executeWorkspace = executeWorkspaceNode,
  createAttachmentMaintenance = createChatAttachmentMaintenance,
  createHeartbeat = createAITaskWorkerHeartbeat, runtime = process, logger = console,
  workspaceMaxConcurrent = config.agentWorkspace.maxConcurrent,
  imageProvider = comicImageProvider, comicStorage = createComicRenderStorage(),
  storageStatus = getOssRuntimeStatus(), comicRepository,
  createComicMaintenance = createComicRenderMaintenance,
  recordWorkerStatus = recordAITaskWorkerStatus,
} = {}) {
  const database = await check();
  if (!database.connected || !database.migrationsCurrent) {
    logger.error(JSON.stringify({ type: "ai_task_worker_start_failed", code: "DATABASE_MIGRATIONS_REQUIRED" }));
    await close();
    runtime.exitCode = 1;
    return null;
  }
  const executors = { agent_message: executeMessageTask, site_draft: executeSiteTask };
  if (imageProvider.readiness().configured && storageStatus.configured) {
    executors.comic_render = async record => {
      const repository = comicRepository || (await import("./comic-render-repository.js")).defaultComicRenderRepository;
      return createComicRenderExecutor({ provider: imageProvider, repository, storage: comicStorage })(record);
    };
  }
  const runner = createRunner({ executors, logger });
  const workspaceRunner = createWorkspaceRunner({ execute: executeWorkspace, logger, maxConcurrent: workspaceMaxConcurrent });
  const monitor = { getState: () => {
    const task = runner.getState();
    const workspace = workspaceRunner.getState();
    return { ...task,
      activeNodes: workspace.activeNodes, workspaceState: workspace.state,
      workspaceLastSuccessfulPollAt: workspace.lastSuccessfulPollAt };
  } };
  const heartbeat = createHeartbeat({ runner: monitor, logger, recordStatus: recordWorkerStatus,
    capabilities: Object.keys(executors) });
  const attachmentMaintenance = createAttachmentMaintenance({ logger });
  const comicMaintenance = createComicMaintenance({ storage: comicStorage, configured: storageStatus.configured, logger });
  runner.start();
  workspaceRunner.start();
  heartbeat.start();
  attachmentMaintenance.start();
  comicMaintenance.start();
  logger.log(JSON.stringify({ type: "ai_task_worker_started", contractVersion: aiClientContracts.aiTasks, workspaceContractVersion: aiClientContracts.agentWorkspaces }));
  let stopping = null;
  const stop = () => {
    if (stopping) return stopping;
    const stopped = Promise.all([heartbeat.stop(), runner.stop(), workspaceRunner.stop(), attachmentMaintenance.stop(), comicMaintenance.stop()]);
    logger.log(JSON.stringify({ type: "ai_task_worker_stopping", ...monitor.getState() }));
    const deadline = setTimeout(() => runtime.exit(1), 75000);
    stopping = stopped.then(close).then(() => {
      logger.log(JSON.stringify({ type: "ai_task_worker_stopped" }));
    }).finally(() => clearTimeout(deadline));
    return stopping;
  };
  for (const signal of ["SIGTERM", "SIGINT"]) {
    runtime.once(signal, () => { void stop().catch(() => runtime.exit(1)); });
  }
  return { runner, workspaceRunner, stop };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await startAITaskWorker();
}
