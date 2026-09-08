import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { resolveAgentGrantedScopes } = await import("../src/repositories.js");

const agent = {
  key: "example-agent",
  permissions: ["profile:read", "station:read"],
};

test("Agent access defaults to the registered permission declaration", () => {
  assert.deepEqual(resolveAgentGrantedScopes(agent), [
    "profile:read",
    "station:read",
  ]);
});

test("Agent access accepts a deduplicated subset of declared permissions", () => {
  assert.deepEqual(
    resolveAgentGrantedScopes(agent, ["profile:read", "profile:read"]),
    ["profile:read"],
  );
});

test("Agent access rejects scopes outside the registered declaration", () => {
  assert.throws(
    () => resolveAgentGrantedScopes(agent, ["station:write"]),
    (error) =>
      error?.status === 400 &&
      error?.message === "Unsupported Agent scopes: station:write",
  );
});
