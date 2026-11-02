import assert from "node:assert/strict";
import test from "node:test";
import { assertCurrentAgentAccess } from "../src/ai-agent-access.js";

const agent = { key: "demo-agent", version: "2.0.0", permissions: ["messages:read"] };

test("an enabled user_agents projection cannot execute without exact product consent", async () => {
  await assert.rejects(assertCurrentAgentAccess({ userId: "u1", agent, grantedScopes: agent.permissions, contextRefs: [], queryFn: async sql => sql.includes("user_agents") ? [{ enabled: true, granted_scopes: agent.permissions }] : [] }), error => error.details?.code === "AGENT_PRODUCT_ENTITLEMENT_REQUIRED");
});
