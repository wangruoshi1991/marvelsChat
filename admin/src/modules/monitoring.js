import { createModule } from "./_module.js";
import { escapeHtml } from "../../admin-core.js";

const windows = [7, 30, 90];
const statusLabels = { queued: "排队中", running: "运行中", waiting_input: "等待输入", awaiting_confirmation: "等待确认", succeeded: "成功", failed: "失败", interrupted: "已中断", cancelling: "取消中", cancelled: "已取消" };

function number(value) { return value == null ? "未知" : new Intl.NumberFormat("zh-CN").format(Number(value)); }
function cost(value) { return value == null ? "未知" : `¥${(Number(value) / 100).toFixed(2)}`; }
function empty(label) { return `<div class="console-empty"><strong>暂无${label}</strong><p>服务端没有返回这个时间窗口的真实记录。</p></div>`; }

export function createMonitoringModule(client) {
  let days = 30;
  const module = createModule({
    name: "monitoring", title: "使用监控", permission: "audit:read", endpoint: () => `/api/admin/monitoring?days=${days}`, client,
    handleAction: async (action, payload = {}) => { if (action !== "window") throw new Error("监控操作无效。"); const next = Number(payload.days); if (!windows.includes(next)) throw new Error("监控时间窗口只支持 7、30 或 90 天。"); days = next; return { days }; },
    renderData(data) {
      const agents = Array.isArray(data?.agents) ? data.agents : [];
      const products = Array.isArray(data?.products) ? data.products : [];
      const users = Array.isArray(data?.users) ? data.users : [];
      const taskStatuses = Array.isArray(data?.taskStatuses) ? data.taskStatuses : [];
      const totalRuns = agents.reduce((sum, row) => sum + Number(row.runs || 0), 0);
      const succeeded = agents.reduce((sum, row) => sum + Number(row.succeeded || 0), 0);
      const failed = agents.reduce((sum, row) => sum + Number(row.failed || 0), 0);
      const totalCost = agents.some((row) => row.costCents != null) ? agents.reduce((sum, row) => sum + Number(row.costCents || 0), 0) : null;
      const tabs = `<div class="overview-controls"><div class="segmented-control" role="group" aria-label="监控时间窗口">${windows.map((window) => `<button type="button" class="${days === window ? "active" : ""}" data-module-action="window" data-days="${window}">${window} 天</button>`).join("")}</div><span>生成于 ${escapeHtml(data?.generatedAt || "--")} · 来源 PostgreSQL 聚合</span></div>`;
      const agentTable = agents.length ? `<div class="table-wrap"><table><thead><tr><th>Agent</th><th>运行</th><th>成功</th><th>失败</th><th>成功率</th><th>Token</th><th>成本</th><th>平均耗时</th></tr></thead><tbody>${agents.map((row) => { const runs = Number(row.runs || 0); const rate = runs ? `${Math.round(Number(row.succeeded || 0) / runs * 100)}%` : "未知"; return `<tr><td><strong>${escapeHtml(row.agentId || "--")}</strong></td><td>${number(runs)}</td><td>${number(row.succeeded || 0)}</td><td>${number(row.failed || 0)}</td><td><span class="status-pill ${runs && Number(row.failed || 0) / runs > .2 ? "error" : ""}">${rate}</span></td><td>${number(row.tokenTotal)}</td><td>${cost(row.costCents)}</td><td>${row.averageLatencyMs == null ? "未知" : `${number(row.averageLatencyMs)} ms`}</td></tr>`; }).join("")}</tbody></table></div>` : empty("Agent 运行聚合");
      const taskTable = taskStatuses.length ? `<div class="table-wrap"><table><thead><tr><th>任务状态</th><th>数量</th></tr></thead><tbody>${taskStatuses.map((row) => `<tr><td><span class="status-pill">${escapeHtml(statusLabels[row.status] || row.status || "未知")}</span></td><td>${number(row.count)}</td></tr>`).join("")}</tbody></table></div>` : empty("任务状态");
      const productTable = products.length ? `<div class="table-wrap"><table><thead><tr><th>产品</th><th>授权总数</th><th>启用授权</th></tr></thead><tbody>${products.map((row) => `<tr><td><strong>${escapeHtml(row.displayName || row.productKey || "--")}</strong><small>${escapeHtml(row.productKey || "")}</small></td><td>${number(row.entitlementCount)}</td><td>${number(row.enabledEntitlementCount)}</td></tr>`).join("")}</tbody></table></div>` : empty("产品授权");
      const userTable = users.length ? `<div class="table-wrap"><table><thead><tr><th>用户</th><th>运行</th><th>成功</th><th>失败</th><th>Token</th><th>成本</th></tr></thead><tbody>${users.slice(0, 100).map((row) => `<tr><td><code>${escapeHtml(row.userId || "--")}</code></td><td>${number(row.runs)}</td><td>${number(row.succeeded)}</td><td>${number(row.failed)}</td><td>${number(row.tokenTotal)}</td><td>${cost(row.costCents)}</td></tr>`).join("")}</tbody></table></div>` : empty("用户运行");
      return `<section class="module-header"><div><span>USAGE MONITORING</span><h2>使用监控</h2><p>按 Agent、产品、用户和任务状态查看真实运行量、成功率、延迟、Token、成本与授权分布。</p></div><button data-module-refresh="monitoring">刷新</button></section>${tabs}<section class="monitoring-summary"><div><span>窗口运行</span><strong>${number(totalRuns)}</strong></div><div><span>成功率</span><strong>${totalRuns ? `${Math.round(succeeded / totalRuns * 100)}%` : "未知"}</strong></div><div><span>失败运行</span><strong>${number(failed)}</strong></div><div><span>成本</span><strong>${cost(totalCost)}</strong></div></section><section class="page-section"><div class="section-heading"><div><h3>Agent 运行明细</h3><p>聚合来自 agent_runs；成本和 Token 缺失时显示未知。</p></div><span class="section-count">${agents.length} 个 Agent</span></div>${agentTable}</section><div class="monitoring-columns"><section class="page-section"><div class="section-heading"><div><h3>任务状态分布</h3><p>当前窗口内 ai_tasks 状态统计。</p></div></div>${taskTable}</section><section class="page-section"><div class="section-heading"><div><h3>产品授权分布</h3><p>产品 entitlement 总量与启用量。</p></div></div>${productTable}</section></div><section class="page-section"><div class="section-heading"><div><h3>用户运行排行</h3><p>按运行次数排序，最多展示服务端返回的 100 条。</p></div><span class="section-count">${users.length} 个用户</span></div>${userTable}</section>`;
    },
  });
  return module;
}
