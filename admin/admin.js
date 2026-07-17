const authStorageKey = "miaoxun.admin.auth.v1";
const configuredApiTarget = typeof __MIAOXUN_ADMIN_API_TARGET__ === "string" ? __MIAOXUN_ADMIN_API_TARGET__ : "";
const apiOrigin = window.location.protocol === "file:" ? "http://127.0.0.1:4390" : "";
const apiLabel = apiOrigin || configuredApiTarget || window.location.origin;

const readAuth = () => {
  try {
    return JSON.parse(localStorage.getItem(authStorageKey) || "{}");
  } catch {
    return {};
  }
};

let auth = readAuth();
let currentUsers = [];
let currentAgents = [];
let currentAgentReadiness = {};
let selectedUserId = "";
let currentModelStatus = null;

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => [...document.querySelectorAll(selector)];

const setStatus = (message) => {
  qs("#admin-status").textContent = message;
};

const setApiStatus = (message) => {
  const element = qs("#admin-api-status");
  if (element) element.textContent = message;
};

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const formatTime = (value) => {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const friendlyErrorMessage = (error, fallback = "操作失败，请稍后再试。") => {
  const message = String(error?.message || "");
  if (!message) return fallback;
  if (error?.name === "TypeError" || /failed to fetch|network|load failed/i.test(message)) {
    return `无法连接后台服务：${apiLabel}`;
  }
  if (error?.status === 404 && /account not found/i.test(message)) return "账号不存在。";
  if (error?.status === 401 && /invalid password/i.test(message)) return "密码不正确。";
  if (/postgres|database|db:migrate|migrated|migration|relation .* does not exist/i.test(message)) {
    return "妙讯服务正在初始化，请稍后再试。";
  }
  if (/invalid email or password|invalid account or password/i.test(message)) return "账号或密码不正确。";
  if (/already registered/i.test(message)) return "账号或邮箱已存在。";
  if (/disabled/i.test(message)) return "账号已停用。";
  if (/admin permission/i.test(message)) return "当前账号没有后台权限。";
  if (/disable your own/i.test(message)) return "不能停用当前登录的管理员账号。";
  if (/remove your own/i.test(message)) return "不能移除当前登录账号的管理员权限。";
  if (/logout to revoke/i.test(message)) return "当前管理员请使用退出后台。";
  if (/change your own password/i.test(message)) return "请在账号设置中修改自己的密码。";
  return message;
};

const roleLabel = (role) => (role === "admin" ? "管理员" : "普通用户");
const statusLabel = (status) => (status === "active" ? "启用" : "停用");
const modelStateLabel = (status) => (status?.configured ? "已配置" : "未配置");
const readinessStateLabel = (readiness) => (readiness?.configured ? "可用" : "待配置");
const adminPermissionOptions = [
  ["users:read", "查看账号"],
  ["users:write", "管理账号"],
  ["agents:manage", "Agent 授权"],
  ["audit:read", "查看审计"],
  ["model:operate", "模型运维"],
];
const permissionLabel = (permission) => {
  if (permission === "*") return "全部权限";
  return adminPermissionOptions.find(([value]) => value === permission)?.[1] || permission;
};
const permissionSummary = (permissions = []) => {
  if (!permissions.length) return "--";
  if (permissions.includes("*")) return "全部权限";
  return `${permissions.length} 项`;
};

const agentModuleBindings = {
  "miaoxun-butler": {
    module: "妙讯聊天 / 管家中枢",
    owner: "妙讯项目内置 Agent",
    endpoint: "/api/threads/:threadId/messages",
  },
  "virtual-character": {
    module: "我的小站 / 我的模样",
    owner: "妙讯项目内置 Agent",
    endpoint: "形象建议会话",
  },
  "model-3d": {
    module: "我的模样 / 3D 个人形象",
    owner: "Agent 模块负责",
    endpoint: "/api/avatar-3d/jobs",
  },
  "site-builder": {
    module: "个人主页 / 小站结构草稿",
    owner: "Agent 模块负责",
    endpoint: "/api/station/site-drafts",
  },
  "album-manager": {
    module: "个人相册 / 素材整理",
    owner: "Agent 模块负责",
    endpoint: "/api/station/album-suggestions",
  },
  "file-preprocessor": {
    module: "文件素材 / 上传预处理",
    owner: "Agent 模块负责",
    endpoint: "/api/station/file-assets",
  },
  "comic-diary": {
    module: "个人日记 / 漫画日记",
    owner: "Agent 模块负责",
    endpoint: "/api/station/comic-diaries",
  },
  "video-production": {
    module: "我的动态 / 视频草稿",
    owner: "Agent 模块负责",
    endpoint: "/api/station/video-drafts",
  },
};

const listText = (items = [], fallback = "无") =>
  items?.length ? items.join(", ") : fallback;

const setAdminReady = (ready) => {
  qs("#admin-content")?.classList.toggle("hidden", !ready);
  qs("#admin-create-user").disabled = !ready;
  qs("#model-test").disabled = !ready;
};

const apiRequest = async (path, options = {}) => {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;

  let response;
  try {
    response = await fetch(`${apiOrigin}${path}`, { ...options, headers });
  } catch (error) {
    error.name = error.name || "TypeError";
    throw error;
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || `Request failed: ${response.status}`);
    error.status = response.status;
    error.details = payload.error?.details;
    throw error;
  }
  return payload.data;
};

