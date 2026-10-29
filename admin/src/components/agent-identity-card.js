export function agentIdentityCard(agent = {}) {
  const identity = agent.identity || agent.catalogue || agent;
  const required = ["key", "displayName", "description", "mark", "shape", "colors", "source", "updatedAt"];
  const complete = required.every((field) => identity?.[field] !== undefined && identity?.[field] !== null && identity?.[field] !== "");
  if (!complete) return `<article class="identity-card identity-error"><strong>身份合同错误</strong><p>服务端未返回完整 Agent identity，已停止渲染。</p></article>`;
  return `<article class="identity-card"><div class="identity-mark" data-shape="${identity.shape}">${identity.mark}</div><div><strong>${identity.displayName}</strong><p>${identity.description}</p><small>${identity.key} · ${identity.source}</small></div></article>`;
}
