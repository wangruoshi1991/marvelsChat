import { dataTable } from "../components/data-table.js";
import { metricGrid } from "../components/metric-grid.js";
import { agentIdentityCard } from "../components/agent-identity-card.js";

export function createModule({ name, title, permission, endpoint, client, columns = [], metrics = [], renderData } = {}) {
  let state = { status: "idle", data: null, error: null };
  const module = {
    name, title, permission,
    async load() {
      state = { status: "loading", data: null, error: null };
      try { state = { status: "ready", data: await client(endpoint), error: null }; }
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
    renderError(error) { return `<div class="console-state console-error"><strong>模块读取失败</strong><p>${error?.message || "服务端返回了错误。"}</p>${error?.requestId ? `<small>请求 ID：${error.requestId}</small>` : ""}</div>`; },
    renderEmpty() { return '<div class="console-state console-empty"><strong>暂无真实数据</strong><p>数据库没有可展示的记录，后台不会生成演示数据。</p></div>'; },
    async refresh() { return module.load(); },
  };
  return module;
}

export { agentIdentityCard };
