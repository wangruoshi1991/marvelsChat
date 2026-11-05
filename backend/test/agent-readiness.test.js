import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentReadiness } from "../src/agent-readiness-service.js";

const mediaRetrievalStatus = {
  readiness: { state: "not-ready" },
  routeEligibility: { reasonCodes: ["not-ready"] },
};

test("model-backed Agents are unavailable until every model setting exists", async () => {
  const readiness = await buildAgentReadiness({
    modelStatus: {
      provider: "not-configured",
      configured: false,
      missing: ["NEW_API_KEY"],
    },
    ossStatus: { provider: "oss", configured: true, missing: [] },
    mediaRetrievalStatus,
  });

  for (const agentId of [
    "miaoxun-butler",
    "virtual-character",
    "site-builder",
    "model-3d",
    "album-manager",
    "file-preprocessor",
    "comic-diary",
    "video-production",
    "ui-agent",
  ]) {
    assert.equal(readiness[agentId].configured, false);
    assert.deepEqual(readiness[agentId].missingEnv, ["NEW_API_KEY"]);
    assert.equal(readiness[agentId].providers.model.configured, false);
  }
});

test("model-backed Agents become ready only with a configured provider", async () => {
  const readiness = await buildAgentReadiness({
    modelStatus: {
      provider: "test-provider",
      configured: true,
      missing: [],
    },
    ossStatus: { provider: "oss", configured: true, missing: [] },
    mediaRetrievalStatus,
  });

  for (const agentId of [
    "miaoxun-butler",
    "virtual-character",
    "site-builder",
    "model-3d",
    "album-manager",
    "file-preprocessor",
    "comic-diary",
    "video-production",
    "ui-agent",
  ]) {
    assert.equal(readiness[agentId].configured, true);
    assert.deepEqual(readiness[agentId].missingEnv, []);
  }
  assert.deepEqual(readiness["video-production"].capabilityNeeds, ["video_generation_provider", "render_queue"]);
  assert.deepEqual(readiness["ui-agent"].capabilityNeeds, ["ui_preference_preview"]);
  assert.deepEqual(Object.keys(readiness["ui-agent"].providers), ["model"]);
});

test("video script readiness depends on text configuration without claiming rendering or requiring media storage", async () => {
  const readiness = await buildAgentReadiness({
    modelStatus: { provider: "test-provider", configured: true, missing: [] },
    ossStatus: { provider: "oss", configured: false, missing: ["OSS_BUCKET"] },
    mediaRetrievalStatus,
  });
  const video = readiness["video-production"];
  assert.equal(video.configured, true);
  assert.deepEqual(video.requiredEnv, ["NEW_API_BASE_URL", "NEW_API_KEY", "NEW_API_MODEL"]);
  assert.deepEqual(video.missingEnv, []);
  assert.deepEqual(Object.keys(video.providers), ["model"]);
  assert.deepEqual(video.capabilityNeeds, ["video_generation_provider", "render_queue"]);
});
