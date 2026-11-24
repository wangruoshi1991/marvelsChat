import { DEFAULT_LOCAL_API_ORIGIN } from "./runtime-config.js";

const target = typeof __MIAOXUN_ADMIN_API_TARGET__ === "string" && __MIAOXUN_ADMIN_API_TARGET__
  ? __MIAOXUN_ADMIN_API_TARGET__
  : (window.location.protocol === "file:" ? DEFAULT_LOCAL_API_ORIGIN : "");
const tokenKey = "miaoxun.admin.auth.v2";
const apiPathPattern = /^\/api(?:[/?#]|$)/;
const requestTimeoutMs = 20_000;

export function readAuth() {
  try {
    const value = JSON.parse(sessionStorage.getItem(tokenKey) || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function writeAuth(value) { sessionStorage.setItem(tokenKey, JSON.stringify(value)); }
export function clearAuth() { sessionStorage.removeItem(tokenKey); }
export function apiOrigin() { return target || window.location.origin; }

export async function request(path, options = {}) {
  if (typeof path !== "string" || !apiPathPattern.test(path) ||
    !apiPathPattern.test(new URL(path, "https://admin.invalid").pathname)) {
    throw new TypeError("Admin API paths must start with /api.");
  }
  const auth = readAuth();
  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  if (auth.token) headers.set("Authorization", `Bearer ${auth.token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (!headers.has("X-Request-ID")) {
    headers.set("X-Request-ID", globalThis.crypto.randomUUID?.() ||
      Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join(""));
  }
  const requestId = headers.get("X-Request-ID");
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const timeoutError = new Error("后台服务响应超时，请稍后重试。");
  timeoutError.isTimeout = true;
  timeoutError.requestId = requestId;
  const timeout = setTimeout(() => controller.abort(timeoutError), requestTimeoutMs);
  try {
    const response = await fetch(`${target}${path}`, { ...options, headers, signal });
    const payload = await response.json().catch(error => {
      if (error instanceof SyntaxError) return null;
      throw error;
    });
    if (!response.ok) {
      const error = payload?.error;
      const failure = new Error(error?.message || `请求失败（${response.status}）`);
      failure.status = response.status;
      failure.requestId = error?.requestId || response.headers.get("X-Request-ID") || requestId;
      throw failure;
    }
    if (!payload || !Object.hasOwn(payload, "data") || Object.hasOwn(payload, "error")) {
      const failure = new Error("后台服务响应格式错误，请核对 API 地址与版本。");
      failure.requestId = response.headers.get("X-Request-ID") || requestId;
      throw failure;
    }
    return payload.data;
  } catch (error) {
    if (signal.reason === timeoutError) throw timeoutError;
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const resourcePaths = {
  users: "/api/admin/users",
  releases: "/api/admin/agent-releases",
  products: "/api/admin/products",
  tasks: "/api/admin/tasks",
  monitoring: "/api/admin/monitoring",
  audit: "/api/admin/events",
};

export const dataProvider = {
  getApiUrl: () => target,
  async getList({ resource, pagination, filters, sorters }) {
    const params = new URLSearchParams();
    const current = pagination?.current || 1;
    const pageSize = pagination?.pageSize || 20;
    params.set("page", String(current)); params.set("pageSize", String(pageSize));
    for (const filter of filters || []) if (filter.value !== undefined && filter.value !== "") params.set(filter.field, String(filter.value));
    const sorter = sorters?.[0];
    if (sorter) { params.set("sortBy", sorter.field); params.set("sortOrder", sorter.order === "desc" ? "desc" : "asc"); }
    const value = await request(`${resourcePaths[resource] || `/api/admin/${resource}`}?${params}`);
    const items = Array.isArray(value) ? value : (value?.items || value?.rows || []);
    return { data: items, total: Array.isArray(value) ? items.length : Number(value?.total ?? items.length) };
  },
  async getOne({ resource, id }) { return { data: await request(`${resourcePaths[resource] || `/api/admin/${resource}`}/${encodeURIComponent(id)}`) }; },
  async create({ resource, variables }) { return { data: await request(resourcePaths[resource] || `/api/admin/${resource}`, { method: "POST", body: JSON.stringify(variables) }) }; },
  async update({ resource, id, variables }) { return { data: await request(`${resourcePaths[resource] || `/api/admin/${resource}`}/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(variables) }) }; },
  async deleteOne({ resource, id }) { return { data: await request(`${resourcePaths[resource] || `/api/admin/${resource}`}/${encodeURIComponent(id)}`, { method: "DELETE" }) }; },
  async getMany({ resource, ids }) { return { data: await Promise.all(ids.map(async (id) => (await this.getOne({ resource, id })).data)) }; },
  custom: async ({ url, method = "get", payload, query, headers }) => ({ data: await request(`${url}${query ? `?${new URLSearchParams(query)}` : ""}`, { method: method.toUpperCase(), headers, body: payload ? JSON.stringify(payload) : undefined }) }),
};

export const authProvider = {
  async login({ username, password }) {
    const result = await request("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: username, password }) });
    writeAuth({ token: result.session.token, user: result.user });
    return { success: true, redirectTo: "/overview" };
  },
  async logout() { try { await request("/api/auth/logout", { method: "POST" }); } finally { clearAuth(); } return { success: true, redirectTo: "/login" }; },
  async check() { const auth = readAuth(); if (!auth.token) return { authenticated: false, redirectTo: "/login" }; try { const value = await request("/api/me"); writeAuth({ ...auth, user: value.user || value }); return { authenticated: true }; } catch (error) { if (error?.status === 401) { clearAuth(); return { authenticated: false, redirectTo: "/login" }; } return { authenticated: true, user: auth.user || null, error }; } },
  async getIdentity() { const auth = readAuth(); return auth.user || null; },
  async getPermissions() { return readAuth().user?.adminPermissions || []; },
  onError: async (error) => { if (error?.status === 401) { clearAuth(); return { logout: true, redirectTo: "/login" }; } return {}; },
};

export const accessControlProvider = {
  can: async ({ resource, action }) => {
    const user = readAuth().user;
    const permission = { users: "users:read", releases: "agents:manage", products: "products:read", tasks: "tasks:read", monitoring: "audit:read", audit: "audit:read", system: "model:operate", media: "agents:manage" }[resource];
    const permissions = user?.adminPermissions || [];
    const allowed = user?.role === "admin" && (permissions.includes("*") || permissions.includes(permission));
    if (action === "list" || action === "show") return { can: allowed };
    const mutationPermission = { users: "users:write", releases: "agents:manage", products: "products:write", tasks: "tasks:write", media: "agents:manage", system: "model:operate" }[resource] || permission;
    return { can: user?.role === "admin" && (permissions.includes("*") || permissions.includes(mutationPermission)) };
  },
};
