import { hasAdminPermission } from "./components/admin-workspace.js";

export const RUN_STATUS_OPTIONS = [
  { value: "pending", label: "待执行" },
  { value: "success", label: "成功" },
  { value: "error", label: "失败" },
];

export async function loadOverviewData(user, request) {
  const endpoints = [
    ["overview", "users:read", "/api/admin/overview?days=30"],
    ["releases", "agents:manage", "/api/admin/agent-releases?page=1&pageSize=8&status=review"],
    ["tasks", "tasks:read", "/api/admin/tasks?limit=8&status=running"],
  ].filter(([, permission]) => hasAdminPermission(user, permission));
  const results = await Promise.allSettled(endpoints.map(([, , path]) => request(path)));
  const state = { overview: null, releases: [], tasks: [], errors: [], resourceErrors: {}, loading: false };
  results.forEach((result, index) => {
    const [name] = endpoints[index];
    if (result.status === "fulfilled") state[name] = name === "overview" ? result.value : result.value?.items || [];
    else {
      state.resourceErrors[name] = result.reason?.message || "读取失败";
      state.errors.push(`${name}: ${state.resourceErrors[name]}`);
    }
  });
  return state;
}

export function taskOperations(task) {
  // Only server-advertised operations may be offered. Missing capability data
  // keeps this row read-only rather than guessing an authorization path.
  const allowed = Array.isArray(task?.allowedOperations) ? task.allowedOperations : [];
  return ["retry", "cancel"].filter((action) => allowed.includes(action));
}

export function taskMetadataItems(task) {
  const fields = [["id", "任务 ID"], ["type", "任务类型"], ["kind", "能力类型"], ["userId", "用户 ID"], ["agentId", "Agent"], ["agentVersion", "Agent 版本"], ["status", "状态"], ["phase", "阶段"], ["revision", "修订"], ["threadId", "会话 ID"], ["failureCode", "失败代码"], ["createdAt", "创建时间"], ["updatedAt", "更新时间"]];
  return fields.map(([key, label]) => ({ key, label, value: task?.[key] ?? "--" }));
}
