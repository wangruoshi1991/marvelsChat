import { friendlyAdminErrorMessage, shouldClearAdminSession } from "../admin-core.js";
import { createApiClient } from "./api-client.js";
import { createRouter } from "./router.js";
import { MODULE_PERMISSIONS, hasPermission, visibleModules } from "./permissions.js";
import { createOverviewModule } from "./modules/overview.js";
import { createAccountsModule } from "./modules/accounts.js";
import { createAgentsModule } from "./modules/agents.js";
import { createProductsModule } from "./modules/products.js";
import { createTasksModule } from "./modules/tasks.js";
import { createMonitoringModule } from "./modules/monitoring.js";
import { createAuditModule } from "./modules/audit.js";
import { createSystemModule } from "./modules/system.js";

const root = document.querySelector("#admin-root");
const authStorageKey = "miaoxun.admin.auth.v1";
const apiOrigin = typeof __MIAOXUN_ADMIN_API_TARGET__ === "string" && __MIAOXUN_ADMIN_API_TARGET__ ? __MIAOXUN_ADMIN_API_TARGET__ : (window.location.protocol === "file:" ? "http://127.0.0.1:4390" : "");
let auth = readAuth();
let activeModule;
let modules;

function readAuth() { try { return JSON.parse(sessionStorage.getItem(authStorageKey) || "{}"); } catch { return {}; } }
function saveAuth(value) { auth = value; sessionStorage.setItem(authStorageKey, JSON.stringify(value)); }
function clearAuth() { auth = {}; sessionStorage.removeItem(authStorageKey); }
function status(message, kind = "") { const element = document.querySelector("#console-status"); if (element) { element.textContent = message; element.dataset.kind = kind; } }

const api = createApiClient({ baseOrigin: apiOrigin, getToken: () => auth.token });

function shellMarkup() {
  return `<section class="console-login" id="console-login"><div><span>MARVELSCHAT OPS</span><h1>妙讯运营后台</h1><p>登录后按权限查看真实运营数据。后台不会生成示例记录。</p><small id="console-api-status">API：${apiOrigin || window.location.origin}</small></div><form id="console-login-form"><input id="console-identifier" required autocomplete="username" placeholder="账号 / 手机号 / 邮箱" /><input id="console-password" required type="password" autocomplete="current-password" placeholder="密码" /><button type="submit">登录后台</button></form></section><section class="console-app hidden" id="console-app"><aside class="console-sidebar"><div class="console-brand"><span>MARVELSCHAT OPS</span><strong>妙讯运营后台</strong></div><nav id="console-nav" aria-label="后台模块"></nav><div class="console-sidebar-footer"><span id="console-admin-name">未登录</span><button id="console-logout" type="button">退出</button></div></aside><section class="console-main"><header class="console-topbar"><div><span id="console-environment">环境：${window.location.hostname || "本地"}</span><h1 id="console-title">总览</h1></div><div class="console-top-actions"><span id="console-refresh-time"></span><button id="console-refresh" type="button">刷新</button></div></header><p class="console-status" id="console-status">正在检查登录状态…</p><main id="console-content"></main></section></section>`;
}

function renderNav() {
  const labels = { overview: "总览", accounts: "账号与权限", agents: "Agent 中心", products: "产品发布", tasks: "任务运营", monitoring: "使用监控", audit: "审计记录", system: "服务配置" };
  const allowed = visibleModules(auth.user);
  document.querySelector("#console-nav").innerHTML = allowed.map((name) => `<button type="button" data-route="${name}" class="${name === activeModule ? "active" : ""}"><span>${labels[name]}</span><small>${MODULE_PERMISSIONS[name]}</small></button>`).join("") || '<p class="console-empty">当前账号没有可用后台权限。</p>';
  document.querySelectorAll("[data-route]").forEach((button) => button.addEventListener("click", () => router.navigate(button.dataset.route)));
}

function renderModuleState(module) {
  const content = document.querySelector("#console-content");
  document.querySelector("#console-title").textContent = module.title;
  content.innerHTML = module.render();
  content.querySelectorAll("[data-module-refresh]").forEach((button) => button.addEventListener("click", () => loadRoute(activeModule)));
  content.querySelector("[data-system-test]")?.addEventListener("click", runModelTest);
}

async function loadRoute(name) {
  if (!modules?.[name]) return;
  activeModule = name;
  renderNav();
  const module = modules[name];
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
      overview: createOverviewModule(api), accounts: createAccountsModule(api), agents: createAgentsModule(api), products: createProductsModule(api), tasks: createTasksModule(api), monitoring: createMonitoringModule(api), audit: createAuditModule(api), system: createSystemModule(api),
    };
    document.querySelector("#console-login").classList.add("hidden");
    document.querySelector("#console-app").classList.remove("hidden");
    document.querySelector("#console-admin-name").textContent = auth.user?.displayName || auth.user?.email || "管理员";
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
