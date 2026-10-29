export function metricGrid(metrics = []) {
  if (!metrics.length) return '<div class="metric-grid"><div class="console-empty">暂无真实指标。</div></div>';
  return `<section class="metric-grid">${metrics.map(({ label, value, hint }) => `<article class="metric-card"><span>${label}</span><b>${value ?? "未知"}</b>${hint ? `<small>${hint}</small>` : ""}</article>`).join("")}</section>`;
}
