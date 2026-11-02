import assert from "node:assert/strict";
import test from "node:test";
import { createAgentPublishingService } from "../src/agent-publishing-service.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";
import { createAgentReleaseRepository } from "../src/agent-release-repository.js";

const identity = { key: "demo-agent", avatarKind: "agent-mark", displayName: "运营 Agent", description: "已部署能力", mark: "演", shape: "circle", colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" }, published: false, source: "admin", updatedAt: "2026-11-02T00:00:00.000Z" };
const agent = { key: "demo-agent", version: "1.0.0", name: "代码 Agent", description: "代码说明", permissions: ["messages:read"], identity: { avatarKind: "agent-mark", mark: "演", shape: "circle", colors: identity.colors } };

test("registry intake lists actual deployed capabilities without synchronizing or creating drafts", async () => {
  const service = createAgentPublishingService({ listRegisteredAgents: async () => [agent], getReadiness: async () => ({ "demo-agent": { configured: true, missingEnv: [], capabilityNeeds: [] } }), releaseRepository: { listAgentReleases: async () => [{ id: "r1", agentKey: agent.key, version: "1.0.0" }], syncRegisteredAgents: async () => assert.fail("read-only registry must not write") } });
  const result = await service.listRegistry();
  assert.equal(result.agents[0].key, agent.key);
  assert.deepEqual(result.agents[0].readiness, { ready: true, missing: [] });
  assert.equal(result.agents[0].currentReleases[0].id, "r1");
});

test("release intake rejects keys that have no deployed runtime", async () => {
  const service = createAgentPublishingService({ listRegisteredAgents: async () => [agent], getReadiness: async () => ({}), releaseRepository: { createDraft: async () => assert.fail("unknown code key must not create a release") } });
  await assert.rejects(service.createRelease({ agentKey: "unknown-agent", identity: { ...identity, key: "unknown-agent" } }), error => error.details?.code === "AGENT_NOT_REGISTERED");
});

test("explicit registry synchronization does not manufacture an operator draft", async () => {
  const calls = [];
  const q = async (sql) => { calls.push(sql); if (sql.startsWith("SELECT")) return []; return []; };
  const repository = createAgentReleaseRepository({ withTransaction: async work => work({ query: q }) });
  const result = await repository.syncRegisteredAgents([agent]);
  assert.equal(result[0].releaseId, null);
  assert.equal(calls.some(sql => sql.startsWith("INSERT INTO agent_releases")), false);
  assert.equal(calls.some(sql => sql.includes("UPDATE agent_catalog") || sql.includes("INSERT INTO agent_catalog")), false);
});

test("identity edits cannot mutate review or previously published releases", async () => {
  for (const status of ["review", "published", "unpublished", "archived"]) {
    const q = async sql => sql.startsWith("SELECT * FROM agent_releases") ? [{ id: "r1", agent_key: agent.key, version: agent.version, declared_scopes: agent.permissions, catalog_status: status }] : [];
    const repository = createAgentReleaseRepository({ withTransaction: async work => work({ query: q }) });
    await assert.rejects(repository.updateIdentity({ releaseId: "r1", identity }), error => error.details?.code === "RELEASE_NOT_EDITABLE");
  }
});

test("Agent consent cannot select another product version that omits the requested Agent", async () => {
  const service = createAgentPublishingService({ productRepository: { listPublishedProductsForAgent: async () => [{ id: "p1" }], getProduct: async () => ({ id: "p1", productVersionId: "other-version", dependencies: [{ agentKey: "other-agent" }] }), createEntitlement: async () => assert.fail("must not authorize another Agent") } });
  await assert.rejects(service.setAgentAccessThroughProduct({ userId: "u1", agentKey: agent.key, productVersionId: "other-version", enabled: true, grantedScopes: agent.permissions }), error => error.details?.code === "PRODUCT_AGENT_VERSION_MISMATCH");
});

test("publication rechecks current runtime readiness instead of trusting a stale stored snapshot", async () => {
  const service = createAgentPublishingService({ listRegisteredAgents: async () => [agent], getReadiness: async () => ({ [agent.key]: { configured: false, missingEnv: ["REQUIRED_PROVIDER"] } }), releaseRepository: { getAgentRelease: async () => ({ id: "r1", agentKey: agent.key, version: agent.version, identity, contractHash: computeAgentReleaseContractHash({ key: agent.key, version: agent.version, permissions: agent.permissions, identity }), declaredScopes: agent.permissions, readiness: { ready: true } }), transition: async () => assert.fail("stale readiness cannot authorize publication") } });
  await assert.rejects(service.publishRelease({ releaseId: "r1" }), error => error.details?.code === "AGENT_NOT_READY");
});

test("review cannot approve an identity changed after the review request read it", async () => {
  const repository = createAgentReleaseRepository();
  const row = { id: "r1", agent_key: agent.key, catalog_status: "draft", contract_hash: "a".repeat(64) };
  const connection = { query: async sql => { if (sql.startsWith("SELECT * FROM agent_releases")) return [row]; assert.fail("stale review must not mutate state"); } };
  await assert.rejects(repository.transition({ releaseId: row.id, toStatus: "review", expectedContractHash: "b".repeat(64), connection }), error => error.details?.code === "RELEASE_CONTRACT_CHANGED");
});
