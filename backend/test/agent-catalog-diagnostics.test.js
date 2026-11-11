import assert from "node:assert/strict";
import test from "node:test";
import { createAgentCatalogDiagnostics } from "../src/agent-catalog-diagnostics.js";
import { computeProductContractHash, isCurrentProductDependency, productDependencyBlockers } from "../src/product-catalog-repository.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";

const identity = { key: "comic-diary", avatarKind: "agent-mark", displayName: "漫画", description: "漫画分镜与生成", mark: "漫", shape: "rounded", colors: { background: "#123456", foreground: "#ffffff", accent: "#abcdef" }, published: true, source: "admin", updatedAt: "2026-11-11T00:00:00.000Z" };
const agent = { key: "comic-diary", version: "0.1.4", permissions: ["messages:read", "media:image:generate"], published: true };
const release = { id: "release", agentKey: agent.key, version: agent.version, catalogStatus: "published", identity, declaredScopes: agent.permissions, contractHash: computeAgentReleaseContractHash({ key: agent.key, version: agent.version, identity, permissions: agent.permissions }) };
function product(overrides = {}) {
  const value = { id: "product", productKey: "comic", productVersionId: "version", version: "1.0.0", status: "published", identity, displayName: "漫画", description: "", supportedPlatforms: ["ios"], dependencies: [{ agentKey: agent.key, agentReleaseId: release.id, version: agent.version, scopes: agent.permissions, declaredScopes: agent.permissions, registryDeclaredScopes: agent.permissions, registryVersion: agent.version, registryStatus: "registered", releaseStatus: "published", readiness: { ready: true }, identity, contractHash: "a".repeat(64) }], ...overrides };
  return { ...value, contractHash: computeProductContractHash(value) };
}
const diagnose = ({ source = [agent], published = [], associated = [] } = {}) => createAgentCatalogDiagnostics({
  listRegistered: async () => source,
  readRegisteredCatalogue: async agents => agents,
  readPublishedCatalog: async () => ({ products: published }),
  readProduct: async (_id, { productVersionId }) => associated.find(value => value.productVersionId === productVersionId),
});
const associations = values => values.map(value => ({ id: value.id, productVersionId: value.productVersionId }));

test("published release without a product is explicitly unavailable in the App catalog", async () => {
  const result = await diagnose()({ release, products: [] });
  assert.equal(result.visible, false);
  assert.equal(result.selectedReleaseVisible, false);
  assert.equal(result.sourceVersion, "0.1.4");
  assert.ok(result.reasons.some(reason => reason.code === "AGENT_PRODUCT_UNAVAILABLE"));
});

test("exact current published product makes its release visible without granting consent", async () => {
  const value = product();
  const result = await diagnose({ published: [value], associated: [value] })({ release, products: associations([value]) });
  assert.equal(result.visible, true);
  assert.equal(result.selectedReleaseVisible, true);
  assert.deepEqual(result.reasons, []);
  assert.deepEqual(result.products[0].reasons, []);
});

test("old release and stale dependency identify source and registry version blockers", async () => {
  const oldRelease = { ...release, version: "0.1.3" };
  const value = product({ dependencies: [{ ...product().dependencies[0], version: "0.1.3" }] });
  const result = await diagnose({ associated: [value] })({ release: oldRelease, products: associations([value]) });
  assert.equal(result.visible, false);
  assert.ok(result.reasons.some(reason => reason.code === "SOURCE_VERSION_STALE"));
  assert.ok(result.products[0].reasons.some(reason => reason.code === "REGISTRY_VERSION_STALE"));
});

test("published label never masks invalid product contract or incomplete identity", async () => {
  const value = { ...product(), contractHash: "invalid" };
  const result = await diagnose({ associated: [value] })({ release: { ...release, identity: null }, products: associations([value]) });
  assert.ok(result.reasons.some(reason => reason.code === "IDENTITY_INCOMPLETE"));
  assert.ok(result.products[0].reasons.some(reason => reason.code === "PRODUCT_CONTRACT_STALE"));
});

