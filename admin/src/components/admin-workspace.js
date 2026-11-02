export const ADMIN_NAV_GROUPS = [
  { key: "workspace", label: "工作台", children: [{ key: "overview", label: "运营总览", description: "全局指标与待处理事项" }] },
  { key: "accounts", label: "账户中心", children: [{ key: "users", label: "用户与权限", description: "账号、角色、会话与授权" }] },
  { key: "publishing", label: "发布中心", children: [
    { key: "releases", label: "Agent 发布", description: "registry、release、identity 与审核" },
    { key: "products", label: "产品目录", description: "产品版本、依赖与上架状态" },
    { key: "media", label: "媒体检索", description: "索引运行、预算与诊断" },
  ] },
  { key: "operations", label: "运营中心", children: [
    { key: "tasks", label: "任务管理", description: "队列、执行、恢复与取消" },
    { key: "monitoring", label: "运行监控", description: "Agent、产品与用户运行指标" },
  ] },
  { key: "system", label: "系统中心", children: [
    { key: "audit", label: "审计记录", description: "后台操作与 Agent 运行证据" },
    { key: "system", label: "服务配置", description: "模型运行时与服务状态" },
  ] },
];

export const ADMIN_PAGE_DEFINITIONS = Object.fromEntries(
  ADMIN_NAV_GROUPS.flatMap((group) => group.children.map((page) => [page.key, { ...page, group: group.label }])),
);

export function hasAdminPermission(user, permission) {
  const permissions = Array.isArray(user?.adminPermissions) ? user.adminPermissions : [];
  return user?.role === "admin" && (permissions.includes("*") || permissions.includes(permission));
}

export function visibleResourcePages(user, current, links = []) {
  const allowed = new Set(filterAdminNav(user).flatMap((group) => group.children.map((page) => page.key)));
  return (links.length ? links : Object.values(ADMIN_PAGE_DEFINITIONS).filter((page) => page.group === ADMIN_PAGE_DEFINITIONS[current]?.group)).filter((page) => allowed.has(page.key));
}

export function activeAdminPage(pathname = "") {
  const normalized = String(pathname).replace(/^\/admin(?:\/|$)/, "/");
  const key = normalized.split("/").filter(Boolean)[0] || "overview";
  return ADMIN_PAGE_DEFINITIONS[key] ? key : "overview";
}

export function filterAdminNav(user) {
  const permissions = Array.isArray(user?.adminPermissions) ? user.adminPermissions : [];
  if (user?.role !== "admin") return [];
  const permissionFor = {
    overview: "users:read", users: "users:read", releases: "agents:manage", products: "products:read",
    media: "agents:manage", tasks: "tasks:read", monitoring: "audit:read", audit: "audit:read", system: "model:operate",
  };
  return ADMIN_NAV_GROUPS.map((group) => ({
    ...group,
    children: group.children.filter((child) => permissions.includes("*") || permissions.includes(permissionFor[child.key])),
  })).filter((group) => group.children.length);
}

export function resourceHref(key) {
  // BrowserRouter owns the /admin basename. Internal links must remain
  // basename-relative or React Router will resolve them as /admin/admin/… .
  return ADMIN_PAGE_DEFINITIONS[key] ? `/${key}` : "/overview";
}

