import { listAgents } from "../../agents/registry.js";
import { computeAgentReleaseContractHash, isCompleteAgentIdentity } from "../../shared/agent-catalog.js";
import { HttpError } from "./http-error.js";
import { agentReleaseRepository } from "./agent-release-repository.js";
import { isCurrentProductContract, productCatalogRepository } from "./product-catalog-repository.js";
import { createUsageEvent } from "./repositories.js";
import { buildAgentReadiness } from "./agent-readiness-service.js";
import { createAlbumProductLifecycleHook } from "./album-assistant-access-service.js";
import { buildMediaRetrievalRuntimeStatus } from "./media-retrieval-runtime-status.js";

function dependencyRegistryIsCurrent(dependency) {
  const releaseScopes = [...new Set(dependency.declaredScopes || [])].sort();
  const registryScopes = [...new Set(dependency.registryDeclaredScopes || [])].sort();
  return dependency.registryStatus === "registered" &&
    dependency.registryVersion === dependency.version &&
    releaseScopes.length === registryScopes.length &&
    releaseScopes.every((scope, index) => scope === registryScopes[index]);
}

function scopesMatch(left = [], right = []) {
  const a = [...new Set(left)].sort();
  const b = [...new Set(right)].sort();
  return a.length === b.length && a.every((scope, index) => scope === b[index]);
}

