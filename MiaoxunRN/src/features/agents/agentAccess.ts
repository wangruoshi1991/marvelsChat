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

type AgentProductOptions = {
  products: ProductCatalogProductDTO[];
  entitlements: ProductEntitlementDTO[];
  catalogRevision: string | null;
};

// Display, confirmation and submission must select the same exact product.
// Ambiguous publications never choose or enlarge a user's consent.
export function selectAgentProduct(
  agentKey: string,
  options: AgentProductOptions,
): ProductCatalogProductDTO | null {
  if (!options.products || !options.entitlements || !options.catalogRevision)
    return null;
  const candidates = options.products.filter(item =>
    item.dependencies.some(dependency => dependency.agentKey === agentKey),
  );
  if (candidates.length === 1) return candidates[0];
  const enabled = candidates.filter(item =>
    options.entitlements.some(
      entitlement =>
        entitlement.status === 'enabled' &&
        entitlement.productId === item.id &&
        entitlement.productVersionId === item.productVersionId,
    ),
  );
  return enabled.length === 1 ? enabled[0] : null;
}

type AgentRemovalProduct =
  | {
      state: 'selected';
      product: ProductCatalogProductDTO;
      entitlement: ProductEntitlementDTO;
    }
  | { state: 'ambiguous' | 'unavailable' | 'legacy' };

export function resolveAgentRemovalProduct(
  agentKey: string,
  options: AgentProductOptions,
): AgentRemovalProduct {
  const products = options.products.filter(product =>
    product.dependencies.some(dependency => dependency.agentKey === agentKey),
  );
  const grants = options.entitlements
    .filter(entitlement => entitlement.status !== 'disabled')
    .flatMap(entitlement => {
      const product = products.find(item => item.id === entitlement.productId);
      return product ? [{ product, entitlement }] : [];
    });
  const enabled = grants.filter(item => item.entitlement.status === 'enabled');
  const candidates = enabled.length ? enabled : grants;
  if (candidates.length === 1) return { state: 'selected', ...candidates[0] };
  if (candidates.length > 1) return { state: 'ambiguous' };
  return {
    state: options.entitlements.length === 0 ? 'legacy' : 'unavailable',
  };
}

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
  options: AgentProductOptions,
): AgentProductAccessState {
  // 妙讯管家 is initialized by the server as a system capability. Keep its
  // existing conversation and bootstrap path independent from ordinary Agent
  // products while all other recommendations follow the published catalog.
  if (agent.key === 'miaoxun-butler') return 'available';
  if (agent.identityError?.code === 'AGENT_PRODUCT_IDENTITY_CONFLICT')
    return 'catalog_unavailable';
  if (!options.products || !options.entitlements || !options.catalogRevision)
    return 'catalog_unavailable';
  const product = selectAgentProduct(agent.key, options);
  if (!product)
    return options.products.some(item =>
      item.dependencies.some(dependency => dependency.agentKey === agent.key),
    )
      ? 'catalog_unavailable'
      : 'product_not_published';
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
  // Runtime upgrades can invalidate a historical consent without changing its
  // scopes. An old version that remains enabled still permits existing access.
  const productGrants = options.entitlements.filter(
    item => item.productId === product.id,
  );
  if (
    !productGrants.some(item => item.status === 'enabled') &&
    productGrants.some(
      item =>
        item.productVersionId !== product.productVersionId &&
        (item.status === 'unavailable' || item.status === 'reconsent_required'),
    )
  )
    return 'reconsent_required';
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
    entitlements?: ProductEntitlementDTO[];
    catalogRevision: string | null;
  },
) {
  return JSON.stringify({ agents, ownedAgents, ...catalog });
}