const renderMetrics = (overview) => {
  const metrics = [
    ["总用户", overview.usersTotal],
    ["24h 活跃", overview.activeUsers24h],
    ["总会话", overview.threadsTotal],
    ["今日消息", overview.messagesToday],
    ["今日事件", overview.eventsToday],
    ["今日 Agent", overview.agentRunsToday],
  ];
  qs("#metric-grid").innerHTML = metrics
    .map(
      ([label, value]) => `
        <article class="metric-card">
          <span>${escapeHtml(label)}</span>
          <b>${Number(value || 0).toLocaleString("zh-CN")}</b>
        </article>
      `,
    )
    .join("");
};

const filteredUsers = () => {
  const keyword = qs("#user-search")?.value.trim().toLowerCase() || "";
  const status = qs("#user-status-filter")?.value || "";
  const role = qs("#user-role-filter")?.value || "";

  return currentUsers.filter((user) => {
    const haystack = [user.displayName, user.phoneNumber, user.email, user.aiId]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return (!keyword || haystack.includes(keyword)) && (!status || user.status === status) && (!role || user.role === role);
  });
};

const renderUserRows = (users) => {
  qs("#users-count").textContent = `${users.length} / ${currentUsers.length}`;
  qs("#users-table").innerHTML =
    users
      .map((user) => {
        const isSelf = user.id === auth.user?.id;
        const nextStatus = user.status === "active" ? "disabled" : "active";
        const nextRole = user.role === "admin" ? "user" : "admin";
        return `
          <tr>
            <td><button class="link-btn" type="button" data-user-action="detail" data-user-id="${escapeHtml(user.id)}">${escapeHtml(user.displayName)}</button></td>
            <td>${escapeHtml(user.phoneNumber || "--")}</td>
            <td>${escapeHtml(user.email)}</td>
            <td><span class="status-pill role">${roleLabel(user.role)}</span></td>
            <td>${escapeHtml(permissionSummary(user.adminPermissions || []))}</td>
            <td><span class="status-pill ${user.status === "active" ? "" : "error"}">${statusLabel(user.status)}</span></td>
            <td>${Number(user.activeSessionCount || 0)} / ${Number(user.threadCount || 0)}</td>
            <td>${Number(user.agentCount || 0)}</td>
            <td>${formatTime(user.lastLoginAt)}</td>
            <td>
              <div class="user-actions">
                <button type="button" data-user-action="detail" data-user-id="${escapeHtml(user.id)}">详情</button>
                <button type="button" data-user-action="status" data-user-id="${escapeHtml(user.id)}" data-next-value="${nextStatus}" ${isSelf ? "disabled" : ""}>${user.status === "active" ? "停用" : "启用"}</button>
                <button type="button" data-user-action="role" data-user-id="${escapeHtml(user.id)}" data-next-value="${nextRole}" ${isSelf ? "disabled" : ""}>${user.role === "admin" ? "设为用户" : "设为管理员"}</button>
                <button type="button" data-user-action="revoke-sessions" data-user-id="${escapeHtml(user.id)}" ${isSelf ? "disabled" : ""}>踢下线</button>
                <button type="button" data-user-action="reset-password" data-user-id="${escapeHtml(user.id)}" ${isSelf ? "disabled" : ""}>重置密码</button>
              </div>
            </td>
          </tr>
        `;
      })
      .join("") || `<tr><td colspan="10">暂无用户</td></tr>`;
};

