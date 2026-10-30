import { friendlyAdminErrorMessage, shouldClearAdminSession } from "../admin-core.js";
import { createApiClient } from "./api-client.js";
import { createRouter } from "./router.js";
import { hasPermission, visibleModules } from "./permissions.js";
import { createOverviewModule } from "./modules/overview.js";
import { createAccountsModule } from "./modules/accounts.js";
import { createAgentsModule } from "./modules/agents.js";
import { createProductsModule } from "./modules/products.js";
import { createTasksModule } from "./modules/tasks.js";
import { createMonitoringModule } from "./modules/monitoring.js";
import { createAuditModule } from "./modules/audit.js";
import { createSystemModule } from "./modules/system.js";
import { createMediaRetrievalModule } from "./modules/media-retrieval.js";
import { DEFAULT_LOCAL_API_ORIGIN } from "./runtime-config.js";

const root = document.querySelector("#admin-root");
const authStorageKey = "miaoxun.admin.auth.v1";
const apiOrigin = typeof __MIAOXUN_ADMIN_API_TARGET__ === "string" && __MIAOXUN_ADMIN_API_TARGET__ ? __MIAOXUN_ADMIN_API_TARGET__ : (window.location.protocol === "file:" ? DEFAULT_LOCAL_API_ORIGIN : "");
let auth = readAuth();
let activeModule;
let modules;

function readAuth() { try { return JSON.parse(sessionStorage.getItem(authStorageKey) || "{}"); } catch { return {}; } }
function saveAuth(value) { auth = value; sessionStorage.setItem(authStorageKey, JSON.stringify(value)); }
function clearAuth() { auth = {}; sessionStorage.removeItem(authStorageKey); }
function status(message, kind = "") { const element = document.querySelector("#console-status"); if (element) { element.textContent = message; element.dataset.kind = kind; } }

const api = createApiClient({ baseOrigin: apiOrigin, getToken: () => auth.token });

function shellMarkup() {
  return `<section class="console-login" id="console-login"><div class="console-login-brand"><div class="console-logo console-logo-large" aria-hidden="true">妙</div><span class="console-login-kicker">MARVELSCHAT OPERATIONS</span><h1>妙讯运营后台</h1><p>统一管理账号、Agent release、产品目录和运行状态。所有数据来自服务端，操作会留下审计记录。</p><div class="console-login-points"><span><b>01</b>真实数据</span><span><b>02</b>权限隔离</span><span><b>03</b>可追溯操作</span></div><small id="console-api-status">API：${apiOrigin || window.location.origin}</small></div><form id="console-login-form"><div class="console-form-heading"><strong>登录控制台</strong><span>管理员账号</span></div><label for="console-identifier">账号 / 手机号 / 邮箱</label><input id="console-identifier" required autocomplete="username" placeholder="请输入管理员账号" /><label for="console-password">密码</label><input id="console-password" required type="password" autocomplete="current-password" placeholder="请输入密码" /><button type="submit">进入后台 <span aria-hidden="true">→</span></button><small>登录后仅显示当前账号有权限访问的模块。</small></form></section><section class="console-app hidden" id="console-app"><div class="console-sidebar-backdrop hidden" id="console-sidebar-backdrop"></div><aside class="console-sidebar" id="console-sidebar"><div class="console-brand"><div class="console-brand-mark console-logo" aria-hidden="true">妙</div><div><span>MARVELSCHAT OPS</span><strong>妙讯运营后台</strong></div><small>真实数据运营中心</small></div><nav id="console-nav" aria-label="后台模块"></nav><div class="console-sidebar-footer"><div class="console-admin-profile"><div class="console-admin-avatar" id="console-admin-avatar">管</div><div><strong id="console-admin-name">未登录</strong><small>后台管理员</small></div></div><button id="console-logout" type="button" aria-label="退出后台">退出</button></div></aside><section class="console-main"><header class="console-topbar"><div class="console-topbar-leading"><button class="console-menu-toggle" id="console-menu-toggle" type="button" aria-label="打开后台导航" aria-expanded="false">☰</button><div><div class="console-breadcrumb" id="console-breadcrumb" aria-label="当前位置"></div><span id="console-environment">环境：${window.location.hostname || "本地"}</span><h1 id="console-title">总览</h1></div></div><div class="console-top-actions"><span class="console-live-indicator"><i aria-hidden="true"></i> 实时服务</span><span id="console-refresh-time"></span><button id="console-refresh" type="button"><span aria-hidden="true">↻</span> 刷新</button></div></header><p class="console-status" id="console-status" role="status">正在检查登录状态…</p><main id="console-content"></main></section></section>`;
}