test("another visible release does not imply the selected release is in the catalog", async () => {
  const latest = product({ dependencies: [{ ...product().dependencies[0], agentReleaseId: "other-release" }] });
  const selected = product({ productVersionId: "previous-version" });
  const result = await diagnose({ published: [latest], associated: [selected] })({ release, products: associations([selected]) });
  assert.equal(result.visible, true);
  assert.equal(result.selectedReleaseVisible, false);
  assert.ok(result.products[0].reasons.some(reason => reason.code === "PRODUCT_VERSION_NOT_IN_CATALOG"));
});

test("conflicting product identities preserve the real catalog failure", async () => {
  const a = product();
  const b = product({ id: "other", identity: { ...identity, displayName: "另一个身份" }, dependencies: [{ ...a.dependencies[0], identity: { ...identity, displayName: "另一个身份" } }] });
  const result = await diagnose({ published: [a, b], associated: [a] })({ release, products: associations([a]) });
  assert.equal(result.visible, false);
  assert.equal(result.selectedReleaseVisible, false);
  assert.ok(result.reasons.some(reason => reason.code === "AGENT_PRODUCT_IDENTITY_CONFLICT"));
});

test("missing source, unpublished release, and permission drift are separately reported", async () => {
  const absent = await diagnose({ source: [] })({ release, products: [] });
  assert.ok(absent.reasons.some(reason => reason.code === "SOURCE_NOT_REGISTERED"));
  const drift = await diagnose()({ release: { ...release, catalogStatus: "review", declaredScopes: ["messages:read"] }, products: [] });
  assert.ok(drift.reasons.some(reason => reason.code === "RELEASE_NOT_PUBLISHED"));
  assert.ok(drift.reasons.some(reason => reason.code === "SOURCE_SCOPES_STALE"));
});

test("catalog read failures remain errors rather than false unpublished diagnoses", async () => {
  const read = createAgentCatalogDiagnostics({
    listRegistered: async () => [agent],
    readRegisteredCatalogue: async value => value,
    readPublishedCatalog: async () => { throw new Error("database unavailable"); },
  });
  await assert.rejects(read({ release, products: [] }), /database unavailable/);
});

test("the built-in butler follows its catalog publication without requiring a product", async () => {
  const butler = { ...agent, key: "miaoxun-butler", contractHash: release.contractHash };
  const selected = { ...release, agentKey: butler.key, identity: { ...identity, key: butler.key } };
  selected.contractHash = computeAgentReleaseContractHash({ key: butler.key, version: agent.version, permissions: agent.permissions, identity: selected.identity });
  butler.contractHash = selected.contractHash;
  const result = await diagnose({ source: [butler] })({ release: selected, products: [] });
  assert.equal(result.visible, true);
  assert.equal(result.selectedReleaseVisible, true);
  assert.deepEqual(result.reasons, []);
});

test("dependency diagnostics and the existing executable gate use the same blockers", () => {
  const current = product().dependencies[0];
  for (const [patch, code] of [
    [{ releaseStatus: "review" }, "RELEASE_NOT_PUBLISHED"],
    [{ readiness: { ready: false } }, "AGENT_NOT_READY"],
    [{ registryStatus: "removed" }, "AGENT_NOT_REGISTERED"],
    [{ registryVersion: "0.1.3" }, "REGISTRY_VERSION_STALE"],
    [{ registryDeclaredScopes: ["messages:read"] }, "REGISTRY_SCOPES_STALE"],
    [{ identity: { ...identity, key: "other-agent" } }, "IDENTITY_INCOMPLETE"],
    [{ contractHash: null }, "RELEASE_CONTRACT_INCOMPLETE"],
  ]) {
    const value = { ...current, ...patch };
    assert.equal(isCurrentProductDependency(value), false);
    assert.ok(productDependencyBlockers(value).some(reason => reason.code === code));
  }
  assert.deepEqual(productDependencyBlockers(current), []);
  assert.equal(isCurrentProductDependency(current), true);
});