const renderUsers = (users) => {
  currentUsers = users;
  renderUserRows(filteredUsers());
};

const renderAgents = (agents) => {
  currentAgents = agents;
  qs("#agents-count").textContent = agents.length;
  qs("#agents-list").innerHTML =
    agents
      .map(
        (agent) => `
          <article>
            <strong>${escapeHtml(agent.name)}</strong>
            <p>${escapeHtml(agent.description || "暂无描述")}</p>
            <code>${escapeHtml(agent.key)} · ${Number(agent.runs?.total || 0)} runs</code>
          </article>
        `,
      )
      .join("") || "<article><strong>暂无 Agent</strong><p>agents/ 目录中还没有注册文件。</p></article>";
};

const renderAgentReadiness = (readiness = currentAgentReadiness, agents = currentAgents) => {
  currentAgentReadiness = readiness || {};
  qs("#agent-readiness-count").textContent = `${Object.keys(currentAgentReadiness).length} 项`;
  qs("#agent-readiness-list").innerHTML =
    agents
      .map((agent) => {
        const item = currentAgentReadiness[agent.key] || null;
        const binding = agentModuleBindings[agent.key] || {
          module: "未绑定业务模块",
          owner: "未标注",
          endpoint: "--",
        };
        const missing = [
          ...(item?.missingEnv || []),
          ...(item?.capabilityNeeds || []),
        ];
        const providers = Object.values(item?.providers || {})
          .map((provider) => `${provider.provider}:${provider.configured ? "ok" : listText(provider.missing, "missing")}`)
          .join(" / ");
        return `
          <article class="readiness-card">
            <header>
              <div>
                <strong>${escapeHtml(agent.name)}</strong>
                <code>${escapeHtml(agent.key)}</code>
              </div>
              <span class="status-pill ${item?.configured ? "" : "error"}">${readinessStateLabel(item)}</span>
            </header>
            <dl>
              <div><dt>业务模块</dt><dd>${escapeHtml(binding.module)}</dd></div>
              <div><dt>负责边界</dt><dd>${escapeHtml(binding.owner)}</dd></div>
              <div><dt>后端入口</dt><dd>${escapeHtml(binding.endpoint)}</dd></div>
              <div><dt>缺失配置 / 后续能力</dt><dd>${escapeHtml(listText(missing))}</dd></div>
              <div><dt>Provider</dt><dd>${escapeHtml(providers || "--")}</dd></div>
            </dl>
          </article>
        `;
      })
      .join("") || "<article><strong>暂无 Agent</strong><p>agents/ 目录中还没有注册文件。</p></article>";
};

const renderModelStatus = (status, testResult = null) => {
  currentModelStatus = status;
  qs("#model-status-label").textContent = modelStateLabel(status);
  qs("#model-status-label").classList.toggle("error", !status?.configured);
  qs("#model-test").disabled = !auth.token || !status?.configured;

  const missing = status?.missing?.length ? status.missing.join(", ") : "无";
  const testMarkup = testResult
    ? `
        <section class="model-test-result">
          <strong>最近测试</strong>
          <p>${escapeHtml(testResult.reply || "模型已返回，但没有文本内容。")}</p>
          <code>${Number(testResult.latencyMs || 0)} ms · ${testResult.tokenUsage?.total ?? "--"} tokens</code>
        </section>
      `
    : "";

  qs("#model-panel").innerHTML = `
    <dl>
      <div><dt>Provider</dt><dd>${escapeHtml(status?.provider || "not-configured")}</dd></div>
      <div><dt>模型</dt><dd>${escapeHtml(status?.model || "--")}</dd></div>
      <div><dt>API Key</dt><dd>${status?.hasApiKey ? "已配置" : "未配置"}</dd></div>
      <div><dt>缺失项</dt><dd>${escapeHtml(missing)}</dd></div>
      <div class="full"><dt>Endpoint</dt><dd>${escapeHtml(status?.endpoint || status?.baseUrl || "--")}</dd></div>
    </dl>
    ${testMarkup}
  `;
};

