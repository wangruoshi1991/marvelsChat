import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentReadiness } from "../src/agent-readiness-service.js";

test("model-backed Agents are unavailable until every model setting exists", () => {
  const readiness = buildAgentReadiness({
    modelStatus: {
      provider: "not-configured",
      configured: false,
      missing: ["NEW_API_KEY"],
    },
    ossStatus: { provider: "oss", configured: true, missing: [] },
  });

  for (const agentId of [
    "miaoxun-butler",
    "virtual-character",
    "site-builder",
    "model-3d",
    "album-manager",
    "file-preprocessor",
    "comic-diary",
  ]) {
    assert.equal(readiness[agentId].configured, false);
    assert.deepEqual(readiness[agentId].missingEnv, ["NEW_API_KEY"]);
    assert.equal(readiness[agentId].providers.model.configured, false);
  }
});

test("model-backed Agents become ready only with a configured provider", () => {
  const readiness = buildAgentReadiness({
    modelStatus: {
      provider: "test-provider",
      configured: true,
      missing: [],
    },
    ossStatus: { provider: "oss", configured: true, missing: [] },
  });

  for (const agentId of [
    "miaoxun-butler",
    "virtual-character",
    "site-builder",
    "model-3d",
    "album-manager",
    "file-preprocessor",
    "comic-diary",
  ]) {
    assert.equal(readiness[agentId].configured, true);
    assert.deepEqual(readiness[agentId].missingEnv, []);
  }
  assert.equal(readiness["video-production"].configured, false);
});
