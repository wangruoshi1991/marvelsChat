import { HttpError } from "./http-error.js";
import { query } from "./db.js";
import { resolveAIContextReferences } from "./ai-context.js";
import { createProductCatalogRepository, isCurrentProductContract, isCurrentProductDependency } from "./product-catalog-repository.js";

export function agentScopesMatchDeclaration(agent, grantedScopes) {
  if (!Array.isArray(agent?.permissions) || !Array.isArray(grantedScopes)) return false;
  const declared = new Set(agent.permissions);
  const granted = new Set(grantedScopes);
  return declared.size === granted.size && [...declared].every(scope => granted.has(scope));
}

// user_agents is a display/availability projection, never an execution grant.
// Read the exact consented version on every execution checkpoint. These reads
// do not acquire product locks after callers already locked users/tasks.
export async function assertAgentProductEntitlement({ userId, agent, queryFn = query }) {
  if (agent?.key === "miaoxun-butler") return { systemInitialization: true };
  const candidates = await queryFn(`SELECT e.product_id, e.product_version_id, e.contract_hash, e.granted_scopes
    FROM user_entitlements e JOIN product_agent_dependencies d ON d.product_version_id = e.product_version_id
    WHERE e.user_id = ? AND e.status = 'enabled' AND d.agent_key = ? ORDER BY e.id`, [userId, agent?.key]);
  const repository = createProductCatalogRepository({ query: queryFn });
  for (const candidate of candidates) {
    const product = await repository.getProduct(String(candidate.product_id).trim(), { productVersionId: String(candidate.product_version_id).trim() });
    if (!product || product.status !== "published" || !isCurrentProductContract(product) || candidate.contract_hash !== product.contractHash ||
      !product.dependencies.length || !product.dependencies.every(isCurrentProductDependency)) continue;
    const dependency = product.dependencies.find(item => item.agentKey === agent.key);
    if (!dependency || dependency.version !== agent.version || !agentScopesMatchDeclaration(agent, dependency.scopes)) continue;
    const required = [...new Set(product.dependencies.flatMap(item => item.scopes))];
    const granted = typeof candidate.granted_scopes === "string" ? JSON.parse(candidate.granted_scopes) : candidate.granted_scopes;
    if (!Array.isArray(granted) || required.length !== granted.length || required.some(scope => !granted.includes(scope))) continue;
    return { productId: product.id, productVersionId: product.productVersionId, agentReleaseId: dependency.agentReleaseId, contractHash: product.contractHash };
  }
  throw new HttpError(403, "当前 Agent 没有匹配运行版本的有效产品授权，请重新确认产品权限。", { code: "AGENT_PRODUCT_ENTITLEMENT_REQUIRED" });
}

export async function assertCurrentAgentAccess({ userId, agent, grantedScopes, contextRefs, queryFn = query, lock = false }) {
  if (lock) await queryFn("SELECT id FROM users WHERE id = ? FOR SHARE", [userId]);
  const rows = await queryFn(`SELECT a.enabled, a.granted_scopes FROM user_agents a JOIN users u ON u.id = a.user_id
    WHERE a.user_id = ? AND a.agent_id = ? AND u.status = 'active'${lock ? " FOR SHARE OF a" : ""}`, [userId, agent.key]);
  const currentScopes = rows[0]?.granted_scopes || [];
  if (!rows[0]?.enabled || !agentScopesMatchDeclaration(agent, currentScopes) || !grantedScopes.every(scope => currentScopes.includes(scope))) {
    throw new HttpError(403, "Agent 授权已撤回或范围已变化，请在“我”移除后重新添加。", { code: "AI_ACCESS_REVOKED" });
  }
  await assertAgentProductEntitlement({ userId, agent, queryFn });
  return resolveAIContextReferences({ userId, refs: contextRefs,
    grantedScopes: currentScopes.filter(scope => agent.permissions.includes(scope)), queryFn, lock });
}

export function assertAgentAvailable(agentContext, agentId) {
  const agent = agentContext.registeredAgents.find((item) => item.key === agentId);
  if (!agent) throw new HttpError(404, "Agent is not registered");
  // Execution requires a complete, current publication projection. A missing
  // catalog field is an invalid state, never an implicit legacy allowance.
  if (agent.catalogStatus !== "published") {
    throw new HttpError(409, "Agent release is unavailable", { code: "AGENT_RELEASE_UNAVAILABLE" });
  }
  if (!agent.version || !agent.releaseVersion || agent.releaseVersion !== agent.version) {
    throw new HttpError(409, "Agent release version is stale", { code: "AGENT_RELEASE_STALE" });
  }
  if (!agent.identity || !agent.contractHash) {
    throw new HttpError(409, "Agent identity contract is incomplete", { code: "AGENT_IDENTITY_CONTRACT_INCOMPLETE" });
  }
  const access = agentContext.ownedAgents.find((item) => item.id === agentId && item.enabled);
  if (!access) throw new HttpError(403, "Agent is not enabled for this account");
  if (!agentScopesMatchDeclaration(agent, access.grantedScopes)) {
    throw new HttpError(403, "Agent 授权范围已变化，请在“我”移除后重新添加。", { code: "AI_ACCESS_REVOKED" });
  }
  return { agent, access, grantedScopes: [...access.grantedScopes] };
}

export function buildAgentAppContext(agentContext, access, clientContext) {
  const scopes = new Set(access.grantedScopes);
  return {
    profile: scopes.has("profile:read") ? agentContext.profile : null,
    modules: scopes.has("agents:invoke") ? agentContext.modules : {},
    ownedAgents: scopes.has("agents:invoke") ? agentContext.ownedAgents : [],
    stationContent: scopes.has("station:read") ? agentContext.stationContent : null,
    client: clientContext || null,
  };
}
