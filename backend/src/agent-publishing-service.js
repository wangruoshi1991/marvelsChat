import { listAgents } from "../../agents/registry.js";
import { computeAgentReleaseContractHash, isCompleteAgentIdentity } from "../../shared/agent-catalog.js";
import { HttpError } from "./http-error.js";
import { agentReleaseRepository } from "./agent-release-repository.js";
import { isCurrentProductContract, productCatalogRepository } from "./product-catalog-repository.js";
import { createUsageEvent } from "./repositories.js";
import { buildAgentReadiness } from "./agent-readiness-service.js";
import { createAlbumProductLifecycleHook } from "./album-assistant-access-service.js";
import { buildMediaRetrievalRuntimeStatus } from "./media-retrieval-runtime-status.js";
import { assertManagedAgentAvatar, assertAgentImagePublicationReady } from "./agent-avatar-assets.js";

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

  async function deployedAgents() {
    const [agents, readiness] = await Promise.all([listRegisteredAgents(), getReadiness()]);
    return agents.map((agent) => {
      const status = readiness[agent.key];
      const missing = [...new Set(status?.missingEnv || [])];
      return { ...agent, capabilityNeeds: status?.capabilityNeeds || [], identity: { ...agent.identity, key: agent.key, displayName: agent.name, description: agent.description || "", published: false, source: "registry", updatedAt: new Date().toISOString() }, readiness: { ready: Boolean(status?.configured) && missing.length === 0, missing } };
    });
  }

  async function syncRegistry() {
    return releaseRepository.syncRegisteredAgents(await deployedAgents());
  }

  async function listRegistry() {
    const [agents, releases] = await Promise.all([deployedAgents(), releaseRepository.listAgentReleases()]);
    return { agents: agents.map(agent => ({ ...agent, currentReleases: releases.filter(release => release.agentKey === agent.key && release.version === agent.version) })) };
  }

  async function createRelease({ agentKey, identity, sourceReleaseId = null, actorUserId = null, requestId = null }) {
    const agent = (await deployedAgents()).find(item => item.key === agentKey);
    if (!agent) throw new HttpError(404, "Agent has no deployed code registration", { code: "AGENT_NOT_REGISTERED" });
    return releaseRepository.createDraft({ agent, identity, sourceReleaseId, actorUserId, requestId });
  }

  async function withdrawRelease({ releaseId, actorUserId, requestId = null }) {
    return releaseRepository.transition({ releaseId, toStatus: "draft", actorUserId, requestId, reason: "admin_withdraw_review" });
  }

  async function currentReleaseRuntime(release) {
    const registry = (await deployedAgents()).find(agent => agent.key === release.agentKey);
    if (!registry || registry.version !== release.version) throw new HttpError(409, "Agent registry version is stale", { code: "REGISTRY_VERSION_STALE" });
    if (!scopesMatch(registry.permissions, release.declaredScopes)) throw new HttpError(409, "Agent registry permissions are stale", { code: "REGISTRY_SCOPES_STALE" });
    if (!registry.readiness.ready) throw new HttpError(409, "Agent readiness checks have not passed", { code: "AGENT_NOT_READY", missing: registry.readiness.missing });
    return registry;
  }

  async function reviewRelease({ releaseId, actorUserId, requestId = null }) {
    const release = await releaseRepository.getAgentRelease(releaseId);
    if (!release) throw new HttpError(404, "Agent release not found", { code: "RELEASE_NOT_FOUND" });
    if (!isCompleteAgentIdentity(release.identity)) throw new HttpError(422, "Agent identity is incomplete", { code: "IDENTITY_INCOMPLETE" });
    assertAgentImagePublicationReady(release.identity);
    await assertManagedAgentAvatar(release.identity);
    const runtime = await currentReleaseRuntime(release);
    if (!release.declaredScopes.length || new Set(release.declaredScopes).size !== release.declaredScopes.length) throw new HttpError(422, "Agent scopes are incomplete", { code: "SCOPES_INCOMPLETE" });
    const result = await releaseRepository.transition({ releaseId, toStatus: "review", actorUserId, requestId, expectedContractHash: release.contractHash, readiness: runtime.readiness, reason: "admin_review" });
    await recordAudit({ userId: actorUserId, eventType: "admin.agent.release.review", targetType: "agent_release", targetId: releaseId, payload: { requestId } });
    return result;
  }

  async function publishRelease({ releaseId, actorUserId, requestId = null }) {
    const release = await releaseRepository.getAgentRelease(releaseId);
    if (!release) throw new HttpError(404, "Agent release not found", { code: "RELEASE_NOT_FOUND" });
    if (!isCompleteAgentIdentity(release.identity)) throw new HttpError(422, "Agent identity is incomplete", { code: "IDENTITY_INCOMPLETE" });
    assertAgentImagePublicationReady(release.identity);
    await assertManagedAgentAvatar(release.identity);
    const registry = await currentReleaseRuntime(release);
    const expectedHash = computeAgentReleaseContractHash({ key: release.agentKey, version: release.version, permissions: release.declaredScopes, identity: release.identity });
    if (release.contractHash !== expectedHash) throw new HttpError(409, "Agent release contract is stale", { code: "RELEASE_CONTRACT_STALE" });
    const result = await releaseRepository.transition({ releaseId, toStatus: "published", actorUserId, requestId, expectedContractHash: release.contractHash, readiness: registry.readiness, reason: "admin_publish" });
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

  async function submitProduct({ productId, productVersionId = null, actorUserId, requestId = null }) {
    const product = await productRepository.getProduct(productId, { productVersionId });
    if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
    assertAgentImagePublicationReady(product.identity);
    await assertManagedAgentAvatar(product.identity);
    for (const dependency of product.dependencies || []) assertAgentImagePublicationReady(dependency.identity);
    if (!product.dependencies.length) throw new HttpError(422, "Product dependencies are incomplete", { code: "PRODUCT_DEPENDENCIES_REQUIRED" });
    for (const dependency of product.dependencies) {
      if (dependency.releaseStatus !== "published") throw new HttpError(409, `Agent dependency ${dependency.agentKey} is not published`, { code: "AGENT_DEPENDENCY_UNAVAILABLE" });
      if (!dependency.readiness?.ready) throw new HttpError(409, `Agent dependency ${dependency.agentKey} is not ready`, { code: "AGENT_DEPENDENCY_NOT_READY" });
      if (!dependencyRegistryIsCurrent(dependency)) throw new HttpError(409, `Agent dependency ${dependency.agentKey} registration is stale`, { code: "AGENT_DEPENDENCY_REGISTRY_STALE" });
      if ((dependency.scopes || []).some((scope) => !(dependency.declaredScopes || dependency.scopes || []).includes(scope))) throw new HttpError(422, "Product dependency scope is not declared", { code: "SCOPES_MISMATCH" });
      if (!isCompleteAgentIdentity(dependency.identity)) throw new HttpError(422, "Agent dependency identity is incomplete", { code: "IDENTITY_INCOMPLETE" });
    }
    return productRepository.transitionProduct({ productId, productVersionId, toStatus: "review", actorUserId, requestId, reason: "admin_submit" });
  }

  async function publishProduct({ productId, productVersionId = null, actorUserId, requestId = null }) {
    const product = await productRepository.getProduct(productId, { productVersionId });
    if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
    assertAgentImagePublicationReady(product.identity);
    await assertManagedAgentAvatar(product.identity);
    for (const dependency of product.dependencies || []) assertAgentImagePublicationReady(dependency.identity);
    if (!isCurrentProductContract(product)) {
      throw new HttpError(409, "Product contract is stale", { code: "PRODUCT_CONTRACT_STALE" });
    }
    if (!product.dependencies.length || product.dependencies.some((dep) => dep.releaseStatus !== "published" || !dep.readiness?.ready || !dependencyRegistryIsCurrent(dep) || !isCompleteAgentIdentity(dep.identity))) {
      throw new HttpError(409, "Product dependencies have not passed release gates", { code: "PRODUCT_DEPENDENCY_GATE_FAILED" });
    }
    const result = await productRepository.transitionProduct({ productId, productVersionId, toStatus: "published", actorUserId, requestId, reason: "admin_publish" });
    await recordAudit({ userId: actorUserId, eventType: "admin.product.publish", targetType: "product", targetId: productId, payload: { requestId } });
    return result;
  }

  async function pauseProduct({ productId, productVersionId = null, actorUserId, requestId = null }) {
    const result = await productRepository.transitionProduct({
      productId,
      productVersionId,
      toStatus: "paused",
      actorUserId,
      requestId,
      reason: "admin_pause",
      afterProjection: runAlbumProductProjectionHook,
    });
    await recordAudit({ userId: actorUserId, eventType: "admin.product.pause", targetType: "product", targetId: productId, payload: { requestId } });
    return result;
  }

  async function enableProduct({ userId, productId, productVersionId = null, grantedScopes, consentVersion, idempotencyKey }) {
    const product = await productRepository.getProduct(productId);
    if (!product) throw new HttpError(404, "Product not found", { code: "PRODUCT_NOT_FOUND" });
    return productRepository.createEntitlement({ userId, productId, productVersionId, grantedScopes, consentVersion, idempotencyKey, afterProjection: runAlbumProductProjectionHook });
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

  async function setAgentAccessThroughProduct({ userId, agentKey, productVersionId = null, enabled, grantedScopes, consentVersion = null, idempotencyKey = null }) {
    const products = await productRepository.listPublishedProductsForAgent(agentKey, {
      userId,
      publishedOnly: enabled,
      productVersionId: enabled ? productVersionId : null,
    });
    if (!products.length) {
      throw new HttpError(409, "该 Agent 尚未绑定已发布产品，无法授权。", { code: "AGENT_PRODUCT_UNAVAILABLE" });
    }
    if (products.length > 1) {
      throw new HttpError(409, "该 Agent 绑定了多个已发布产品，无法自动选择授权范围。", { code: "AGENT_PRODUCT_MAPPING_AMBIGUOUS", productIds: products.map((product) => product.id) });
    }
    const product = products[0];
    if (enabled) {
      if (productVersionId) {
        const selected = await productRepository.getProduct(product.id, { productVersionId });
        if (!selected?.dependencies?.some(dependency => dependency.agentKey === agentKey)) throw new HttpError(409, "Selected product version does not include this Agent", { code: "PRODUCT_AGENT_VERSION_MISMATCH" });
      }
      return productRepository.createEntitlement({
        userId,
        productId: product.id,
        productVersionId,
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

  return { syncRegistry, listRegistry, createRelease, withdrawRelease, listProducts, listReleases, reviewRelease, publishRelease, setIdentity, createProduct, submitProduct, publishProduct, pauseProduct, enableProduct, disableProduct, setAgentAccessThroughProduct };
}

export const agentPublishingService = createAgentPublishingService();
