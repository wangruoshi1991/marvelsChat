import { HttpError } from "./http-error.js";

// These are deterministic business rejections. Transport errors, auth failures,
// SQL errors, provider errors and unknown server failures never become a receipt.
const rejections = Object.freeze({
  WORKSPACE_ACCESS_REQUIRED: [403, "请先在“我”的 Agent 管理中授权妙讯管家读取所选内容并发起协作。"],
  WORKSPACE_ACCESS_REVOKED: [403, "账号或协调 Agent 的授权已变化，请确认授权后重新发起任务。"],
  WORKSPACE_AGENT_CHANGED: [409, "协调 Agent 已更新，请重新创建任务。"],
  WORKSPACE_CONTEXT_INVALID: [400, "所选上下文重复，请移除重复引用后重新发起任务。"],
  WORKSPACE_INPUT_TOO_LARGE: [400, "协作请求内容过大，请精简后重新发起任务。"],
  AI_CONTEXT_SCOPE_REQUIRED: [403, "此 Agent 尚未获准读取所选上下文，请确认授权范围或移除引用后重新发起任务。"],
  AI_CONTEXT_NOT_FOUND: [404, "引用内容已删除、撤回或不可访问，请移除引用或重新选择后发起任务。"],
  AI_CONTEXT_CHANGED: [409, "引用内容已变化，请重新选择后发送。"],
});

export function classifiedWorkspaceRejection(error) {
  const entry = error instanceof HttpError && rejections[error.details?.code];
  return entry && entry[0] === error.status ? { code: error.details.code, status: entry[0] } : null;
}

export function workspaceRejectionError({ code, status, idempotencyKey }) {
  const entry = rejections[code];
  if (!entry || entry[0] !== status) throw new TypeError("Invalid durable workspace rejection");
  return new HttpError(status, entry[1], { code, submissionOutcome: "rejected", idempotencyKey });
}
