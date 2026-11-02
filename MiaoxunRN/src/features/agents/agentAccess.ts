import {
  AgentDTO,
  OwnedAgentDTO,
  ProductCatalogProductDTO,
  ProductEntitlementDTO,
} from '../../models/api';
import { isCompleteAgentIdentity } from '../messages/agentIdentity';

export type AgentProductAccessState =
  | 'available'
  | 'product_paused'
  | 'product_unavailable'
  | 'entitlement_unavailable'
  | 'reconsent_required'
  | 'product_not_published'
  | 'catalog_unavailable';

type CurrentAgentContract = Pick<
  AgentDTO,
  'key' | 'version' | 'permissions' | 'identity' | 'identityError'
> & { contractHash?: string | null };

function sameScopes(left: string[], right: string[]) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((scope, index) => scope === b[index]);
}

function sameIdentity(left: unknown, right: AgentDTO['identity'], key: string) {
  if (!left || typeof left !== 'object' || Array.isArray(left)) return false;
  const candidate = left as Record<string, unknown>;
  const colors = candidate.colors;
  if (!isCompleteAgentIdentity(left) || !isCompleteAgentIdentity(right))
    return false;
  if (
    left.avatarKind === 'agent-image' &&
    (right.avatarKind !== 'agent-image' ||
      left.avatar.assetId !== right.avatar.assetId ||
      left.avatar.url !== right.avatar.url ||
      left.avatar.sha256 !== right.avatar.sha256 ||
      left.avatar.mimeType !== right.avatar.mimeType ||
      left.avatar.width !== right.avatar.width ||
      left.avatar.height !== right.avatar.height)
  )
    return false;
  return (
    (candidate.key === undefined || candidate.key === key) &&
    candidate.avatarKind === right.avatarKind &&
    candidate.mark === right.mark &&
    candidate.shape === right.shape &&
    colors &&
    typeof colors === 'object' &&
    (colors as Record<string, unknown>).background ===
      right.colors.background &&
    (colors as Record<string, unknown>).foreground ===
      right.colors.foreground &&
    (colors as Record<string, unknown>).accent === right.colors.accent
  );
}

export function resolveAgentProductAccess(
  agent: CurrentAgentContract,
  options: {
    products: ProductCatalogProductDTO[];
    entitlements: ProductEntitlementDTO[];
    catalogRevision: string | null;
  },
): AgentProductAccessState {
  // 妙讯管家 is initialized by the server as a system capability. Keep its
  // existing conversation and bootstrap path independent from ordinary Agent
  // products while all other recommendations follow the published catalog.
  if (agent.key === 'miaoxun-butler') return 'available';
  if (agent.identityError?.code === 'AGENT_PRODUCT_IDENTITY_CONFLICT')
    return 'catalog_unavailable';
  if (!options.products || !options.entitlements || !options.catalogRevision)
    return 'catalog_unavailable';
  let candidates = options.products.filter(item =>
    item.dependencies.some(dependency => dependency.agentKey === agent.key),
  );
  if (!candidates.length) return 'product_not_published';
  if (candidates.length > 1) {
    const enabled = candidates.filter(item =>
      options.entitlements.some(
        entitlement =>
          entitlement.status === 'enabled' &&
          entitlement.productId === item.id &&
          entitlement.productVersionId === item.productVersionId,
      ),
    );
    if (enabled.length !== 1) return 'catalog_unavailable';
    candidates = enabled;
  }
  const product = candidates[0];
  if (product.status === 'paused') return 'product_paused';
  if (product.status !== 'published') return 'product_unavailable';
  if (!product.productVersionId || !product.version)
    return 'product_unavailable';
  const dependencies = product.dependencies.filter(
    dependency => dependency.agentKey === agent.key,
  );
  if (dependencies.length !== 1) return 'catalog_unavailable';
  const dependency = dependencies[0] as (typeof dependencies)[number] & {
    identity?: unknown;
  };
  if (
    dependency.version !== agent.version ||
    !sameScopes(dependency.scopes, agent.permissions) ||
    !dependency.contractHash ||
    (agent.contractHash && dependency.contractHash !== agent.contractHash) ||
    (dependency.identity &&
      !sameIdentity(dependency.identity, agent.identity, agent.key))
  )
    return 'product_unavailable';
  const entitlement = options.entitlements.find(
    item =>
      (item.productId === product.id &&
        item.productVersionId === product.productVersionId) ||
      (item.productKey === product.productKey &&
        item.version === product.version &&
        item.productVersionId === product.productVersionId),
  );
  if (entitlement?.status === 'unavailable') return 'entitlement_unavailable';
  if (entitlement?.status === 'reconsent_required') return 'reconsent_required';
  return 'available';
}

export function agentAccessMatchesDeclaration(
  agent: AgentDTO,
  owned?: OwnedAgentDTO,
) {
  if (!owned?.enabled) return false;
  const granted = new Set(owned.grantedScopes);
  const declared = new Set(agent.permissions);
  return (
    granted.size === declared.size &&
    [...declared].every(scope => granted.has(scope))
  );
}

// Used only in memory. Never persist or display the session identity or snapshot.
export function agentAccessSnapshot(
  agents: AgentDTO[],
  ownedAgents: OwnedAgentDTO[],
  catalog?: {
    products: ProductCatalogProductDTO[];
    catalogRevision: string | null;
  },
) {
  return JSON.stringify({ agents, ownedAgents, ...catalog });
}
