import assert from "node:assert/strict";
import test from "node:test";

import { buildAgentReadiness } from "../src/agent-readiness-service.js";

const mediaRetrievalStatus = {
  readiness: { state: "not-ready" },
  routeEligibility: { reasonCodes: ["not-ready"] },
};
const mediaImageStatus = { provider: "fixture-image", configured: true, contractVerified: true, missing: [] };
const aiTaskWorkerStatus = { state: "ready", capabilities: ["comic_render"] };

test("model-backed Agents are unavailable until every model setting exists", async () => {
  const readiness = await buildAgentReadiness({
    modelStatus: {
      provider: "not-configured",
      configured: false,
      missing: ["NEW_API_KEY"],
    },
    ossStatus: { provider: "oss", configured: true, missing: [] },
    mediaRetrievalStatus,
    mediaImageStatus,
    aiTaskWorkerStatus,
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
    mediaImageStatus,
    aiTaskWorkerStatus,
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
    mediaImageStatus,
    aiTaskWorkerStatus,
  });
  const video = readiness["video-production"];
  assert.equal(video.configured, true);
  assert.deepEqual(video.requiredEnv, ["NEW_API_BASE_URL", "NEW_API_KEY", "NEW_API_MODEL"]);
  assert.deepEqual(video.missingEnv, []);
  assert.deepEqual(Object.keys(video.providers), ["model"]);
  assert.deepEqual(video.capabilityNeeds, ["video_generation_provider", "render_queue"]);
});

test("comic rendering needs separate verified image configuration, storage, model and a recent capable worker", async () => {
  const base = {
    modelStatus: { provider: "text", configured: true, missing: [] },
    ossStatus: { provider: "oss", configured: true, missing: [] },
    mediaImageStatus,
    aiTaskWorkerStatus,
    mediaRetrievalStatus,
  };
  for (const change of [
    { modelStatus: { configured: false, missing: ["NEW_API_KEY"] } },
    { ossStatus: { configured: false, missing: ["OSS_BUCKET"] } },
    { mediaImageStatus: { ...mediaImageStatus, configured: false, missing: ["MEDIA_GENERATION_API_KEY"] } },
    { mediaImageStatus: { ...mediaImageStatus, contractVerified: false } },
    { aiTaskWorkerStatus: { state: "unavailable", capabilities: [] } },
    { aiTaskWorkerStatus: { state: "ready", capabilities: ["agent_message"] } },
  ]) {
    const status = await buildAgentReadiness({ ...base, ...change });
    assert.equal(status["comic-diary"].configured, false, JSON.stringify(change));
  }
  const status = await buildAgentReadiness(base);
  assert.equal(status["comic-diary"].configured, true);
  assert.equal(status["comic-diary"].providers.image.contractVerified, true);
  assert.equal(status["comic-diary"].providers.worker.configured, true);
  assert.equal(status["comic-diary"].providers.oss.configured, true);
  assert.ok(status["comic-diary"].requiredEnv.includes("MEDIA_GENERATION_IMAGE_MODEL"));
  assert.equal(status["video-production"].providers.image, undefined);
});

test("configured text alone never makes the default comic image provider ready", async () => {
  const status = await buildAgentReadiness({
    modelStatus: { provider: "text", configured: true, missing: [] },
    ossStatus: { provider: "oss", configured: true, missing: [] },
    aiTaskWorkerStatus,
    mediaRetrievalStatus,
  });
  assert.equal(status["comic-diary"].configured, false);
  assert.equal(status["comic-diary"].providers.image.contractVerified, false);
  assert.equal(status["video-production"].configured, true);
});
