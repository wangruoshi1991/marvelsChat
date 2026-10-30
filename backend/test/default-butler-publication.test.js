import assert from "node:assert/strict";
import test from "node:test";

import { ensureInitialDefaultButlerPublication } from "../src/default-butler-publication.js";
import { getAgent } from "../../agents/registry.js";
import { computeAgentReleaseContractHash } from "../../shared/agent-catalog.js";

const agent = await getAgent("miaoxun-butler");
const readiness = { ready: true, missing: [] };

function fakeConnection({ releases = [], catalog = [], products = [] } = {}) {
  const calls = [];
  return {
    calls,
    connection: {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        if (sql.startsWith("SELECT id, agent_key, version, contract_hash")) return releases;
        if (sql.startsWith("SELECT display_name, description")) return catalog;
        if (sql.startsWith("SELECT p.id, p.product_key")) return products;
        return [];
      },
    },
  };
}

test("initial Butler bootstrap publishes one release and product from the code contract", async () => {
  const { calls, connection } = fakeConnection({
    catalog: [{
      display_name: null,
      description: null,
      identity_mark: null,
      identity_shape: null,
      identity_colors: {},
      status: "unpublished",
      release_version: null,
      contract_hash: null,
    }],
  });
  const result = await ensureInitialDefaultButlerPublication(connection, {
    readiness,
    now: "2026-10-29T00:00:00.000Z",
  });

  assert.match(result.releaseId, /^[0-9a-f-]{36}$/);
  assert.match(result.productId, /^[0-9a-f-]{36}$/);
  assert.equal(result.created, true);
  assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO agent_registry")));
  assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO agent_releases")));
  assert.ok(calls.some(({ sql }) => sql.includes("SET catalog_status = 'review'")));
  assert.ok(calls.some(({ sql }) => sql.includes("SET catalog_status = 'published'")));
  assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO products")));
  assert.ok(calls.some(({ sql }) => sql.includes("INSERT INTO product_agent_dependencies")));
  assert.ok(calls.some(({ sql }) => sql.includes("SET status = 'review'")));
  assert.ok(calls.some(({ sql }) => sql.includes("SET status = 'published'")));
});

test("initial Butler bootstrap fails when model readiness is unavailable", async () => {
  const { calls, connection } = fakeConnection();
  await assert.rejects(
    () => ensureInitialDefaultButlerPublication(connection, { readiness: { ready: false, missing: ["NEW_API_KEY"] } }),
    (error) => error.details?.code === "DEFAULT_BUTLER_NOT_READY",
  );
  assert.equal(calls.length, 0);
});

test("a later Butler version must use the normal release review flow", async () => {
  const identity = {
    key: agent.key,
    avatarKind: agent.identity.avatarKind,
    displayName: agent.name,
    description: agent.description,
    mark: agent.identity.mark,
    shape: agent.identity.shape,
    colors: agent.identity.colors,
    published: true,
    source: "registry",
    updatedAt: "2026-10-29T00:00:00.000Z",
  };
  const currentHash = computeAgentReleaseContractHash({
    key: agent.key,
    version: agent.version,
    permissions: agent.permissions,
    identity,
  });
  const { calls, connection } = fakeConnection({
    releases: [{ id: "release-old", agent_key: agent.key, version: "0.3.1", contract_hash: "a".repeat(64), catalog_status: "published" }],
  });
  await assert.rejects(
    () => ensureInitialDefaultButlerPublication(connection, { readiness }),
    (error) => error.details?.code === "DEFAULT_BUTLER_RELEASE_REVIEW_REQUIRED",
  );
  assert.equal(calls.filter(({ sql }) => sql.includes("INSERT INTO agent_releases")).length, 0);
  assert.notEqual(currentHash, "a".repeat(64));
});

test("a published Butler release never repairs a stale catalog projection", async () => {
  const identity = {
    key: agent.key,
    avatarKind: agent.identity.avatarKind,
    displayName: agent.name,
    description: agent.description,
    mark: agent.identity.mark,
    shape: agent.identity.shape,
    colors: agent.identity.colors,
    published: true,
    source: "registry",
    updatedAt: "2026-10-29T00:00:00.000Z",
  };
  const hash = computeAgentReleaseContractHash({
    key: agent.key,
    version: agent.version,
    permissions: agent.permissions,
    identity,
  });
  const { calls, connection } = fakeConnection({
    releases: [{ id: "release-current", agent_key: agent.key, version: agent.version, contract_hash: hash, catalog_status: "published" }],
    catalog: [{
      display_name: "旧目录名称",
      description: agent.description,
      identity_mark: agent.identity.mark,
      identity_shape: agent.identity.shape,
      identity_colors: agent.identity.colors,
      status: "published",
      release_version: agent.version,
      contract_hash: hash,
    }],
  });
  await assert.rejects(
    () => ensureInitialDefaultButlerPublication(connection, { readiness }),
    (error) => error.details?.code === "DEFAULT_BUTLER_CATALOG_CONTRACT_INCOMPLETE",
  );
  assert.equal(calls.filter(({ sql }) => sql.startsWith("UPDATE agent_catalog")).length, 0);
});
