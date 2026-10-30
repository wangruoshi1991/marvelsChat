import { createModule } from './_module.js';
import { escapeHtml } from '../../admin-core.js';

const windows = [7, 30, 90];
const metricLabels = {
  usersTotal: '用户总数', activeUsers: '窗口活跃用户', threadsTotal: '会话总数', messages: '窗口消息', agentRuns: 'Agent 运行',
  aiTasks: '窗口任务', aiTasksActive: '进行中任务', workspaces: '工作区', workspacesActive: '运行中工作区', succeeded: '成功运行', failed: '失败运行',
};
const roleLabels = { admin: '管理员', user: '普通用户' };
const statusLabels = { active: '启用', disabled: '停用' };

function number(value) { return value == null ? '未知' : new Intl.NumberFormat('zh-CN').format(Number(value)); }

function trendChart(rows = []) {
  if (!rows.length) return '<div class="console-empty"><strong>暂无趋势数据</strong><p>服务端没有返回这个时间窗口的每日运行记录。</p></div>';
  const max = Math.max(...rows.map((row) => Math.max(Number(row.runs || 0), Number(row.tasks || 0))), 1);
  const bars = rows.map((row) => {
    const runs = Number(row.runs || 0);
    const tasks = Number(row.tasks || 0);
    const day = String(row.day || '').slice(5);
    return `<div class="trend-column" title="${escapeHtml(row.day || '')}：Agent ${runs}，任务 ${tasks}"><div class="trend-bars"><i class="trend-bar trend-bar-runs" style="height:${Math.max(4, Math.round(runs / max * 100))}%"></i><i class="trend-bar trend-bar-tasks" style="height:${Math.max(4, Math.round(tasks / max * 100))}%"></i></div><span>${escapeHtml(day)}</span></div>`;
  }).join('');
  return `<div class="trend-chart" role="img" aria-label="每日 Agent 运行和任务趋势"><div class="trend-legend"><span><i class="trend-key trend-key-runs"></i>Agent 运行</span><span><i class="trend-key trend-key-tasks"></i>任务</span></div><div class="trend-plot">${bars}</div></div>`;
}

function dailyTable(rows = []) {
  if (!rows.length) return '<div class="console-empty">暂无每日明细。</div>';
  return `<div class="table-wrap"><table><thead><tr><th>日期</th><th>Agent 运行</th><th>成功</th><th>失败</th><th>任务</th><th>成功率</th></tr></thead><tbody>${rows.map((row) => {
    const runs = Number(row.runs || 0); const success = Number(row.succeeded || 0); const rate = runs ? `${Math.round(success / runs * 100)}%` : '未知';
    return `<tr><td>${escapeHtml(row.day || '--')}</td><td>${number(runs)}</td><td>${number(success)}</td><td>${number(row.failed || 0)}</td><td>${number(row.tasks || 0)}</td><td><span class="status-pill ${runs && success / runs < .8 ? 'error' : ''}">${rate}</span></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

function recentUsersTable(rows = []) {
  if (!rows.length) return '<div class="console-empty">暂无最近账号。</div>';
  return `<div class="table-wrap"><table><thead><tr><th>账号</th><th>邮箱</th><th>角色</th><th>状态</th><th>最近登录</th><th>创建时间</th></tr></thead><tbody>${rows.map((user) => `<tr><td><strong>${escapeHtml(user.displayName || '--')}</strong><small>${escapeHtml(user.aiId || user.id || '')}</small></td><td>${escapeHtml(user.email || user.phoneNumber || '--')}</td><td>${escapeHtml(roleLabels[user.role] || user.role || '未知')}</td><td><span class="status-pill ${user.status === 'active' ? '' : 'error'}">${escapeHtml(statusLabels[user.status] || user.status || '未知')}</span></td><td>${escapeHtml(user.lastLoginAt || '--')}</td><td>${escapeHtml(user.createdAt || '--')}</td></tr>`).join('')}</tbody></table></div>`;
}

export function createOverviewModule(client) {
  let days = 7;
  return createModule({
    name: 'overview', title: '总览', permission: 'users:read', endpoint: () => `/api/admin/overview?days=${days}`, client,
    handleAction: async (action, payload = {}) => {
      if (action !== 'window') throw new Error('总览操作无效。');
      const next = Number(payload.days);
      if (!windows.includes(next)) throw new Error('总览时间窗口只支持 7、30 或 90 天。');
      days = next;
      return { days };
    },
    renderData(data) {
      const metrics = data?.metrics || {};
      const cards = Object.entries(metrics).filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value)).map(([label, value]) => ({ label: metricLabels[label] || label, value: value == null ? '未知' : number(value) }));
      const freshness = data?.freshness || {};
      const window = data?.window || {};
      const tabs = `<div class="overview-controls"><div class="segmented-control" role="group" aria-label="总览时间窗口">${windows.map((item) => `<button type="button" class="${Number(window.days || days) === item ? 'active' : ''}" data-module-action="window" data-days="${item}">${item} 天</button>`).join('')}</div><span>数据源：${escapeHtml(freshness.source || '未知')} · 生成于 ${escapeHtml(freshness.generatedAt || '--')}</span></div>`;
      return `<section class="module-header"><div><span>OPERATIONS OVERVIEW</span><h2>运营总览</h2><p>这里展示窗口摘要、每日明细、最近账号和服务端数据新鲜度；图表只使用服务端返回的数据。</p></div><button data-module-refresh="overview">刷新</button></section>${tabs}<section class="metric-grid overview-metrics">${cards.length ? cards.map((item) => `<article class="metric-card"><span>${escapeHtml(item.label)}</span><b>${escapeHtml(item.value)}</b></article>`).join('') : '<div class="console-empty">暂无真实指标。</div>'}</section><section class="page-section"><div class="section-heading"><div><h3>运行趋势</h3><p>按天比较 Agent runs 与 AI tasks，支持下钻到运营中心。</p></div><button type="button" class="text-link" data-section-route="monitoring">查看使用监控 →</button></div>${trendChart(data?.daily || [])}</section><section class="page-section"><div class="section-heading"><div><h3>每日运行明细</h3><p>成功率以每日 Agent runs 为分母；缺少记录时保留未知。</p></div><span class="section-count">${(data?.daily || []).length} 天</span></div>${dailyTable(data?.daily || [])}</section><section class="page-section"><div class="section-heading"><div><h3>最近账号</h3><p>最近创建的账号摘要，完整资料和权限请进入账户中心。</p></div><button type="button" class="text-link" data-section-route="accounts">进入账户中心 →</button></div>${recentUsersTable(data?.recentUsers || [])}</section>`;
    },
  });
}
