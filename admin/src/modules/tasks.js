import { createModule } from "./_module.js";
import { escapeHtml } from "../../admin-core.js";

const statuses = ["queued", "running", "waiting_input", "awaiting_confirmation", "succeeded", "failed", "interrupted", "cancelling", "cancelled"];
const statusLabels = { queued: "排队中", running: "运行中", waiting_input: "等待输入", awaiting_confirmation: "等待确认", succeeded: "成功", failed: "失败", interrupted: "已中断", cancelling: "取消中", cancelled: "已取消" };
const idempotencyKey = (action, id) => `admin-task-${action}-${id}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

function queryPath(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return `/api/admin/tasks?${params.toString()}`;
}

export function createTasksModule(client) {
  const filters = { status: "", agentId: "", userId: "", from: "", to: "", limit: "80" };
  const module = createModule({
    name: "tasks", title: "任务运营", permission: "tasks:read", actionPermission: "tasks:write",
    endpoint: () => queryPath(filters), client,
    handleAction: async (action, payload = {}) => {
      if (action === "filter") { for (const key of Object.keys(filters)) if (payload[key] !== undefined) filters[key] = String(payload[key] || ""); for (const key of ["from", "to"]) if (filters[key] && !/[zZ]|[+-]\d\d:\d\d$/.test(filters[key])) filters[key] = new Date(filters[key]).toISOString(); return { ok: true }; }
      const taskId = payload.taskId;
      if (!taskId || !["retry", "cancel"].includes(action)) throw new Error("任务操作参数无效。");
      return client(`/api/admin/tasks/${encodeURIComponent(taskId)}/${action}`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey(action, taskId) } });
    },
    renderData(data) {
      const rows = Array.isArray(data) ? data : data?.items || [];
      const toolbar = `<form class="module-toolbar" data-module-filter="tasks"><label>状态<select name="status"><option value="">全部状态</option>${statuses.map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${statusLabels[status]}</option>`).join("")}</select></label><label>Agent<input name="agentId" value="${escapeHtml(filters.agentId)}" placeholder="Agent key" /></label><label>用户 ID<input name="userId" value="${escapeHtml(filters.userId)}" placeholder="UUID" /></label><label>开始时间<input type="datetime-local" name="from" value="${escapeHtml(filters.from)}" /></label><label>结束时间<input type="datetime-local" name="to" value="${escapeHtml(filters.to)}" /></label><button type="submit">应用筛选</button><button type="button" data-module-action="filter-clear">清空</button></form>`;
      const body = rows.map((row) => { const canRetry = ["failed", "interrupted"].includes(row.status); const canCancel = ["queued", "running", "waiting_input", "awaiting_confirmation"].includes(row.status); const actionButtons = `${canRetry ? `<button type="button" data-module-action="retry" data-task-id="${escapeHtml(row.id)}">重试</button>` : ""}${canCancel ? `<button type="button" data-module-action="cancel" data-task-id="${escapeHtml(row.id)}">取消</button>` : ""}`; const errorText = row.failureCode || row.errorCode || row.error?.message || "--"; return `<tr><td><strong><code>${escapeHtml(row.id || "--")}</code></strong><small>${escapeHtml(row.kind || row.type || "--")}</small></td><td>${escapeHtml(row.type || row.taskType || "--")}</td><td><span class="status-pill ${["failed", "interrupted", "cancelled"].includes(row.status) ? "error" : ""}">${escapeHtml(statusLabels[row.status] || row.status || "未知")}</span><small>${escapeHtml(row.phase || "")}</small></td><td>${escapeHtml(row.agentId || "--")}<small>${escapeHtml(row.agentVersion || "")}</small></td><td><code>${escapeHtml(row.userId || "--")}</code></td><td>${escapeHtml(row.createdAt || "--")}<small>更新 ${escapeHtml(row.updatedAt || "--")}</small></td><td>${escapeHtml(errorText)}</td><td><div class="console-actions">${actionButtons || "<span>无可用操作</span>"}</div></td></tr>`; }).join("");
      return `<section class="module-header"><div><span>TASK OPERATIONS</span><h2>任务运营</h2><p>读取 ai_tasks 与 Agent workspace 的真实状态，显示执行阶段、版本、失败原因和更新时间；只对服务端允许的状态执行取消或重试。</p></div><button data-module-refresh="tasks">刷新</button></section>${toolbar}<div class="table-wrap"><table><thead><tr><th>任务</th><th>类型</th><th>状态 / 阶段</th><th>Agent / 版本</th><th>用户</th><th>创建 / 更新</th><th>失败原因</th><th>操作</th></tr></thead><tbody>${body || `<tr><td colspan="8"><div class="console-empty">暂无匹配任务。</div></td></tr>`}</tbody></table></div>`;
    },
  });
  const originalHandle = module.handleAction.bind(module);
  module.handleAction = async (action, payload = {}) => { if (action === "filter-clear") { Object.keys(filters).forEach((key) => { filters[key] = key === "limit" ? "80" : ""; }); return { ok: true }; } return originalHandle(action, payload); };
  return module;
}
