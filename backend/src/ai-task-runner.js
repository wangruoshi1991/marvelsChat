import * as taskRepository from "./ai-task-repository.js";

export function taskFailure(error) {
  const code = error?.details?.code;
  if (code === "AI_PROVIDER_RESULT_UNKNOWN" || error?.status === 504 || error?.name === "TypeError") {
    return { code: "AI_PROVIDER_RESULT_UNKNOWN", message: "服务响应中断，结果尚未确认。本次不会自动重试，已发生的调用可能产生费用。" };
  }
  const safe = {
    AI_EXECUTION_DEADLINE_EXCEEDED: "本次 Agent 执行已超过时限，后续调用已停止。",
    AI_CONTEXT_CHANGED: "引用内容已变化，请重新选择后发送。",
    AI_CONTEXT_NOT_FOUND: "引用内容已删除、撤回或不可访问。",
    AI_CONTEXT_SCOPE_REQUIRED: "此 Agent 未获准读取所选上下文。",
    AI_AGENT_VERSION_CHANGED: "Agent 已更新，请重新发起任务。",
    SITE_TASK_INPUT_CHANGED: "主页内容已变化，请重新发起任务。",
    SITE_TASK_RESOURCES_CHANGED: "建站引用内容已变化，请重新生成方案。",
    SITE_TASK_PROFILE_CHANGED: "生成期间主页资料已变化，请重新发起任务。",
    SITE_TASK_REFERENCES_UNAVAILABLE: "建站引用的素材已变化或不可访问，请重新选择。",
    SITE_BUILDER_INVALID_REFERENCES: "建站结果包含无效素材引用，未保存或应用。",
    SITE_TASK_AGENT_CHANGED: "建站 Agent 已更新，请重新发起任务。",
    SITE_TASK_INVALID_REFERENCES: "建站结果包含无效素材引用，未保存或应用。",
    SITE_TASK_INVALID_DRAFT: "建站结果结构无效，未保存或应用。",
  };
  if (safe[code]) return { code, message: safe[code] };
  if (error?.status === 403) return { code: "AI_ACCESS_REVOKED", message: "任务所需授权已撤回或账号不可用，未交付新的结果。" };
  if (error?.status === 404) return { code: "AI_INPUT_UNAVAILABLE", message: "任务输入已删除或不可访问。" };
  if (error?.status === 503) return { code: "AI_SERVICE_UNAVAILABLE", message: "AI 服务暂不可用，请稍后检查任务或重新发起。" };
  return { code: "AI_EXECUTION_FAILED", message: "AI 任务未能完成，请检查输入后重新发起。" };
}

// A claim is never replayed after lease loss: provider calls may already have
// been charged. Only still-queued tasks are safe to start after process restart.
export function createAITaskRunner({ executors, repository = taskRepository, pollMs = 1500, heartbeatMs = 30000, logger = console, now = () => Date.now() } = {}) {
  let stopped = true;
  let stopping = false;
  let activeTask = false;
  let lastSuccessfulPollAt = null;
  let timer;
  let inFlight = null;
  const report = error => logger.error(JSON.stringify({ type: "ai_task_worker_error", code: error?.details?.code || "AI_TASK_WORKER_ERROR", errorName: error?.name || "Error" }));
  async function runOnce() {
    if (stopping) return false;
    await repository.recoverInterruptedAITasks();
    if (stopping) return false;
    const record = await repository.claimAITask();
    lastSuccessfulPollAt = new Date(now()).toISOString();
    if (!record) return false;
    // Shutdown may arrive while the claim transaction is committing. Do not
    // dispatch new work then; its durable lease will become interrupted. Never
    // requeue a claim as part of shutdown or guess whether work was dispatched.
    if (stopping) return false;
    activeTask = true;
    const heartbeat = setInterval(() => {
      void repository.heartbeatAITask({ taskId: record.id, claimToken: record.claimToken }).catch(report);
    }, heartbeatMs);
    heartbeat.unref?.();
    try {
      const execute = executors[record.kind];
      if (!execute) throw new Error("Task executor is not registered");
      await execute(record);
    } catch (error) {
      const failure = taskFailure(error);
      try {
        await repository.finishAITask({ taskId: record.id, claimToken: record.claimToken,
          status: failure.code === "AI_PROVIDER_RESULT_UNKNOWN" ? "interrupted" : "failed",
          phase: failure.code === "AI_PROVIDER_RESULT_UNKNOWN" ? "interrupted" : "failed", error: failure });
      } catch (commitError) {
        // A late worker cannot overwrite a recovered/terminal task. The durable
        // lease expiry will surface interrupted if the database is unavailable.
        report(commitError);
      }
      logger.error(JSON.stringify({ type: "ai_task_failed", taskId: record.id, code: failure.code }));
    } finally {
      clearInterval(heartbeat);
      activeTask = false;
    }
    return true;
  }
  const tick = () => {
    if (stopped) return;
    inFlight = runOnce().catch(report).finally(() => {
      inFlight = null;
      if (!stopped) timer = setTimeout(tick, pollMs);
    });
  };
  return {
    runOnce,
    getState: () => ({
      state: stopping ? (inFlight ? "stopping" : "stopped") : activeTask ? "running" : stopped ? "stopped" : "idle",
      activeTask,
      lastSuccessfulPollAt,
    }),
    start() { if (stopped && !inFlight) { stopping = false; stopped = false; tick(); } },
    async stop() { stopping = true; stopped = true; clearTimeout(timer); await inFlight; },
  };
}
