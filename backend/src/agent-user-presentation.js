import { canonicalizeContract, isCompleteAgentIdentity } from "../../shared/agent-catalog.js";
import { isCurrentProductContract, isCurrentProductDependency } from "./product-catalog-repository.js";

// The runtime registry owns capabilities. A user's effective published product
// version owns presentation, including the historical version they consented to.
// Recommendations use the latest publication only when no prior grant selects
// another still-executable version. No grant is created or upgraded here.
export function withUserAgentPresentation(agents, catalog) {
  const byKey = new Map();
  for (const product of catalog.products || []) {
    if (product.status !== "published" || !isCurrentProductContract(product)) continue;
    for (const dependency of product.dependencies || []) {
      if (!isCurrentProductDependency(dependency)) continue;
      const identity = dependency.identity;
      if (!isCompleteAgentIdentity(identity)) continue;
      const candidates = byKey.get(dependency.agentKey) || [];
      candidates.push({
        dependency,
        enabled: Boolean(product.productVersionId) && (catalog.entitlements || []).some(entitlement =>
          entitlement.status === "enabled" && entitlement.productId === product.id &&
          entitlement.productVersionId === product.productVersionId),
      });
      byKey.set(dependency.agentKey, candidates);
    }
  }
  return agents.map((agent) => {
    if (agent.key === "miaoxun-butler") return agent;
    const candidates = byKey.get(agent.key) || [];
    const enabled = candidates.filter(candidate => candidate.enabled);
    const effective = enabled.length ? enabled : candidates;
    const dependency = effective[0]?.dependency;
    if (dependency && effective.some(candidate =>
      canonicalizeContract(candidate.dependency.identity) !== canonicalizeContract(dependency.identity))) {
      return {
        ...agent, name: null, description: null, identity: null, contractHash: null,
        releaseVersion: null, published: false, catalogStatus: "unpublished",
        identityError: { code: "AGENT_PRODUCT_IDENTITY_CONFLICT", message: "该 Agent 的已发布产品提供了冲突身份，请由管理员核对产品与授权版本。" },
      };
    }
    if (!dependency || dependency.version !== agent.version) return { ...agent, published: false };
    return {
      ...agent, name: dependency.identity.displayName, description: dependency.identity.description,
      identity: dependency.identity, contractHash: dependency.contractHash,
      releaseVersion: dependency.version, published: true, catalogStatus: "published",
      identityError: undefined,
    };
  });
}
