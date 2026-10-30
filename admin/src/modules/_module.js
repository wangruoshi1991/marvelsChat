import { dataTable } from "../components/data-table.js";
import { metricGrid } from "../components/metric-grid.js";
import { agentIdentityCard } from "../components/agent-identity-card.js";
import { escapeHtml, friendlyAdminErrorMessage } from "../../admin-core.js";

export function createModule({ name, title, permission, actionPermission = null, endpoint, client, columns = [], metrics = [], renderData, handleAction } = {}) {
  let state = { status: "idle", data: null, error: null };
  let query = {};
  const module = {
    name, title, permission, actionPermission,
    get query() { return { ...query }; },
    setQuery(next = {}) { query = { ...next }; return module.query; },
    async load(options = {}) {
      if (options.query) {
        if (typeof options.query === "string") query = Object.fromEntries(new URLSearchParams(options.query.replace(/^\?/, "")));
        else query = { ...options.query };
      }
      state = { status: "loading", data: null, error: null };
      try {
        const path = typeof endpoint === "function" ? endpoint(query) : endpoint;
        state = { status: "ready", data: await client(path), error: null };
      }
      catch (error) { state = { status: "error", data: null, error }; }
      return state;
    },
    render() {
      if (state.status === "error") return module.renderError(state.error);
      if (state.status !== "ready") return '<div class="console-loading">正在读取真实数据…</div>';
      if (renderData) return renderData(state.data);
      const items = Array.isArray(state.data) ? state.data : state.data?.items || state.data?.rows || [];
      if (!items.length && !metrics.length) return module.renderEmpty();
      return `${metrics.length ? metricGrid(typeof metrics === "function" ? metrics(state.data) : metrics) : ""}${dataTable({ columns, rows: items })}`;
    },
    renderError(error) { return `<div class="console-state console-error"><strong>模块读取失败</strong><p>${escapeHtml(friendlyAdminErrorMessage(error, { fallback: "后台数据暂不可用，请稍后重试。" }))}</p>${error?.requestId ? `<small>请求 ID：${escapeHtml(error.requestId)} · 请联系维护人员并提供此 ID</small>` : ""}</div>`; },
    renderEmpty() { return '<div class="console-state console-empty"><strong>暂无真实数据</strong><p>数据库没有可展示的记录，后台不会生成演示数据。</p></div>'; },
    async refresh() { return module.load(); },
    async handleAction(action, payload) {
      if (typeof handleAction !== "function") throw new Error("此模块没有可执行操作。");
      return handleAction(action, payload);
    },
  };
  return module;
}

export { agentIdentityCard };
