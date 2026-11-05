import assert from "node:assert/strict";
import test from "node:test";
import { withUserAgentPresentation } from "../src/agent-user-presentation.js";
import { computeProductContractHash, resolveEntitlementStatus } from "../src/product-catalog-repository.js";
import { registerAppRoutes } from "../src/routes/app-routes.js";

const identity = (name) => ({ key: "demo", avatarKind: "agent-mark", displayName: name, description: "", mark: "D", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#abcdef" }, published: true, source: "admin", updatedAt: "2026-11-02T00:00:00.000Z" });
const agent = { key: "demo", version: "1.0.0", name: "New name", identity: identity("New name"), permissions: ["messages:read"], published: true };
function product(name, { id = "product", versionId = "version-1", agentKey = "demo" } = {}) {
  const result = { id, productKey: `${id}-key`, productVersionId: versionId, version: "1.0.0", displayName: name, description: "", identity: identity(name), supportedPlatforms: ["ios"], status: "published", dependencies: [{ agentKey, agentReleaseId: "release", version: "1.0.0", scopes: ["messages:read"], declaredScopes: ["messages:read"], registryDeclaredScopes: ["messages:read"], releaseStatus: "published", registryStatus: "registered", registryVersion: "1.0.0", readiness: { ready: true }, identity: { ...identity(name), key: agentKey }, contractHash: "a".repeat(64) }] };
  return { ...result, contractHash: computeProductContractHash(result) };
}
const enabledGrant = (selected) => ({ productId: selected.id, productVersionId: selected.productVersionId, status: "enabled" });
test("reconsent is required only for changed contracts of executable published products", () => {
  const published = product("Published");
  const status = (storedStatus, selected, storedContractHash) => resolveEntitlementStatus({ storedStatus, product: selected, storedContractHash });
  assert.equal(status("enabled", published, published.contractHash), "enabled");
  assert.equal(status("enabled", published, "b".repeat(64)), "reconsent_required");
  assert.equal(status("enabled", { ...published, status: "paused" }, "b".repeat(64)), "unavailable");
  assert.equal(status("enabled", { ...published, contractHash: "invalid" }, "b".repeat(64)), "unavailable");
  assert.equal(status("disabled", published, "b".repeat(64)), "disabled");
});
test("effective product version preserves a consenting user's release identity independently of global catalog", () => {
  const [resolved] = withUserAgentPresentation([agent], { products: [product("Original name")] });
  assert.equal(resolved.name, "Original name");
  assert.equal(resolved.identity.displayName, "Original name");
  assert.equal(resolved.contractHash, "a".repeat(64));
  assert.equal(agent.name, "New name");
});
test("drafts and stale runtimes do not expose ordinary Agents", () => {
  assert.equal(withUserAgentPresentation([agent], { products: [] })[0].published, false);
  const draft = { ...product("Draft"), status: "draft" };
  assert.equal(withUserAgentPresentation([agent], { products: [draft] })[0].published, false);
  assert.equal(withUserAgentPresentation([{ ...agent, version: "2.0.0" }], { products: [product("Old")] })[0].published, false);
  const butler = { key: "miaoxun-butler", published: true };
  assert.equal(withUserAgentPresentation([butler], { products: [] })[0], butler);
});

test("an exact enabled product version keeps its identity when an unrelated product is published", () => {
  const original = product("Original", { id: "original-product", versionId: "original-version" });
  const unrelated = product("Revised", { id: "other-product", versionId: "other-version" });
  const [resolved] = withUserAgentPresentation([{ ...agent, identityError: { code: "STALE" } }], { products: [unrelated, original], entitlements: [enabledGrant(original)] });
  assert.equal(resolved.published, true);
  assert.equal(resolved.identity.displayName, "Original");
  assert.equal(resolved.identityError, undefined);
});

test("a grant for another version cannot silently select a conflicting presentation", () => {
  const original = product("Original");
  const other = product("Revised", { versionId: "version-2" });
  const [resolved] = withUserAgentPresentation([agent], { products: [original, other], entitlements: [enabledGrant({ ...original, productVersionId: "missing-version" })] });
  assert.equal(resolved.published, false);
  assert.equal(resolved.identity, null);
  assert.equal(resolved.identityError.code, "AGENT_PRODUCT_IDENTITY_CONFLICT");
});

test("conflicting ungranted identities isolate the affected Agent and keep other recommendations available", () => {
  const healthy = { ...agent, key: "healthy" };
  const healthyProduct = product("Healthy", { id: "healthy-product", agentKey: "healthy" });
  const [conflicted, unaffected] = withUserAgentPresentation([agent, healthy], { products: [product("A"), product("B", { id: "other" }), healthyProduct], entitlements: [] });
  assert.equal(conflicted.published, false);
  assert.equal(conflicted.catalogStatus, "unpublished");
  assert.equal(conflicted.identityError.code, "AGENT_PRODUCT_IDENTITY_CONFLICT");
  assert.equal(unaffected.published, true);
  assert.equal(unaffected.name, "Healthy");
});

test("multiple conflicting enabled identities fail only the affected Agent", () => {
  const a = product("A");
  const b = product("B", { id: "other" });
  const [resolved] = withUserAgentPresentation([agent], { products: [a, b], entitlements: [enabledGrant(a), enabledGrant(b)] });
  assert.equal(resolved.published, false);
  assert.equal(resolved.identity, null);
  assert.equal(resolved.contractHash, null);
  assert.equal(resolved.identityError.code, "AGENT_PRODUCT_IDENTITY_CONFLICT");
});

test("disabled or unavailable grants never resolve an ambiguous recommendation", () => {
  const a = product("A");
  for (const status of ["disabled", "unavailable", "reconsent_required"]) {
    const [resolved] = withUserAgentPresentation([agent], { products: [a, product("B", { id: "other" })], entitlements: [{ ...enabledGrant(a), status }] });
    assert.equal(resolved.published, false);
    assert.equal(resolved.identityError.code, "AGENT_PRODUCT_IDENTITY_CONFLICT");
  }
});

test("consistent published presentation remains available without selecting an entitlement", () => {
  const [resolved] = withUserAgentPresentation([agent], { products: [product("Same"), product("Same", { id: "other" })], entitlements: [] });
  assert.equal(resolved.published, true);
  assert.equal(resolved.name, "Same");
});

test("bootstrap returns healthy resources when an ungranted Agent has conflicting published identities", async () => {
  const routes = new Map();
  const app = Object.fromEntries(["get", "post", "patch", "delete"].map(method => [method, (path, ...handlers) => routes.set(`${method} ${path}`, handlers.at(-1))]));
  const catalog = { products: [product("A"), product("B", { id: "other" }), product("Healthy", { id: "healthy-product", agentKey: "healthy" })], entitlements: [], catalogRevision: "test-revision", catalogStatus: "ready" };
  registerAppRoutes(app, {
    authenticate: (_req, _res, next) => next(), asyncHandler: handler => handler,
    getOnlineUserIds: () => [], sendPresenceChanged: () => undefined,
    resolveRegisteredAgents: async () => [agent, { ...agent, key: "healthy" }],
    getPublishedCatalog: async () => catalog,
    getBootstrap: async (_user, registered, _online, all) => ({ messagesByThread: {}, agents: { registered, owned: [{ id: "demo", identity: all.find(item => item.key === "demo").identity }] } }),
  });
  let payload;
  await routes.get("get /api/app/bootstrap")({ user: { id: "test-user" } }, { json: value => { payload = value; } });
  assert.equal(payload.data.catalogStatus, "ready");
  assert.equal(payload.data.agents.registered.find(item => item.key === "healthy").published, true);
  assert.equal(payload.data.agents.registered.find(item => item.key === "demo").identityError.code, "AGENT_PRODUCT_IDENTITY_CONFLICT");
});
