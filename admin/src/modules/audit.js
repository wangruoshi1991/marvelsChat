import { createModule } from "./_module.js";
import { escapeHtml } from "../../admin-core.js";

export function createAuditModule(client) {
  const filters = { query: "" };
  const module = createModule({
    name: "audit", title: "审计记录", permission: "audit:read", endpoint: "/api/admin/events?limit=200", client,
    handleAction: async (action, payload = {}) => { if (action !== "filter") throw new Error("审计筛选操作无效。"); filters.query = String(payload.query || "").trim().toLowerCase(); return { ok: true }; },
    renderData(data) {
      const all = Array.isArray(data) ? data : data?.items || [];
      const rows = all.filter((event) => !filters.query || [event.action, event.eventType, event.actorId, event.targetType, event.targetId, event.result, event.requestId].filter(Boolean).join(" ").toLowerCase().includes(filters.query));
      const toolbar = `<form class="module-toolbar" data-module-filter="audit"><label>搜索<input name="query" value="${escapeHtml(filters.query)}" placeholder="动作、操作者、目标或请求 ID" /></label><button type="submit">应用筛选</button><button type="button" data-module-action="filter-clear">清空</button></form>`;
      const body = rows.map((event) => `<tr><td>${escapeHtml(event.action || event.eventType || "--")}</td><td>${escapeHtml(event.actorId || event.userId || "--")}</td><td>${escapeHtml([event.targetType, event.targetId].filter(Boolean).join(" /") || "--")}</td><td>${escapeHtml(event.result || "--")}</td><td><code>${escapeHtml(event.requestId || "--")}</code></td><td>${escapeHtml(event.createdAt || "--")}</td></tr>`).join("");
      return `<section class="module-header"><div><span>AUDIT TRAIL</span><h2>审计记录</h2><p>显示后台管理动作、操作者、结果和请求 ID；payload 不在列表中展开。</p></div><button data-module-refresh="audit">刷新</button></section>${toolbar}<div class="table-wrap"><table><thead><tr><th>动作</th><th>操作者</th><th>目标</th><th>结果</th><th>请求 ID</th><th>时间</th></tr></thead><tbody>${body || `<tr><td colspan="6"><div class="console-empty">暂无匹配审计记录。</div></td></tr>`}</tbody></table></div>`;
    },
  });
  const originalHandle = module.handleAction.bind(module);
  module.handleAction = async (action, payload = {}) => { if (action === "filter-clear") { filters.query = ""; return { ok: true }; } return originalHandle(action, payload); };
  return module;
}