function renderNav() {
  const labels = { overview: ["工作台", "运营指标与系统状态"], accounts: ["账户中心", "用户、角色与授权"], agents: ["发布中心", "Agent release、产品与目录"], products: ["发布中心", "Agent release、产品与目录"], "media-retrieval": ["发布中心", "Agent release、产品与目录"], tasks: ["运营中心", "任务队列与执行控制"], monitoring: ["运营中心", "任务队列与执行控制"], audit: ["系统中心", "审计、配置与安全"], system: ["系统中心", "审计、配置与安全"] };
  const icons = {
    overview: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>',
    accounts: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="3"/><path d="M5 20a7 7 0 0 1 14 0M19 7h2v4M20 10h-2"/></svg>',
    publishing: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.2 5.5L20 11l-5.8 2.5L12 19l-2.2-5.5L4 11l5.8-2.5z"/><path d="m19 4 .6 1.4L21 6l-1.4.6L19 8l-.6-1.4L17 6l1.4-.6z"/></svg>',
    operations: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4v16M17 4v16M4 7h6M14 17h6"/><circle cx="7" cy="11" r="2"/><circle cx="17" cy="13" r="2"/></svg>',
    system: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg>',
  };
  const groups = [
    { key: "overview", label: "工作台", description: "运营指标与系统状态", children: ["overview"] },
    { key: "accounts", label: "账户中心", description: "用户、角色与授权", children: ["accounts"] },
    { key: "publishing", label: "发布中心", description: "Agent、产品与目录", children: ["agents", "products", "media-retrieval"] },
    { key: "operations", label: "运营中心", description: "任务队列与运行监控", children: ["tasks", "monitoring"] },
    { key: "system", label: "系统中心", description: "审计、配置与安全", children: ["audit", "system"] },
  ];
  const allowed = visibleModules(auth.user);
  document.querySelector("#console-nav").innerHTML = groups.map((group) => {
    const visible = group.children.filter((name) => allowed.includes(name));
    if (!visible.length) return "";
    const active = visible.includes(activeModule);
    const destination = visible[0];
    return `<div class="console-nav-group"><button type="button" data-route="${destination}" title="${group.label}" class="${active ? "active" : ""}" aria-current="${active ? "page" : "false"}"><span class="console-nav-icon">${icons[group.key]}</span><span class="console-nav-copy"><span>${group.label}</span><small>${group.description}</small></span><span class="console-nav-arrow" aria-hidden="true">›</span></button></div>`;
  }).join("") || '<p class="console-empty">当前账号没有可用后台权限。</p>';
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => { closeSidebar(); router.navigate(button.dataset.route); }));
}

function closeSidebar() {
  document.querySelector("#console-sidebar")?.classList.remove("open");
  document.querySelector("#console-sidebar-backdrop")?.classList.add("hidden");
  document.querySelector("#console-menu-toggle")?.setAttribute("aria-expanded", "false");
}

function openSidebar() {
  document.querySelector("#console-sidebar")?.classList.add("open");
  document.querySelector("#console-sidebar-backdrop")?.classList.remove("hidden");
  document.querySelector("#console-menu-toggle")?.setAttribute("aria-expanded", "true");
}

const sectionDefinitions = {
  overview: { label: "工作台", items: [{ name: "overview", label: "总览" }] },
  accounts: { label: "账户中心", items: [{ name: "accounts", label: "账号与权限" }] },
  agents: { label: "发布中心", items: [{ name: "agents", label: "Agent release" }, { name: "products", label: "产品目录" }, { name: "media-retrieval", label: "媒体检索" }] },
  products: { label: "发布中心", items: [{ name: "agents", label: "Agent release" }, { name: "products", label: "产品目录" }, { name: "media-retrieval", label: "媒体检索" }] },
  "media-retrieval": { label: "发布中心", items: [{ name: "agents", label: "Agent release" }, { name: "products", label: "产品目录" }, { name: "media-retrieval", label: "媒体检索" }] },
  tasks: { label: "运营中心", items: [{ name: "tasks", label: "任务运营" }, { name: "monitoring", label: "使用监控" }] },
  monitoring: { label: "运营中心", items: [{ name: "tasks", label: "任务运营" }, { name: "monitoring", label: "使用监控" }] },
  audit: { label: "系统中心", items: [{ name: "audit", label: "审计记录" }, { name: "system", label: "服务配置" }] },
  system: { label: "系统中心", items: [{ name: "audit", label: "审计记录" }, { name: "system", label: "服务配置" }] },
};