const renderModelError = (error) => {
  const details = error?.details || currentModelStatus || {};
  renderModelStatus({
    configured: false,
    missing: details.missing || [],
    provider: details.provider || "runtime-error",
    baseUrl: details.baseUrl || "",
    endpoint: details.endpoint || "",
    model: details.model || "",
    hasApiKey: Boolean(details.hasApiKey),
  });
  qs("#model-panel").insertAdjacentHTML(
    "beforeend",
    `<section class="model-error"><strong>测试失败</strong><p>${escapeHtml(friendlyErrorMessage(error, "模型测试失败。"))}</p></section>`,
  );
};

const renderEvents = (events) => {
  qs("#events-count").textContent = events.length;
  qs("#events-list").innerHTML =
    events
      .map(
        (event) => `
          <article>
            <code>${escapeHtml(event.eventType)}</code>
            <strong>${escapeHtml(event.userEmail || "system")}</strong>
            <p>${escapeHtml(event.targetType || "-")} ${escapeHtml(event.targetId || "")}</p>
            <p>${formatTime(event.createdAt)}</p>
          </article>
        `,
      )
      .join("") || "<article><strong>暂无事件</strong><p>真实登录、退出、管理动作会在这里出现。</p></article>";
};

const renderRuns = (runs) => {
  qs("#runs-count").textContent = runs.length;
  qs("#runs-table").innerHTML =
    runs
      .map(
        (run) => `
          <tr>
            <td>${escapeHtml(run.agentId)}</td>
            <td><span class="status-pill ${run.status === "error" ? "error" : ""}">${escapeHtml(run.status)}</span></td>
            <td>${escapeHtml(run.provider)}</td>
            <td>${run.latencyMs ?? "--"} ms</td>
            <td>${run.tokenTotal ?? "--"}</td>
            <td>${escapeHtml(run.userEmail || "--")}</td>
            <td>${formatTime(run.createdAt)}</td>
          </tr>
        `,
      )
      .join("") || `<tr><td colspan="7">暂无 Agent 调用</td></tr>`;
};

const setLoginVisible = (visible) => {
  qs("#admin-login").classList.toggle("hidden", !visible);
};

const closeDrawer = () => {
  selectedUserId = "";
  qs("#user-drawer").classList.remove("active");
  qs("#user-drawer").setAttribute("aria-hidden", "true");
};

const openDrawer = () => {
  qs("#user-drawer").classList.add("active");
  qs("#user-drawer").setAttribute("aria-hidden", "false");
};

