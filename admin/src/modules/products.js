import { createModule } from "./_module.js";
import { escapeHtml } from "../../admin-core.js";

const statuses = ["draft", "review", "published", "paused", "retired"];
const statusLabels = { draft: "草稿", review: "审核中", published: "已发布", paused: "已暂停", retired: "已退役" };
const actionForStatus = { draft: ["submit"], review: ["publish"], published: ["pause"], paused: ["publish"] };
const idempotencyKey = (action, id) => `admin-product-${action}-${id}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;

export function createProductsModule(client) {
  const filters = { status: "", query: "" };
  const module = createModule({
    name: "products", title: "产品发布", permission: "products:read", actionPermission: "products:write", endpoint: "/api/admin/products", client,
    handleAction: async (action, payload = {}) => {
      if (action === "filter") { filters.status = String(payload.status || ""); filters.query = String(payload.query || "").trim().toLowerCase(); return { ok: true }; }
      if (action === "create") {
        if (!payload.body) throw new Error("产品创建需要完整发布合同。");
        const value = typeof payload.body === "string" ? JSON.parse(payload.body) : payload.body;
        return client("/api/admin/products", { method: "POST", body: JSON.stringify({ ...value, status: "draft" }), headers: { "Idempotency-Key": idempotencyKey("create", value.productKey || "new") } });
      }
      const productId = payload.productId;
      if (!productId || !["submit", "publish", "pause"].includes(action)) throw new Error("产品操作参数无效。");
      return client(`/api/admin/products/${encodeURIComponent(productId)}/${action}`, { method: "POST", headers: { "Idempotency-Key": idempotencyKey(action, productId) } });
    },
    renderData(data) {
      const all = Array.isArray(data) ? data : data?.items || [];
      const rows = all.filter((row) => (!filters.status || row.status === filters.status) && (!filters.query || [row.productKey, row.displayName, row.version].filter(Boolean).join(" ").toLowerCase().includes(filters.query)));
      const toolbar = `<form class="module-toolbar" data-module-filter="products"><label>搜索<input name="query" value="${escapeHtml(filters.query)}" placeholder="产品 key、名称或版本" /></label><label>状态<select name="status"><option value="">全部状态</option>${statuses.map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${statusLabels[status]}</option>`).join("")}</select></label><button type="submit">应用筛选</button><button type="button" data-module-action="filter-clear">清空</button></form>`;
      const createForm = `<details class="module-create"><summary>创建产品草稿</summary><p>产品创建必须提交完整 identity 和依赖合同；后台不会生成默认 Agent 或示例依赖。</p><form data-module-form="create" data-required-permission="products:write"><label>产品 JSON 合同<textarea name="body" rows="8" placeholder='{"productKey":"example","version":"1.0.0","displayName":"名称","description":"完整描述","identity":{},"supportedPlatforms":["ios"],"dependencies":[]}'></textarea></label><button type="submit">创建草稿</button></form></details>`;
      const body = rows.map((row) => { const actions = (actionForStatus[row.status] || []).map((action) => `<button type="button" data-module-action="${action}" data-product-id="${escapeHtml(row.id)}">${action === "submit" ? "提交审核" : action === "publish" ? "发布" : "暂停"}</button>`).join(""); const dependencies = Array.isArray(row.dependencies) ? row.dependencies : []; const platforms = Array.isArray(row.supportedPlatforms) ? row.supportedPlatforms.join(", ") : "--"; const gatesPassed = dependencies.length > 0 && dependencies.every((dependency) => dependency.releaseStatus === "published" && dependency.readiness?.ready === true && dependency.registryVersion === dependency.version && dependency.registryStatus === "registered" && dependency.contractHash); const dependencySummary = dependencies.length ? dependencies.map((dependency) => `<div class="dependency-row"><strong>${escapeHtml(dependency.agentKey || "--")}</strong><span>v${escapeHtml(dependency.version || "--")}</span><span class="status-pill ${dependency.releaseStatus === "published" && dependency.readiness?.ready ? "" : "error"}">${escapeHtml(dependency.releaseStatus || "未知")}</span><small>${dependency.readiness?.ready ? "就绪" : "未就绪"} · registry ${dependency.registryVersion === dependency.version && dependency.registryStatus === "registered" ? "当前" : "过期"}</small></div>`).join("") : "<span>未绑定 Agent</span>"; const detail = `<details class="table-inline-details"><summary>${dependencies.length} 个依赖 · ${gatesPassed ? "门禁通过" : "需要处理"}</summary><div>${dependencySummary}</div></details>`; return `<tr><td><strong>${escapeHtml(row.productKey || "--")}</strong><small>${escapeHtml(row.id || "")}</small></td><td>${escapeHtml(row.displayName || "--")}</td><td>${escapeHtml(row.version || "--")}</td><td><span class="status-pill ${row.status === "published" ? "" : row.status === "review" ? "" : "warning"}">${escapeHtml(statusLabels[row.status] || row.status || "未知")}</span></td><td>${escapeHtml(platforms)}</td><td>${detail}</td><td><code>${escapeHtml(row.contractHash ? row.contractHash.slice(0, 12) : "缺失")}</code></td><td><div class="console-actions">${actions || "<span>当前状态无需操作</span>"}</div></td></tr>`; }).join("");
      return `<section class="module-header"><div><span>PRODUCT RELEASE</span><h2>产品发布</h2><p>产品版本必须绑定已发布、就绪且合同完整的 Agent release；发布后 App 才能发现，用户仍需明确 consent。</p></div><button data-module-refresh="products">刷新</button></section><section class="page-section release-guide"><div class="section-heading"><div><h3>产品上架门禁</h3><p>创建草稿 → 提交审核 → 校验依赖 release / registry / identity → 发布产品 → bootstrap/sync 投影 → 用户授权。</p></div><span class="section-count">${rows.length} 个版本</span></div><div class="release-flow-copy"><span>draft</span><b>→</b><span>review</span><b>→</b><span>published</span><b>→</b><span>App catalog</span><b>→</b><span>user consent</span></div></section>${toolbar}${createForm}<div class="table-wrap"><table><thead><tr><th>产品</th><th>名称</th><th>版本</th><th>状态</th><th>平台</th><th>依赖与门禁</th><th>合同</th><th>操作</th></tr></thead><tbody>${body || `<tr><td colspan="8"><div class="console-empty">暂无匹配产品版本。</div></td></tr>`}</tbody></table></div>`;
    },
  });
  const originalHandle = module.handleAction.bind(module);
  module.handleAction = async (action, payload = {}) => { if (action === "filter-clear") { filters.status = ""; filters.query = ""; return { ok: true }; } return originalHandle(action, payload); };
  return module;
}