function renderSectionNav(name) {
  const section = sectionDefinitions[name];
  if (!section) return "";
  const allowed = new Set(visibleModules(auth.user));
  const items = section.items.filter((item) => allowed.has(item.name));
  if (items.length <= 1) return `<div class="console-section-context"><span>${section.label}</span></div>`;
  return `<nav class="console-section-nav" aria-label="${section.label}子导航"><div class="console-section-nav-heading"><strong>${section.label}</strong><small>选择一个资源继续管理</small></div><div class="console-section-tabs">${items.map((item) => `<button type="button" data-section-route="${item.name}" class="${item.name === name ? "active" : ""}" aria-current="${item.name === name ? "page" : "false"}">${item.label}</button>`).join("")}</div></nav>`;
}

function renderModuleState(module) {
  const content = document.querySelector("#console-content");
  document.querySelector("#console-title").textContent = module.title;
  content.innerHTML = `${renderSectionNav(module.name)}<div class="console-page" data-page="${module.name}">${module.render()}</div>`;
  content.querySelectorAll("[data-section-route]").forEach((button) => button.addEventListener("click", () => router.navigate(button.dataset.sectionRoute)));
  content.querySelectorAll("[data-module-refresh]").forEach((button) => button.addEventListener("click", () => loadRoute(activeModule)));
  content.querySelectorAll("[data-module-filter]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(form).entries());
    if (modules[activeModule].handleAction) await modules[activeModule].handleAction("filter", payload);
    await modules[activeModule].load?.();
    if (activeModule) renderModuleState(modules[activeModule]);
  }));
  content.querySelectorAll("[data-module-filter-change]").forEach((control) => control.addEventListener("change", async () => {
    const form = control.closest("form");
    if (!form) return;
    const payload = Object.fromEntries(new FormData(form).entries());
    if (modules[activeModule].handleAction) await modules[activeModule].handleAction("filter", payload);
    await modules[activeModule].load?.();
    if (activeModule) renderModuleState(modules[activeModule]);
  }));
  content.querySelectorAll("[data-module-reset]").forEach((button) => button.addEventListener("click", async () => {
    const form = button.closest("form");
    form?.reset();
    if (modules[activeModule].handleAction) await modules[activeModule].handleAction("filter-clear", {});
    await modules[activeModule].load?.();
    if (activeModule) renderModuleState(modules[activeModule]);
  }));
  content.querySelectorAll("[data-module-form]").forEach((form) => form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const current = modules[activeModule];
    if (!current) return;
    const requiredPermission = form.dataset.requiredPermission;
    if (requiredPermission && !hasPermission(auth.user, requiredPermission)) return;
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    status("正在提交后台操作…");
    try {
      await current.handleAction(form.dataset.moduleForm, { ...Object.fromEntries(new FormData(form).entries()), userId: form.dataset.userId || undefined });
      status("后台操作已完成。", "success");
      await loadRoute(activeModule);
    } catch (error) {
      status(friendlyAdminErrorMessage(error, { fallback: "后台操作失败。" }), "error");
      form.querySelectorAll("button").forEach((button) => { button.disabled = false; });
    }
  }));
  content.querySelectorAll("[data-module-form]").forEach((form) => {
    const permission = form.dataset.requiredPermission;
    if (permission && !hasPermission(auth.user, permission)) form.closest("details")?.remove() || form.remove();
  });
  content.querySelectorAll("[data-module-action]").forEach((button) => {
    const action = button.dataset.moduleAction;
    const readOnlyActions = new Set(["filter", "filter-clear", "detail", "detail-close", "window"]);
    const requiredPermission = button.dataset.requiredPermission || (readOnlyActions.has(action) ? "" : modules[activeModule].actionPermission);
    if (requiredPermission && !hasPermission(auth.user, requiredPermission)) {
      button.remove();
      return;
    }
    button.addEventListener("click", async () => {
    if (["pause", "cancel", "retry", "status", "role", "revoke-sessions", "reset-password", "toggle-operator", "toggle-provider", "toggle-queue"].includes(action) && globalThis.confirm && !globalThis.confirm("确认执行此后台操作吗？")) return;
    button.disabled = true;
    status("正在提交后台操作…");
    try {
      await modules[activeModule].handleAction(action, button.dataset);
      status("后台操作已完成。", "success");
      await loadRoute(activeModule);
    } catch (error) {
      button.disabled = false;
      status(friendlyAdminErrorMessage(error, { fallback: "后台操作失败。" }), "error");
    }
    });
  });
  content.querySelector("[data-system-test]")?.addEventListener("click", runModelTest);
}

