import { createModule } from "./_module.js";
import { escapeHtml } from "../../admin-core.js";

const idempotencyKey = (field) => `admin-media-retrieval-${field}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

export function createMediaRetrievalModule(client) {
  let current = { controls: {} };
  const module = createModule({
    name: "media-retrieval", title: "媒体检索", permission: "agents:manage", endpoint: "/api/admin/media-retrieval/overview", client,
    handleAction: async (action) => {
      const fields = { "toggle-provider": ["providerCallsEnabled", "providerCallsEnabled"], "toggle-agent": ["operatorEnabled", "operatorEnabled"], "toggle-queue": ["queueEnabled", "queueEnabled"] };
      const pair = fields[action];
      if (!pair) throw new Error("媒体检索操作无效。");
      const [field, key] = pair;
      const value = !Boolean(current.controls?.[key]);
      return client("/api/admin/media-retrieval/controls", { method: "PATCH", headers: { "Idempotency-Key": idempotencyKey(field) }, body: JSON.stringify({ [field]: value }) });
    },
    renderData(data) {
      current = data || { controls: {} };
      const status = data?.runtimeStatus || {};
      const controls = data?.controls || {};
      const diagnostics = Array.isArray(data?.diagnostics) ? data.diagnostics : [];
      const runs = Array.isArray(data?.recentRuns) ? data.recentRuns : [];
      const agent = data?.agentCard || {};
      const rows = [["Agent", agent.displayName || agent.agentKey], ["运行状态", status.publicAvailability?.state || "未知"], ["队列", `${data?.queue?.queued ?? 0} 排队 / ${data?.queue?.running ?? 0} 运行`], ["就绪分段", data?.readySegments ?? "未知"], ["生命周期", controls.lifecycle || status.lifecycle || "未知"]];
      const controlButtons = `<div class="console-actions"><button type="button" data-module-action="toggle-agent">${controls.operatorEnabled ? "停用运营" : "启用运营"}</button><button type="button" data-module-action="toggle-provider">${controls.providerCallsEnabled ? "停用 Provider 调用" : "启用 Provider 调用"}</button><button type="button" data-module-action="toggle-queue">${controls.queueEnabled ? "停用索引队列" : "启用索引队列"}</button></div>`;
      const runTable = runs.length ? `<div class="table-wrap"><table><thead><tr><th>运行</th><th>类型</th><th>状态</th><th>时间</th></tr></thead><tbody>${runs.map((run) => `<tr><td>${escapeHtml(run.agentRunId || run.id || "--")}</td><td>${escapeHtml(run.runType || run.operation || "--")}</td><td>${escapeHtml(run.lifecycleStatus || run.status || "未知")}</td><td>${escapeHtml(run.createdAt || "--")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="console-empty">暂无媒体检索运行记录。</div>`;
      const diagnosticsHtml = diagnostics.length ? `<div class="table-wrap"><table><thead><tr><th>运行诊断</th><th>阶段</th><th>失败码</th><th>HTTP</th></tr></thead><tbody>${diagnostics.map((item) => `<tr><td>${escapeHtml(item.agentRunId || "--")}</td><td>${escapeHtml(item.operation || item.stage || "--")}</td><td>${escapeHtml(item.failureCode || "--")}</td><td>${escapeHtml(item.httpStatus ?? "--")}</td></tr>`).join("")}</tbody></table></div>` : `<div class="console-empty">暂无媒体检索运行诊断。</div>`;
      return `<section class="module-header"><div><span>MEDIA RETRIEVAL</span><h2>媒体检索</h2><p>只读运行状态、队列、预算和诊断；控制项仍由服务端权限和约束决定。</p></div><button data-module-refresh="media-retrieval">刷新</button></section><dl class="system-details">${rows.map(([label, value]) => `<div><dt>${escapeHtml(label || "未知")}</dt><dd>${escapeHtml(value ?? "未知")}</dd></div>`).join("")}</dl>${controlButtons}<h3 class="section-title">最近运行</h3>${runTable}<h3 class="section-title">媒体检索运行诊断</h3>${diagnosticsHtml}`;
    },
  });
  return module;
}
