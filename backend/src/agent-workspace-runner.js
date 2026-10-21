import * as workspaceRepository from "./agent-workspace-repository.js";
import { taskFailure } from "./ai-task-runner.js";

const safeMessages = {
  WORKSPACE_ACCESS_REVOKED: "协作所需授权已撤回，后续步骤已停止。",
  WORKSPACE_AGENT_CHANGED: "参与的 Agent 已更新，请重新发起任务。",
  WORKSPACE_CAPABILITY_UNAVAILABLE: "任务需要的 Agent 能力目前不可执行。",
  WORKSPACE_CONTEXT_INVALID: "本次选择的内容不适用于计划中的能力，请调整任务范围。",
  WORKSPACE_CONTEXT_LIMIT: "本次选择的内容超出任务范围上限，请缩小范围。",
  WORKSPACE_SOURCES_CHANGED: "任务引用的内容已变化或不可访问，请重新发起。",
  WORKSPACE_ORIGIN_CHANGED: "原专业会话或用户需求已删除、撤回或变化，后续执行已停止。",
  WORKSPACE_MEDIA_CHANGED: "协作交接的素材已变化或不可访问，后续步骤已停止。",
  WORKSPACE_MEDIA_INVALID: "素材交付结果无效，未执行后续步骤。",
  WORKSPACE_MEDIA_NOT_FOUND: "未取得符合目标的可用素材，未自动改为无素材页面。",
  WORKSPACE_MEDIA_UNUSED: "页面方案没有使用交付素材，未作为已完成成果保存。",
  WORKSPACE_DIARY_UNUSED: "页面方案没有使用所选日记，未作为已完成成果保存。",
  WORKSPACE_DEPENDENCY_INVALID: "协作计划的成果依赖无效，未继续执行。",
  WORKSPACE_PLAN_INVALID: "Agent 返回的协作计划不符合执行规则，未继续执行。",
  WORKSPACE_DEADLINE_EXCEEDED: "本次协作已超过执行时限，未继续派发后续步骤。",
  WORKSPACE_MODEL_RESULT_UNKNOWN: "已派发的模型调用尚未确认结果，不会自动重新执行。",
  WORKSPACE_MODEL_RECEIPT_CONFLICT: "模型调用回执存在冲突，未继续执行。",
  WORKSPACE_STATE_CHANGED: "协作状态已变化，未继续派发新的调用。",
};

export function workspaceFailure(error) {
  const code = error?.details?.code;
  return safeMessages[code] ? { code, message: safeMessages[code] } : taskFailure(error);
}

// Bounded concurrency uses the same durable queue and process as other AI work.
// A claimed step is never retried automatically, even if shutdown arrives before
// its executor starts: only durable lease recovery may mark it interrupted.
export function createAgentWorkspaceRunner({
  execute, repository = workspaceRepository, pollMs = 1500, heartbeatMs = 30000,
  maxConcurrent = 2, logger = console, now = () => Date.now(),
} = {}) {
  if (typeof execute !== "function") throw new TypeError("Workspace runner requires an executor");
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1 || maxConcurrent > 4) throw new TypeError("Invalid workspace concurrency limit");
  let stopped = true;
  let stopping = false;
  let activeNodes = 0;
  let lastSuccessfulPollAt = null;
  let timer;
  const pending = new Set();
  const report = error => logger.error(JSON.stringify({ type: "agent_workspace_worker_error",
    code: error?.details?.code || "WORKSPACE_WORKER_ERROR", errorName: error?.name || "Error" }));

  async function run() {
    if (stopping) return false;
    await repository.recoverInterruptedWorkspaceNodes();
    if (stopping) return false;
    const claim = await repository.claimWorkspaceNode();
    lastSuccessfulPollAt = new Date(now()).toISOString();
    if (!claim || stopping) return false;
    activeNodes++;
    const { node, workspace } = claim;
    let heartbeatPending = false;
    const heartbeat = setInterval(() => {
      if (heartbeatPending) return;
      heartbeatPending = true;
      void repository.heartbeatWorkspaceNode({ nodeId: node.id, claimToken: node.claimToken })
        .catch(report).finally(() => { heartbeatPending = false; });
    }, heartbeatMs);
    heartbeat.unref?.();
    try {
      await execute(claim);
    } catch (error) {
      const failure = workspaceFailure(error);
      try {
        await repository.failWorkspaceNode({ nodeId: node.id, claimToken: node.claimToken, error: failure,
          interrupted: ["AI_PROVIDER_RESULT_UNKNOWN", "WORKSPACE_MODEL_RESULT_UNKNOWN"].includes(failure.code) });
      } catch (commitError) {
        // A recovered or expired claim cannot overwrite newer aggregate state.
        report(commitError);
      }
      logger.error(JSON.stringify({ type: "agent_workspace_node_failed", workspaceId: workspace.id,
        nodeId: node.id, code: failure.code }));
    } finally {
      clearInterval(heartbeat);
      activeNodes--;
    }
    return true;
  }

  const runOnce = () => {
    if (stopping || pending.size >= maxConcurrent) return Promise.resolve(false);
    const work = run();
    pending.add(work);
    void work.then(() => pending.delete(work), () => pending.delete(work));
    return work;
  };
  const tick = () => {
    if (stopped) return;
    while (pending.size < maxConcurrent && !stopped) void runOnce().catch(report);
    timer = setTimeout(tick, pollMs);
  };
  return {
    runOnce,
    getState: () => ({ state: stopping ? (pending.size ? "stopping" : "stopped")
      : activeNodes ? "running" : stopped ? "stopped" : "idle", activeNodes, maxConcurrent, lastSuccessfulPollAt }),
    start() { if (stopped && !pending.size) { stopping = false; stopped = false; tick(); } },
    async stop() { stopping = true; stopped = true; clearTimeout(timer); await Promise.allSettled([...pending]); },
  };
}
