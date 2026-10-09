import assert from "node:assert/strict";
import test from "node:test";
import { getAuthorizedMediaResults } from "../src/routes/message-routes.js";

const owner = "result-owner";
const request = { userId: owner, threadId: "thread", messageId: "reply" };
function dependencies(overrides = {}) {
  return {
    getMessage: async ({ userId }) => userId === owner ? {
      senderType: "agent", metadata: { albumAssistant: { retrievalRunIds: ["search-run"] } },
    } : null,
    queryFn: async (_sql, params) => {
      assert.deepEqual(params, [owner]);
      return [{ enabled: true, granted_scopes: ["album:read"] }];
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
  for (const access of [[], [{ enabled: false, granted_scopes: ["album:read"] }], [{ enabled: true, granted_scopes: [] }]]) {
    await assert.rejects(getAuthorizedMediaResults({ ...request, ...dependencies({ queryFn: async () => access }) }), error => error.status === 403);
  }
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
