import { createModule, agentIdentityCard } from "./_module.js";
import { escapeHtml } from "../../admin-core.js";

const idempotencyKey = (action, id) => `admin-agent-release-${action}-${id}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
const statusLabels = { draft: "草稿", review: "审核中", published: "已发布", unpublished: "已下架", archived: "已归档" };

function lifecycle(status, identity, readiness) {
  const identityReady = Boolean(identity?.key && identity?.displayName && identity?.description && identity?.mark && identity?.shape && identity?.colors);
  const steps = [
    ["registered", "已注册", true],
    ["identity", "身份完整", identityReady],
    ["ready", "配置就绪", Boolean(readiness?.ready)],
    ["review", "已审核", ["review", "published"].includes(status)],
    ["published", "已发布", status === "published"],
  ];
  return `<div class="release-lifecycle" aria-label="Agent release 上线流程">${steps.map(([, label, done], index) => `<div class="release-step ${done ? "done" : ""}"><i>${done ? "✓" : index + 1}</i><span>${label}</span></div>`).join('<b aria-hidden="true">→</b>')}</div>`;
}

export function createAgentsModule(client) {
  const filters = { status: "", query: "" };
  const module = createModule({
    name: "agents", title: "Agent 中心", permission: "agents:manage", endpoint: "/api/admin/agent-releases", client,
    handleAction: async (action, payload = {}) => {
      if (action === "filter") { filters.status = String(payload.status || ""); filters.query = String(payload.query || "").trim().toLowerCase(); return { ok: true }; }
      if (action === "identity-save") {
        let identity;
        try { identity = JSON.parse(payload.identity || "{}"); } catch { throw new Error("Agent identity JSON 格式无效。"); }
        if (!identity || typeof identity !== "object" || Array.isArray(identity)) throw new Error("Agent identity 必须是 JSON 对象。");
        if (!payload.releaseId) throw new Error("Agent release 操作缺少 release ID。");
        return client(`/api/admin/agent-releases/${encodeURIComponent(payload.releaseId)}/identity`, { method: "PATCH", headers: { "Idempotency-Key": idempotencyKey("identity", payload.releaseId) }, body: JSON.stringify(identity) });
      }
      const releaseId = payload.releaseId;
      if (!releaseId || !["review", "publish"].includes(action)) throw new Error("Agent release 操作参数无效。");
      return client(`/api/admin/agent-releases/${encodeURIComponent(releaseId)}/${action}`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey(action, releaseId) } });
    },
    renderData(data) {
      const all = Array.isArray(data) ? data : data?.items || [];
      const rows = all.filter((release) => { const text = [release.agentKey, release.version, release.identity?.displayName].filter(Boolean).join(" ").toLowerCase(); return (!filters.status || release.catalogStatus === filters.status) && (!filters.query || text.includes(filters.query)); });
      const toolbar = `<form class="module-toolbar" data-module-filter="agents"><label>搜索<input name="query" value="${escapeHtml(filters.query)}" placeholder="Agent key、版本或名称" /></label><label>状态<select name="status"><option value="">全部状态</option>${Object.entries(statusLabels).map(([key, value]) => `<option value="${key}" ${filters.status === key ? "selected" : ""}>${value}</option>`).join("")}</select></label><button type="submit">应用筛选</button><button type="button" data-module-action="filter-clear">清空</button></form>`;
      const cards = rows.map((release) => {
        const status = release.catalogStatus || "unknown";
        const canReview = status === "draft" || status === "unpublished";
        const canPublish = status === "review" || status === "unpublished";
        const actions = `${canReview ? `<button type="button" data-module-action="review" data-release-id="${escapeHtml(release.id)}">提交审核</button>` : ""}${canPublish ? `<button type="button" data-module-action="publish" data-release-id="${escapeHtml(release.id)}">发布 release</button>` : ""}`;
        const missing = (release.readiness?.missing || []).join(", ") || "合同检查未完成";
        const identityJson = JSON.stringify(release.identity || {}, null, 2);
        return `<article class="release-card"><div class="release-card-main">${agentIdentityCard({ ...release, name: release.identity?.displayName || release.agentKey, description: release.identity?.description || "", identity: release.identity })}<div class="release-meta"><span class="status-pill ${status === "published" ? "" : status === "review" ? "" : "warning"}">${escapeHtml(statusLabels[status] || status)}</span><strong>${escapeHtml(release.agentKey || "--")} <small>v${escapeHtml(release.version || "--")}</small></strong><span class="release-contract">contract <code>${escapeHtml(release.contractHash || "缺失")}</code></span></div></div>${lifecycle(status, release.identity, release.readiness)}<div class="release-contract-grid"><div><span>声明权限</span><strong>${escapeHtml(Array.isArray(release.declaredScopes) ? release.declaredScopes.length : 0)} 项</strong><small>${escapeHtml(Array.isArray(release.declaredScopes) ? release.declaredScopes.join(", ") || "未声明" : "未知")}</small></div><div><span>配置就绪</span><strong class="${release.readiness?.ready ? "text-success" : "text-danger"}">${release.readiness?.ready ? "通过" : "未通过"}</strong><small>${release.readiness?.ready ? "可以提交审核" : escapeHtml(missing)}</small></div><div><span>发布时间</span><strong>${escapeHtml(release.publishedAt || "--")}</strong><small>更新时间 ${escapeHtml(release.updatedAt || "--")}</small></div></div><div class="console-actions release-actions">${actions || "<span>当前状态无需操作</span>"}</div><details class="release-editor"><summary>编辑发布身份</summary><p>只允许提交完整的 AgentIdentity。已发布 release 不可修改，需由代码版本生成新 release。</p><form data-module-form="identity-save" data-release-id="${escapeHtml(release.id)}" data-required-permission="agents:manage"><textarea name="identity" rows="12" spellcheck="false">${escapeHtml(identityJson)}</textarea><button type="submit">保存 identity</button></form></details></article>`;
      }).join("");
      return `<section class="module-header"><div><span>AGENT RELEASE CENTER</span><h2>Agent 中心</h2><p>从代码注册到产品可用，后台按身份、就绪、审核、发布五道闸门管理 release。</p></div><button data-module-refresh="agents">刷新</button></section><section class="page-section release-guide"><div class="section-heading"><div><h3>Agent 上线流程</h3><p>注册只代表代码能力存在；只有 release 发布、产品发布和用户 consent 完成后，App 才能消费。</p></div><span class="section-count">${rows.length} 个 release</span></div><div class="release-flow-copy"><span>代码 registry</span><b>→</b><span>identity</span><b>→</b><span>readiness</span><b>→</b><span>review</span><b>→</b><span>release publish</span><b>→</b><span>product publish</span><b>→</b><span>user consent</span></div></section>${toolbar}<div class="identity-grid release-grid">${cards || '<div class="console-empty">暂无匹配 Agent release。</div>'}</div>`;
    },
  });
  const originalHandle = module.handleAction.bind(module);
  module.handleAction = async (action, payload = {}) => { if (action === "filter-clear") { filters.status = ""; filters.query = ""; return { ok: true }; } return originalHandle(action, payload); };
  return module;
}
