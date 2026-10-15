import assert from "node:assert/strict";
import test from "node:test";
import { getAgent } from "../../agents/registry.js";
import {
  createAgentModelConfig,
  RECOMMENDED_AGENT_MODEL_PROFILE,
  resolveAgentModelRole,
  resolveAgentModelRoute,
} from "../src/agent-model-config.js";

test("recommended profiles never supply an implicit provider, model or credential", () => {
  const empty = createAgentModelConfig({});
  assert.deepEqual(empty, {
    baseUrl: "",
    apiKey: "",
    model: "",
    planningModel: "",
    timeoutMs: 30000,
    workspaceTimeoutMs: 180000,
  });
  assert.deepEqual(resolveAgentModelRoute(empty, "planning"), {
    model: "",
    source: "NEW_API_MODEL",
  });
  assert.equal(Object.hasOwn(RECOMMENDED_AGENT_MODEL_PROFILE, "apiKey"), false);
  const explicit = createAgentModelConfig({
    NEW_API_BASE_URL: "https://configured.example/v1/",
    NEW_API_KEY: "one-test-key",
    NEW_API_MODEL: "chosen-chat",
    NEW_API_PLANNING_MODEL: " chosen-planner ",
    NEW_API_TIMEOUT_MS: "1234",
    NEW_API_WORKSPACE_TIMEOUT_MS: "2345",
  });
  assert.deepEqual(explicit, {
    baseUrl: "https://configured.example/v1",
    apiKey: "one-test-key",
    model: "chosen-chat",
    planningModel: "chosen-planner",
    timeoutMs: 1234,
    workspaceTimeoutMs: 2345,
  });
  assert.deepEqual(resolveAgentModelRoute(explicit, "chat"), {
    model: "chosen-chat",
    source: "NEW_API_MODEL",
  });
  assert.deepEqual(resolveAgentModelRoute(explicit, "planning"), {
    model: "chosen-planner",
    source: "NEW_API_PLANNING_MODEL",
  });
  assert.equal(
    JSON.stringify(resolveAgentModelRoute(explicit, "planning")).includes(
      "one-test-key",
    ),
    false,
  );
});

test("model timeouts reject invalid and overlong environment values", () => {
  for (const value of ["0", "-1", "not-a-number", "1200001"]) {
    assert.throws(() => createAgentModelConfig({ NEW_API_WORKSPACE_TIMEOUT_MS: value }), /NEW_API_WORKSPACE_TIMEOUT_MS/);
  }
  assert.equal(createAgentModelConfig({ NEW_API_WORKSPACE_TIMEOUT_MS: "" }).workspaceTimeoutMs, 180000);
});

test("model roles follow the requested execution mode without guessing from Agent methods", async () => {
  const agents = await Promise.all(["virtual-character", "album-manager", "miaoxun-butler", "site-builder"].map(getAgent));
  for (const agent of agents) {
    for (const mode of ["plan", "chat", "dispatch", "coordinate", "contribute"]) {
      // Method support is checked by the runtime; role selection never adds it.
      assert.equal(resolveAgentModelRole({ agent, mode }), mode === "chat" ? "chat" : "planning");
      assert.equal(resolveAgentModelRole({ agent, mode, tools: { definitions: [] } }), mode === "chat" ? "chat" : "planning");
    }
  }
  assert.throws(
    () => resolveAgentModelRole({ mode: "unknown" }),
    (error) => error.details.code === "AI_AGENT_MODE_UNSUPPORTED",
  );
});