const renderUserDetail = (detail) => {
  selectedUserId = detail.user.id;
  qs("#drawer-title").textContent = detail.user.displayName;
  const permissions = detail.user.adminPermissions || [];
  const permissionRows =
    detail.user.role === "admin"
      ? `
        <form class="detail-form" id="permissions-admin-form">
          <h3>管理员权限</h3>
          <label class="checkbox-row">
            <input type="checkbox" name="admin-permission" value="*" ${permissions.includes("*") ? "checked" : ""} />
            <span>全部权限</span>
          </label>
          ${adminPermissionOptions
            .map(
              ([value, label]) => `
                <label class="checkbox-row">
                  <input type="checkbox" name="admin-permission" value="${escapeHtml(value)}" ${permissions.includes(value) ? "checked" : ""} ${permissions.includes("*") ? "disabled" : ""} />
                  <span>${escapeHtml(label)}</span>
                </label>
              `,
            )
            .join("")}
          <button type="submit">保存权限</button>
        </form>
      `
      : "";
  const agentRows = detail.agents
    .map(
      (agent) => `
        <article class="agent-access-row">
          <div>
            <strong>${escapeHtml(agent.name)}</strong>
            <p>${escapeHtml(agent.description || agent.id)}</p>
          </div>
          <button type="button" data-agent-toggle="${escapeHtml(agent.id)}" data-enabled="${agent.enabled ? "false" : "true"}">
            ${agent.enabled ? "停用" : "启用"}
          </button>
        </article>
      `,
    )
    .join("") || "<p class=\"empty-note\">暂无可注册 Agent。</p>";

  const threadRows = detail.threads
    .map((thread) => `<li>${escapeHtml(thread.title)} · ${escapeHtml(thread.status || "在线")}</li>`)
    .join("") || "<li>暂无会话</li>";

  const eventRows = detail.recentEvents
    .map((event) => `<li><code>${escapeHtml(event.eventType)}</code><span>${formatTime(event.createdAt)}</span></li>`)
    .join("") || "<li>暂无事件</li>";

  const runRows = detail.recentRuns
    .map(
      (run) =>
        `<li><code>${escapeHtml(run.agentId)}</code><span>${escapeHtml(run.status)} · ${escapeHtml(run.provider)} · ${formatTime(run.createdAt)}</span></li>`,
    )
    .join("") || "<li>暂无调用记录</li>";

  qs("#drawer-body").innerHTML = `
    <section class="detail-summary">
      <article><span>手机号</span><strong>${escapeHtml(detail.user.phoneNumber || "--")}</strong></article>
      <article><span>邮箱</span><strong>${escapeHtml(detail.user.email)}</strong></article>
      <article><span>昵称</span><strong>${escapeHtml(detail.user.displayName)}</strong></article>
      <article><span>角色</span><strong>${roleLabel(detail.user.role)}</strong></article>
      <article><span>权限</span><strong>${escapeHtml(permissionSummary(permissions))}</strong></article>
      <article><span>状态</span><strong>${statusLabel(detail.user.status)}</strong></article>
      <article><span>活跃会话</span><strong>${Number(detail.sessions.active || 0)}</strong></article>
      <article><span>AI ID</span><strong>${escapeHtml(detail.user.aiId)}</strong></article>
    </section>

    ${permissionRows}

    <form class="detail-form" id="profile-admin-form">
      <h3>小站资料</h3>
      <label>昵称<input id="detail-nickname" value="${escapeHtml(detail.profile?.nickname || detail.user.displayName)}" maxlength="80" required /></label>
      <label>简介<textarea id="detail-bio" maxlength="500">${escapeHtml(detail.profile?.bio || "")}</textarea></label>
      <label>社区<input id="detail-community" value="${escapeHtml(detail.profile?.community || "")}" maxlength="120" /></label>
      <label>活动区域<input id="detail-area" value="${escapeHtml(detail.profile?.activityArea || "")}" maxlength="120" /></label>
      <button type="submit">保存资料</button>
    </form>

    <section class="detail-block">
      <header><h3>Agent 授权</h3><span>${detail.agents.filter((agent) => agent.enabled).length} 个启用</span></header>
      <div class="agent-access-list">${agentRows}</div>
    </section>

    <section class="detail-block">
      <header><h3>会话</h3><span>${detail.threads.length}</span></header>
      <ul class="detail-list">${threadRows}</ul>
    </section>

    <section class="detail-block">
      <header><h3>最近事件</h3><span>${detail.recentEvents.length}</span></header>
      <ul class="detail-list event-mini-list">${eventRows}</ul>
    </section>

    <section class="detail-block">
      <header><h3>最近 Agent 调用</h3><span>${detail.recentRuns.length}</span></header>
      <ul class="detail-list">${runRows}</ul>
    </section>
  `;
};

const openUserDetail = async (userId) => {
  setStatus("正在读取账号详情...");
  const detail = await apiRequest(`/api/admin/users/${userId}`);
  renderUserDetail(detail);
  openDrawer();
  setStatus("账号详情已同步。");
};

async function loadAdmin() {
  setApiStatus(`当前连接：${apiLabel}`);
  if (!auth.token) {
    setLoginVisible(true);
    setAdminReady(false);
    setStatus("请先使用管理员账号登录。");
    return;
  }

  setStatus("正在读取后台管理数据...");
  try {
    const [overview, users] = await Promise.all([
      apiRequest("/api/admin/overview"),
      apiRequest("/api/admin/users?limit=120"),
    ]);

    setLoginVisible(false);
    setAdminReady(true);
    renderMetrics(overview);
    renderUsers(users);

    try {
      renderEvents(await apiRequest("/api/admin/events?limit=80"));
    } catch (error) {
      renderEvents([]);
      setStatus(friendlyErrorMessage(error, "审计事件读取失败。"));
    }

    try {
      renderRuns(await apiRequest("/api/admin/agent-runs?limit=80"));
    } catch (error) {
      renderRuns([]);
      setStatus(friendlyErrorMessage(error, "Agent 调用记录读取失败。"));
    }

    try {
      const [agents, readiness] = await Promise.all([
        apiRequest("/api/admin/agents"),
        apiRequest("/api/admin/agent-readiness"),
      ]);
      renderAgents(agents);
      renderAgentReadiness(readiness, agents);
    } catch (error) {
      renderAgents([]);
      renderAgentReadiness({}, []);
      setStatus(friendlyErrorMessage(error, "Agent 注册信息读取失败。"));
    }

    try {
      renderModelStatus(await apiRequest("/api/admin/model-status"));
    } catch (error) {
      renderModelError(error);
    }
    setStatus(`后台数据已同步。最近刷新：${new Date().toLocaleTimeString("zh-CN")}`);
    if (selectedUserId) await openUserDetail(selectedUserId);
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      auth = {};
      localStorage.removeItem(authStorageKey);
      setLoginVisible(true);
      setAdminReady(false);
    }
    setStatus(friendlyErrorMessage(error, "后台数据读取失败。"));
  }
}

