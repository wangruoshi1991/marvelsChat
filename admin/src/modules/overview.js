import { createModule } from './_module.js';
export function createOverviewModule(client) {
  return createModule({ name: 'overview', title: '总览', permission: 'users:read', endpoint: '/api/admin/overview?days=7', client, renderData(data) {
    const metrics = data?.metrics || data || {};
    const cards = Object.entries(metrics)
      .filter(([, value]) => value === null || ["string", "number", "boolean"].includes(typeof value))
      .slice(0, 12)
      .map(([label, value]) => ({ label, value: value ?? '未知' }));
    return `<section class="module-header"><div><span>OPERATIONS</span><h2>运营总览</h2><p>来自真实数据库的 7 天窗口；指标缺失时保留空态。</p></div><button data-module-refresh="overview">刷新</button></section>${createModule({}).renderEmpty ? '' : ''}<section class="metric-grid">${cards.length ? cards.map((item) => `<article class="metric-card"><span>${item.label}</span><b>${item.value}</b></article>`).join('') : '<div class="console-empty">暂无真实指标。</div>'}</section>`;
  }});
}
