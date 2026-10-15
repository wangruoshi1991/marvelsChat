import assert from "node:assert/strict";
import test from "node:test";
import { createAlbumAssistantAccessService } from "../src/album-assistant-access-service.js";

const albumAgent = { key: "album-manager", permissions: ["album:read"] };

test("incomplete Album permissions are rejected before consent/index transaction", async () => {
  const setAccess = createAlbumAssistantAccessService({
    withTransaction: async () => assert.fail("must not update consent/index"),
    getRuntimeStatus: async () => assert.fail("must not access a provider"),
  });
  await assert.rejects(setAccess({ userId: "owner", agent: { ...albumAgent, permissions: ["album:read", "messages:read"] },
    body: { enabled: true, grantedScopes: ["album:read"], albumAIConsentVersion: "media-retrieval-consent-v1" },
    idempotencyKey: "enable-album-test" }), { details: { code: "AGENT_FULL_ACCESS_REQUIRED" } });
});

test("Album access requires the caller's idempotency key before opening a transaction", async () => {
  let transactions = 0;
  const setAccess = createAlbumAssistantAccessService({
    withTransaction: async () => {
      transactions += 1;
    },
    getRuntimeStatus: async () => ({}),
  });
  for (const body of [
    {
      enabled: true,
      grantedScopes: ["album:read"],
      albumAIConsentVersion: "media-retrieval-consent-v1",
    },
    { enabled: false, grantedScopes: [] },
  ]) {
    await assert.rejects(
      setAccess({ userId: "owner", agent: albumAgent, body }),
      /Invalid Idempotency-Key header/
    );
  }
  assert.equal(transactions, 0);
});

test("Album removal forwards the caller key and explicitly clears granted scopes", async () => {
  const calls = [];
  const setAccess = createAlbumAssistantAccessService({
    withTransaction: async (work) =>
      work({
        query: async (sql) => {
          if (sql.startsWith("SELECT id FROM users")) return [{ id: "owner" }];
          if (sql.includes("media_retrieval_profiles")) return [];
          if (sql.includes("FROM user_agents"))
            return [
              {
                user_id: "owner",
                agent_id: "album-manager",
                enabled: false,
                granted_scopes: [],
              },
            ];
          return [];
        },
        execute: async () => [[]],
      }),
    getRuntimeStatus: async () => ({}),
    setAccess: async (args) => {
      calls.push(args);
      return [
        {
          id: albumAgent.key,
          enabled: false,
          grantedScopes: args.grantedScopes,
        },
      ];
    },
  });
  await setAccess({
    userId: "owner",
    agent: albumAgent,
    body: { enabled: false, grantedScopes: [] },
    idempotencyKey: "revoke-album-0001",
  });
  assert.equal(calls[0].grantedScopes.length, 0);
  assert.equal(calls[0].enabled, false);
});