export function createAgentPublishingService({
  releaseRepository = agentReleaseRepository,
  productRepository = productCatalogRepository,
  listRegisteredAgents = listAgents,
  getReadiness = buildAgentReadiness,
  recordAudit = createUsageEvent,
  afterProductProjection = createAlbumProductLifecycleHook({ getRuntimeStatus: buildMediaRetrievalRuntimeStatus }),
} = {}) {
  const runAlbumProductProjectionHook = async (args) => {
    if (!afterProductProjection || !args.product?.dependencies?.some((dependency) => dependency.agentKey === "album-manager")) return null;
    return afterProductProjection(args);
  };

  async function syncRegistry() {
    const agents = await listRegisteredAgents();
    const readiness = await getReadiness();
    return releaseRepository.syncRegisteredAgents(agents.map((agent) => {
      const status = readiness[agent.key];
      return { ...agent, readiness: { ready: Boolean(status?.configured) && !(status?.missingEnv || []).length, missing: [...(status?.missingEnv || []), ...(status?.capabilityNeeds || [])] } };
    }));
  }

  async function reviewRelease({ releaseId, actorUserId, requestId = null }) {
    const release = await releaseRepository.getAgentRelease(releaseId);
    if (!release) throw new HttpError(404, "Agent release not found", { code: "RELEASE_NOT_FOUND" });
    if (!isCompleteAgentIdentity(release.identity)) throw new HttpError(422, "Agent identity is incomplete", { code: "IDENTITY_INCOMPLETE" });
    if (!release.readiness?.ready) throw new HttpError(409, "Agent readiness checks have not passed", { code: "AGENT_NOT_READY", missing: release.readiness?.missing || [] });
    if (!release.declaredScopes.length || new Set(release.declaredScopes).size !== release.declaredScopes.length) throw new HttpError(422, "Agent scopes are incomplete", { code: "SCOPES_INCOMPLETE" });
    const result = await releaseRepository.transition({ releaseId, toStatus: "review", actorUserId, requestId, reason: "admin_review" });
    await recordAudit({ userId: actorUserId, eventType: "admin.agent.release.review", targetType: "agent_release", targetId: releaseId, payload: { requestId } });
    return result;
  }

  async function publishRelease({ releaseId, actorUserId, requestId = null }) {
    const release = await releaseRepository.getAgentRelease(releaseId);
    if (!release) throw new HttpError(404, "Agent release not found", { code: "RELEASE_NOT_FOUND" });
    if (!isCompleteAgentIdentity(release.identity)) throw new HttpError(422, "Agent identity is incomplete", { code: "IDENTITY_INCOMPLETE" });
    if (!release.readiness?.ready) throw new HttpError(409, "Agent readiness checks have not passed", { code: "AGENT_NOT_READY" });
    const registry = (await listRegisteredAgents()).find((agent) => agent.key === release.agentKey);
    if (!registry || registry.version !== release.version) throw new HttpError(409, "Agent registry version is stale", { code: "REGISTRY_VERSION_STALE" });
    if (!scopesMatch(registry.permissions, release.declaredScopes)) {
      throw new HttpError(409, "Agent registry permissions are stale", { code: "REGISTRY_SCOPES_STALE" });
    }
    const expectedHash = computeAgentReleaseContractHash({ key: release.agentKey, version: release.version, permissions: release.declaredScopes, identity: release.identity });
    if (release.contractHash !== expectedHash) throw new HttpError(409, "Agent release contract is stale", { code: "RELEASE_CONTRACT_STALE" });
    const result = await releaseRepository.transition({ releaseId, toStatus: "published", actorUserId, requestId, reason: "admin_publish" });
    await recordAudit({ userId: actorUserId, eventType: "admin.agent.release.publish", targetType: "agent_release", targetId: releaseId, payload: { requestId } });
    return result;
  }

  async function setIdentity({ releaseId, identity, actorUserId, requestId = null }) {
    return releaseRepository.updateIdentity({ releaseId, identity, actorUserId, requestId });
  }

  async function createProduct(args) {
    return productRepository.createProduct(args);
  }

  async function listProducts(options) {
    return productRepository.listProducts(options);
  }

  async function listReleases(options) {
    return releaseRepository.listAgentReleases(options);
  }

  async function submitProduct({ productId, actorUserId, requestId = null }) {
    const product = await productRepository.getProduct(productId);
    if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
    if (!product.dependencies.length) throw new HttpError(422, "Product dependencies are incomplete", { code: "PRODUCT_DEPENDENCIES_REQUIRED" });
    for (const dependency of product.dependencies) {
      if (dependency.releaseStatus !== "published") throw new HttpError(409, `Agent dependency ${dependency.agentKey} is not published`, { code: "AGENT_DEPENDENCY_UNAVAILABLE" });
      if (!dependency.readiness?.ready) throw new HttpError(409, `Agent dependency ${dependency.agentKey} is not ready`, { code: "AGENT_DEPENDENCY_NOT_READY" });
      if (!dependencyRegistryIsCurrent(dependency)) throw new HttpError(409, `Agent dependency ${dependency.agentKey} registration is stale`, { code: "AGENT_DEPENDENCY_REGISTRY_STALE" });
      if ((dependency.scopes || []).some((scope) => !(dependency.declaredScopes || dependency.scopes || []).includes(scope))) throw new HttpError(422, "Product dependency scope is not declared", { code: "SCOPES_MISMATCH" });
      if (!isCompleteAgentIdentity(dependency.identity)) throw new HttpError(422, "Agent dependency identity is incomplete", { code: "IDENTITY_INCOMPLETE" });
    }
    return productRepository.transitionProduct({ productId, toStatus: "review", actorUserId, requestId, reason: "admin_submit" });
  }

  async function publishProduct({ productId, actorUserId, requestId = null }) {
    const product = await productRepository.getProduct(productId);
    if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
    if (!isCurrentProductContract(product)) {
      throw new HttpError(409, "Product contract is stale", { code: "PRODUCT_CONTRACT_STALE" });
    }
    if (!product.dependencies.length || product.dependencies.some((dep) => dep.releaseStatus !== "published" || !dep.readiness?.ready || !dependencyRegistryIsCurrent(dep) || !isCompleteAgentIdentity(dep.identity))) {
      throw new HttpError(409, "Product dependencies have not passed release gates", { code: "PRODUCT_DEPENDENCY_GATE_FAILED" });
    }
    const result = await productRepository.transitionProduct({ productId, toStatus: "published", actorUserId, requestId, reason: "admin_publish" });
    await recordAudit({ userId: actorUserId, eventType: "admin.product.publish", targetType: "product", targetId: productId, payload: { requestId } });
    return result;
  }

  async function pauseProduct({ productId, actorUserId, requestId = null }) {
    const result = await productRepository.transitionProduct({
      productId,
      toStatus: "paused",
      actorUserId,
      requestId,
      reason: "admin_pause",
      afterProjection: runAlbumProductProjectionHook,
    });
    await recordAudit({ userId: actorUserId, eventType: "admin.product.pause", targetType: "product", targetId: productId, payload: { requestId } });
    return result;
  }

  async function enableProduct({ userId, productId, grantedScopes, consentVersion, idempotencyKey }) {
    const product = await productRepository.getProduct(productId);
    if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
    return productRepository.createEntitlement({ userId, productId, grantedScopes, consentVersion, idempotencyKey, afterProjection: runAlbumProductProjectionHook });
  }

  // Product revocation must use the same projection hook as Agent-level
  // revocation. In particular, disabling the album product must stop and
  // purge its retrieval index when no album entitlement remains.
  async function disableProduct({ userId, productId, idempotencyKey }) {
    return productRepository.disableEntitlement({
      userId,
      productId,
      idempotencyKey,
      afterProjection: runAlbumProductProjectionHook,
    });
  }

  async function setAgentAccessThroughProduct({ userId, agentKey, enabled, grantedScopes, consentVersion = null, idempotencyKey = null }) {
    const products = await productRepository.listPublishedProductsForAgent(agentKey, {
      userId,
      publishedOnly: enabled,
    });
    if (!products.length) {
      throw new HttpError(409, "该 Agent 尚未绑定已发布产品，无法授权。", { code: "AGENT_PRODUCT_UNAVAILABLE" });
    }
    if (products.length > 1) {
      throw new HttpError(409, "该 Agent 绑定了多个已发布产品，无法自动选择授权范围。", { code: "AGENT_PRODUCT_MAPPING_AMBIGUOUS", productIds: products.map((product) => product.id) });
    }
    const product = products[0];
    if (enabled) {
      return productRepository.createEntitlement({
        userId,
        productId: product.id,
        grantedScopes,
        consentVersion,
        idempotencyKey,
        afterProjection: runAlbumProductProjectionHook,
      });
    }
    return productRepository.disableEntitlement({
      userId,
      productId: product.id,
      idempotencyKey,
      afterProjection: runAlbumProductProjectionHook,
    });
  }

  return { syncRegistry, listProducts, listReleases, reviewRelease, publishRelease, setIdentity, createProduct, submitProduct, publishProduct, pauseProduct, enableProduct, disableProduct, setAgentAccessThroughProduct };
}

export const agentPublishingService = createAgentPublishingService();
