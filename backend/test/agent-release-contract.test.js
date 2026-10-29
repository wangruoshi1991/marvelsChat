import assert from "node:assert/strict";
import test from "node:test";
import { loadMigrationFiles } from "../src/migration-files.js";
import {
  agentIdentitySchema,
  agentReleaseSchema,
  productDependencySchema,
  entitlementSchema,
  isValidAgentReleaseTransition,
  isValidProductVersionTransition,
  isValidEntitlementTransition,
} from "../src/schemas.js";
import {
  AGENT_IDENTITY_FIELDS,
  computeAgentContractHash,
  canonicalizeContract,
  isCompleteAgentIdentity,
} from "../../shared/agent-catalog.js";

const identity = {
  key: "demo-agent",
  displayName: "演示 Agent",
  description: "用于测试的 Agent",
  mark: "演",
  shape: "circle",
  colors: { background: "#123456", foreground: "#ffffff", accent: "#facc15" },
  published: false,
  source: "registry",
  updatedAt: "2026-10-29T00:00:00.000Z",
};

const release = {
  agentKey: "demo-agent",
  version: "1.2.3",
  contractHash: computeAgentContractHash({ key: "demo-agent", version: "1.2.3", permissions: ["messages:read"] }),
  declaredScopes: ["messages:read"],
  readiness: { ready: true, missing: [] },
  catalogStatus: "review",
  publishedAt: null,
};

test("AgentIdentity has the required shared fields and rejects malformed identity", () => {
  assert.deepEqual(AGENT_IDENTITY_FIELDS, ["key", "displayName", "description", "mark", "shape", "colors", "published", "source", "updatedAt"]);
  assert.equal(isCompleteAgentIdentity(identity), true);
  assert.deepEqual(agentIdentitySchema.parse(identity), identity);
  assert.throws(() => agentIdentitySchema.parse({ ...identity, colors: { background: "bad" } }));
  assert.throws(() => agentIdentitySchema.parse({ ...identity, displayName: "" }));
  assert.equal(isCompleteAgentIdentity({ ...identity, updatedAt: undefined }), false);
});

test("contract hashes are deterministic and include the declared contract", () => {
  const left = { key: "demo-agent", version: "1.2.3", permissions: ["messages:read"] };
  const right = { permissions: ["messages:read"], version: "1.2.3", key: "demo-agent" };
  assert.equal(canonicalizeContract(left), canonicalizeContract(right));
  assert.equal(computeAgentContractHash(left), computeAgentContractHash(right));
  assert.notEqual(computeAgentContractHash(left), computeAgentContractHash({ ...left, version: "1.2.4" }));
});

test("release schema rejects duplicate scopes and unknown status", () => {
  assert.deepEqual(agentReleaseSchema.parse(release).agentKey, "demo-agent");
  assert.throws(() => agentReleaseSchema.parse({ ...release, declaredScopes: ["messages:read", "messages:read"] }));
  assert.throws(() => agentReleaseSchema.parse({ ...release, catalogStatus: "unknown" }));
  assert.equal(isValidAgentReleaseTransition("draft", "review"), true);
  assert.equal(isValidAgentReleaseTransition("published", "draft"), false);
});

test("product dependency schema requires unique declared scopes", () => {
  assert.deepEqual(productDependencySchema.parse({ agentKey: "demo-agent", version: "1.2.3", scopes: ["messages:read"] }), {
    agentKey: "demo-agent", version: "1.2.3", scopes: ["messages:read"],
  });
  assert.throws(() => productDependencySchema.parse({ agentKey: "demo-agent", version: "1.2.3", scopes: ["messages:read", "messages:read"] }));
  assert.throws(() => productDependencySchema.parse({ agentKey: "demo-agent", version: "1.2.3", scopes: ["not-a-scope"] }));
  assert.equal(isValidProductVersionTransition("draft", "review"), true);
  assert.equal(isValidProductVersionTransition("retired", "published"), false);
});

test("entitlement schema and state machine expose explicit unavailable and reconsent states", () => {
  assert.equal(entitlementSchema.parse({ status: "enabled" }).status, "enabled");
  assert.throws(() => entitlementSchema.parse({ status: "pending" }));
  assert.equal(isValidEntitlementTransition("enabled", "reconsent_required"), true);
  assert.equal(isValidEntitlementTransition("disabled", "enabled"), true);
  assert.equal(isValidEntitlementTransition("unavailable", "enabled"), false);
});

test("migration discovery includes 046-048 in numeric order", async () => {
  const migrations = await loadMigrationFiles();
  const names = migrations.map(({ filename }) => filename);
  assert.deepEqual(names.slice(-3), ["046_agent_releases.sql", "047_product_catalog.sql", "048_agent_entitlements.sql"]);
  assert.match(migrations.at(-3).sql, /CREATE TABLE IF NOT EXISTS agent_registry/);
  assert.match(migrations.at(-2).sql, /CREATE TABLE IF NOT EXISTS products/);
  assert.match(migrations.at(-1).sql, /CREATE TABLE IF NOT EXISTS user_entitlements/);
});
