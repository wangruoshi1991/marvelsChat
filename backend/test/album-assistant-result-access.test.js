import assert from "node:assert/strict";
import test from "node:test";
import { getAuthorizedMediaResults } from "../src/routes/message-routes.js";
import { getAgent } from "../../agents/registry.js";
import { computeProductContractHash, mapProduct } from "../src/product-catalog-repository.js";

const agent = await getAgent("album-manager");
const scopes = agent.permissions;
const identity = { ...agent.identity, key: agent.key, displayName: agent.name, description: agent.description || "", published: true, source: "admin", updatedAt: "2026-11-02T00:00:00.000Z" };
const productRow = { id: "product", product_key: "album-product", product_version_id: "product-version", version: "1.0.0", display_name: "Album product",
  description: "Explicit consent fixture", identity_snapshot: identity, supported_platforms: ["ios"], version_status: "published" };
const dependencyRow = { agent_key: agent.key, agent_release_id: "release", version: agent.version, required_scopes: scopes, declared_scopes: scopes,
  release_contract_hash: "release-hash", identity_snapshot: identity, readiness: { ready: true }, release_status: "published",
  registry_version: agent.version, registry_declared_scopes: scopes, registry_contract_hash: "release-hash", registry_status: "registered" };
productRow.contract_hash = computeProductContractHash(mapProduct(productRow, [dependencyRow]));

const owner = "result-owner";
const request = { userId: owner, threadId: "thread", messageId: "reply" };
function dependencies(overrides = {}) {
  return {
    getMessage: async ({ userId }) => userId === owner ? {
      senderType: "agent", metadata: { albumAssistant: { retrievalRunIds: ["search-run"] } },
    } : null,
    queryFn: async (sql, params) => {
      if (sql.includes("FROM user_agents")) {
        assert.deepEqual(params, [owner]);
        return [{ enabled: true, granted_scopes: scopes }];
      }
      if (sql.includes("FROM user_entitlements")) {
        assert.deepEqual(params, [owner, agent.key]);
        return [{ product_id: productRow.id, product_version_id: productRow.product_version_id, contract_hash: productRow.contract_hash, granted_scopes: scopes }];
      }
      if (sql.includes("FROM products p")) return [productRow];
      if (sql.includes("FROM product_agent_dependencies")) return [dependencyRow];
      assert.fail(`Unexpected result authorization query: ${sql}`);
    },
    retrievalRepository: {
      getMediaRetrievalProfile: async ({ userId }) => {
        assert.equal(userId, owner);
        return { indexState: "enabled", consentVersion: "media-retrieval-consent-v1" };
      },
      getMediaRetrievalSearchResponse: async ({ userId, agentRunId }) => {
        assert.equal(userId, owner);
        assert.equal(agentRunId, "search-run");
        return { results: [{ mediaAssetId: "image", kind: "image" }] };
      },
    },
    listAssets: async ({ userId, mediaAssetIds }) => {
      assert.equal(userId, owner);
      assert.deepEqual(mediaAssetIds, ["image"]);
      return [{ id: "image", kind: "image", status: "uploaded" }];
    },
    ...overrides,
  };
}

test("result references only resolve messages and assets for the authenticated owner", async () => {
  assert.deepEqual(await getAuthorizedMediaResults({ ...request, ...dependencies() }), [{ mediaAssetId: "image", kind: "image" }]);
  await assert.rejects(getAuthorizedMediaResults({ ...request, userId: "outsider", ...dependencies() }), error => error.status === 404);
});

test("recalled and non-Agent messages cannot expose result references", async () => {
  for (const message of [{ senderType: "agent", recalledAt: "2026-10-09" }, { senderType: "user" }]) {
    await assert.rejects(getAuthorizedMediaResults({ ...request, ...dependencies({ getMessage: async () => message }) }), error => error.status === 404);
  }
});

test("revoked cloud consent blocks reading existing Agent results", async () => {
  for (const profile of [null, { indexState: "disabled", consentVersion: "media-retrieval-consent-v1" }, { indexState: "enabled", consentVersion: "old" }]) {
    const deps = dependencies();
    deps.retrievalRepository.getMediaRetrievalProfile = async () => profile;
    deps.retrievalRepository.getMediaRetrievalSearchResponse = async () => assert.fail("revoked consent must block run access");
    await assert.rejects(getAuthorizedMediaResults({ ...request, ...deps }), error => error.status === 403);
  }
});

test("disabled Agent and revoked album scope block reading existing results", async () => {
  for (const access of [[], [{ enabled: false, granted_scopes: scopes }], [{ enabled: true, granted_scopes: [] }],
    [{ enabled: true, granted_scopes: scopes.filter(scope => scope !== "station:write") }]]) {
    await assert.rejects(getAuthorizedMediaResults({ ...request, ...dependencies({ queryFn: async () => access }) }), error => error.status === 403);
  }
});

test("an enabled album projection cannot read existing results without product entitlement", async () => {
  const deps = dependencies({ queryFn: async sql => sql.includes("FROM user_agents") ? [{ enabled: true, granted_scopes: scopes }] : [] });
  deps.retrievalRepository.getMediaRetrievalSearchResponse = async () => assert.fail("Missing entitlement must block historical result access");
  await assert.rejects(getAuthorizedMediaResults({ ...request, ...deps }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
});

test("expired epoch results and deleted or changed-kind assets are omitted", async () => {
  const deps = dependencies();
  deps.retrievalRepository.getMediaRetrievalSearchResponse = async () => null;
  deps.listAssets = async () => [];
  assert.deepEqual(await getAuthorizedMediaResults({ ...request, ...deps }), []);
  for (const assets of [[], [{ id: "image", kind: "image", status: "deleted" }], [{ id: "image", kind: "video", status: "uploaded" }]]) {
    assert.deepEqual(await getAuthorizedMediaResults({ ...request, ...dependencies({ listAssets: async () => assets }) }), []);
  }
});