qs("#admin-login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const identifier = qs("#admin-identifier").value.trim();
  const password = qs("#admin-password").value;
  setStatus("正在登录后台...");
  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    auth = { token: data.session.token, user: data.user };
    localStorage.setItem(authStorageKey, JSON.stringify(auth));
    await loadAdmin();
  } catch (error) {
    setStatus(friendlyErrorMessage(error, "登录失败。"));
  }
});

qs("#admin-refresh").addEventListener("click", loadAdmin);

qs("#admin-logout").addEventListener("click", async () => {
  try {
    if (auth.token) await apiRequest("/api/auth/logout", { method: "POST" });
  } catch {
    // Local logout should still complete when the session has already expired.
  } finally {
    auth = {};
    localStorage.removeItem(authStorageKey);
    closeDrawer();
    setLoginVisible(true);
    setAdminReady(false);
    qs("#metric-grid").innerHTML = "";
    qs("#users-table").innerHTML = "";
    qs("#events-list").innerHTML = "";
    qs("#runs-table").innerHTML = "";
    qs("#agents-list").innerHTML = "";
    qs("#agent-readiness-count").textContent = "0";
    qs("#agent-readiness-list").innerHTML = "<article><strong>未检测</strong><p>登录后会显示每个 Agent 对应的 App 模块和上游配置状态。</p></article>";
    qs("#model-status-label").textContent = "未检测";
    qs("#model-panel").innerHTML = "<p>登录后会显示当前后端模型配置。</p>";
    setStatus("已退出后台。");
  }
});

qs("#model-test").addEventListener("click", async () => {
  const button = qs("#model-test");
  button.disabled = true;
  setStatus("正在测试模型服务...");
  try {
    const result = await apiRequest("/api/admin/model-test", {
      method: "POST",
      body: JSON.stringify({ input: "请用一句话回复：妙讯后台模型连通测试" }),
    });
    renderModelStatus(result, result);
    await Promise.all([
      apiRequest("/api/admin/events?limit=80").then(renderEvents),
      apiRequest("/api/admin/agent-runs?limit=80").then(renderRuns),
    ]);
    setStatus(`模型连通测试成功：${result.provider}，${result.latencyMs} ms。`);
  } catch (error) {
    renderModelError(error);
    setStatus(friendlyErrorMessage(error, "模型连通测试失败。"));
  } finally {
    button.disabled = !auth.token || !currentModelStatus?.configured;
  }
});

qs("#admin-create-user").addEventListener("click", () => {
  if (!auth.token) {
    setStatus("请先登录后台。");
    return;
  }
  qs("#create-user-dialog").showModal();
});

qs("#create-user-cancel").addEventListener("click", () => {
  qs("#create-user-dialog").close();
});

qs("#create-user-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  setStatus("正在创建账号...");
  try {
    const data = await apiRequest("/api/admin/users", {
      method: "POST",
      body: JSON.stringify({
        email: qs("#create-email").value.trim(),
        displayName: qs("#create-display-name").value.trim(),
        password: qs("#create-password").value,
        role: qs("#create-role").value,
      }),
    });
    qs("#create-user-form").reset();
    qs("#create-user-dialog").close();
    await loadAdmin();
    await openUserDetail(data.user.id);
    setStatus("账号已创建。");
  } catch (error) {
    setStatus(friendlyErrorMessage(error, "创建账号失败。"));
  }
});

