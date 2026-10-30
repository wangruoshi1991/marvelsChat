import { escapeHtml } from "../../admin-core.js";

export function agentIdentityCard(agent = {}) {
  // The published AgentIdentity is the only presentation source. Runtime
  // registry rows and legacy catalogue wrappers are intentionally ignored so
  // a missing contract remains visible to operators.
  const identity = agent.identity;
  const required = ["key", "avatarKind", "displayName", "description", "mark", "shape", "colors", "source", "updatedAt"];
  const hex = value => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);
  const complete = required.every((field) => identity?.[field] !== undefined && identity?.[field] !== null && identity?.[field] !== "")
    && identity.avatarKind === "agent-mark"
    && ["circle", "squircle", "rounded"].includes(identity.shape)
    && ["background", "foreground", "accent"].every(field => hex(identity.colors?.[field]));
  if (!complete) return `<article class="identity-card identity-error"><strong>身份合同错误</strong><p>服务端未返回完整 Agent identity，已停止渲染。</p></article>`;
  return `<article class="identity-card"><div class="identity-mark" data-shape="${escapeHtml(identity.shape)}">${escapeHtml(identity.mark)}</div><div><strong>${escapeHtml(identity.displayName)}</strong><p>${escapeHtml(identity.description)}</p><small>${escapeHtml(identity.key)} · ${escapeHtml(identity.source)}</small></div></article>`;
}