async function loadRoute(name) {
  if (!modules?.[name]) return;
  activeModule = name;
  renderNav();
  const module = modules[name];
  const label = { overview: "总览", accounts: "账号与权限", agents: "Agent 中心", products: "产品发布", "media-retrieval": "媒体检索", tasks: "任务运营", monitoring: "使用监控", audit: "审计记录", system: "服务配置" }[name] || module.title;
  const breadcrumb = document.querySelector("#console-breadcrumb");
  const sectionLabel = sectionDefinitions[name]?.label;
  if (breadcrumb) breadcrumb.innerHTML = `<span>妙讯运营后台</span><b>/</b>${sectionLabel && sectionLabel !== label ? `<span>${sectionLabel}</span><b>/</b>` : ""}<strong>${label}</strong>`;
  if (!hasPermission(auth.user, module.permission)) {
    document.querySelector("#console-title").textContent = module.title;
    document.querySelector("#console-content").innerHTML = '<div class="console-state console-error"><strong>无权访问此模块</strong><p>服务端权限是最终边界，当前账号没有该资源权限。</p></div>';
    return;
  }
  renderModuleState(module);
  await module.load();
  if (activeModule === name) renderModuleState(module);
  document.querySelector("#console-refresh-time").textContent = `最近刷新：${new Date().toLocaleTimeString("zh-CN")}`;
}

async function runModelTest() {
  const button = document.querySelector("[data-system-test]");
  if (button) button.disabled = true;
  status("正在执行已确认的模型连通测试…");
  try { await api("/api/admin/model-test", { method: "POST", body: JSON.stringify({ input: "请用一句话回复：妙讯后台模型连通测试" }) }); status("模型连通测试完成。", "success"); await loadRoute("system"); }
  catch (error) { status(friendlyAdminErrorMessage(error, { fallback: "模型连通测试失败。" }), "error"); }
  finally { if (button) button.disabled = false; }
}

async function loadAuthenticatedApp() {
  if (!auth.token) { showLogin(); return; }
  status("正在读取管理员身份…");
  try {
    const result = await api("/api/me");
    auth = { ...auth, user: result.user || result };
    saveAuth(auth);
    modules = {
      overview: createOverviewModule(api), accounts: createAccountsModule(api), agents: createAgentsModule(api), products: createProductsModule(api), "media-retrieval": createMediaRetrievalModule(api), tasks: createTasksModule(api), monitoring: createMonitoringModule(api), audit: createAuditModule(api), system: createSystemModule(api),
    };
    document.querySelector("#console-login").classList.add("hidden");
    document.querySelector("#console-app").classList.remove("hidden");
    const adminName = auth.user?.displayName || auth.user?.email || "管理员";
    document.querySelector("#console-admin-name").textContent = adminName;
    document.querySelector("#console-admin-avatar").textContent = String(adminName).trim().slice(0, 1) || "管";
    const allowed = visibleModules(auth.user);
    if (!allowed.length) { renderNav(); status("当前账号尚未分配可用后台权限。", "error"); return; }
    router.navigate(allowed.includes(router.current) ? router.current : allowed[0], { replace: true });
    status("管理员身份已同步。", "success");
  } catch (error) {
    if (shouldClearAdminSession(error)) { clearAuth(); showLogin(); }
    status(friendlyAdminErrorMessage(error, { fallback: "后台身份读取失败。" }), "error");
  }
}

function showLogin() { document.querySelector("#console-login")?.classList.remove("hidden"); document.querySelector("#console-app")?.classList.add("hidden"); }

const router = createRouter({ onRoute: (name) => { if (auth.user) loadRoute(name); } });
root.innerHTML = shellMarkup();
document.querySelector("#console-menu-toggle")?.addEventListener("click", () => {
  const sidebar = document.querySelector("#console-sidebar");
  sidebar?.classList.contains("open") ? closeSidebar() : openSidebar();
});
document.querySelector("#console-sidebar-backdrop")?.addEventListener("click", closeSidebar);
document.querySelector("#console-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  status("正在登录后台…");
  try {
    const result = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: document.querySelector("#console-identifier").value.trim(), password: document.querySelector("#console-password").value }) });
    saveAuth({ token: result.session.token, user: result.user });
    await loadAuthenticatedApp();
  } catch (error) { status(friendlyAdminErrorMessage(error, { fallback: "登录失败。" }), "error"); }
});
document.querySelector("#console-refresh").addEventListener("click", () => loadRoute(activeModule || router.current));
document.querySelector("#console-logout").addEventListener("click", async () => { try { if (auth.token) await api("/api/auth/logout", { method: "POST" }); } catch { /* local logout still clears the session */ } clearAuth(); showLogin(); status("已退出后台。"); });
loadAuthenticatedApp();