qs("#users-table").addEventListener("click", async (event) => {
  const button = event.target.closest("[data-user-action]");
  if (!button || button.disabled) return;
  const userId = button.dataset.userId;
  const action = button.dataset.userAction;
  button.disabled = true;

  try {
    if (action === "detail") {
      await openUserDetail(userId);
      return;
    }
    if (action === "status") {
      await apiRequest(`/api/admin/users/${userId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: button.dataset.nextValue }),
      });
      setStatus("账号状态已更新。");
    }
    if (action === "role") {
      await apiRequest(`/api/admin/users/${userId}/role`, {
        method: "PATCH",
        body: JSON.stringify({ role: button.dataset.nextValue }),
      });
      setStatus("账号角色已更新。");
    }
    if (action === "revoke-sessions") {
      await apiRequest(`/api/admin/users/${userId}/revoke-sessions`, { method: "POST" });
      setStatus("目标账号已踢下线。");
    }
    if (action === "reset-password") {
      const password = window.prompt("请输入临时密码，至少 8 位。");
      if (password === null) return;
      if (password.length < 8) {
        setStatus("临时密码至少需要 8 位。");
        return;
      }
      await apiRequest(`/api/admin/users/${userId}/reset-password`, {
        method: "POST",
        body: JSON.stringify({ password }),
      });
      setStatus("密码已重置，目标账号的登录会话已撤销。");
    }
    await loadAdmin();
  } catch (error) {
    setStatus(friendlyErrorMessage(error));
  } finally {
    button.disabled = false;
  }
});

["#user-search", "#user-status-filter", "#user-role-filter"].forEach((selector) => {
  qs(selector)?.addEventListener("input", () => renderUserRows(filteredUsers()));
  qs(selector)?.addEventListener("change", () => renderUserRows(filteredUsers()));
});

qs("#drawer-close").addEventListener("click", closeDrawer);

qs("#drawer-body").addEventListener("submit", async (event) => {
  if (event.target.id === "permissions-admin-form") {
    event.preventDefault();
    if (!selectedUserId) return;
    const permissions = [...event.target.querySelectorAll('input[name="admin-permission"]:checked')].map(
      (input) => input.value,
    );
    const finalPermissions = permissions.includes("*") ? ["*"] : permissions;
    setStatus("正在保存管理员权限...");
    try {
      await apiRequest(`/api/admin/users/${selectedUserId}/permissions`, {
        method: "PATCH",
        body: JSON.stringify({ permissions: finalPermissions }),
      });
      await loadAdmin();
      setStatus("管理员权限已保存。");
    } catch (error) {
      setStatus(friendlyErrorMessage(error, "保存权限失败。"));
    }
    return;
  }

  if (event.target.id !== "profile-admin-form") return;
  event.preventDefault();
  if (!selectedUserId) return;
  setStatus("正在保存小站资料...");
  try {
    await apiRequest(`/api/admin/users/${selectedUserId}/profile`, {
      method: "PATCH",
      body: JSON.stringify({
        nickname: qs("#detail-nickname").value.trim(),
        bio: qs("#detail-bio").value.trim(),
        community: qs("#detail-community").value.trim(),
        activityArea: qs("#detail-area").value.trim(),
      }),
    });
    await loadAdmin();
    setStatus("小站资料已保存。");
  } catch (error) {
    setStatus(friendlyErrorMessage(error, "保存资料失败。"));
  }
});

qs("#drawer-body").addEventListener("click", async (event) => {
  if (event.target.matches('input[name="admin-permission"][value="*"]')) {
    const disabled = event.target.checked;
    qsa('input[name="admin-permission"]').forEach((input) => {
      if (input.value !== "*") input.disabled = disabled;
    });
    return;
  }

  const button = event.target.closest("[data-agent-toggle]");
  if (!button || !selectedUserId) return;
  button.disabled = true;
  const agentId = button.dataset.agentToggle;
  const agent = currentAgents.find((item) => item.key === agentId);
  try {
    await apiRequest(`/api/admin/users/${selectedUserId}/agents/${agentId}`, {
      method: "PATCH",
      body: JSON.stringify({
        enabled: button.dataset.enabled === "true",
        alias: agent?.name || "",
        grantedScopes: ["profile:read", "messages:read"],
      }),
    });
    await loadAdmin();
    setStatus("Agent 授权已更新。");
  } catch (error) {
    setStatus(friendlyErrorMessage(error, "Agent 授权更新失败。"));
  } finally {
    button.disabled = false;
  }
});

loadAdmin();
