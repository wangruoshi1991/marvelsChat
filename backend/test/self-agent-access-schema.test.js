import assert from "node:assert/strict";
import test from "node:test";
import { selfAgentAccessSchema } from "../src/schemas.js";

test("self agent access defaults to an enabled compatibility request", () => {
  assert.deepEqual(selfAgentAccessSchema.parse({}), {
    enabled: true,
    alias: "",
    grantedScopes: [],
  });
});

test("self agent access accepts explicit disable requests", () => {
  assert.deepEqual(selfAgentAccessSchema.parse({ enabled: false }), {
    enabled: false,
    alias: "",
    grantedScopes: [],
  });
});

