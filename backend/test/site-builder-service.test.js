import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildSiteDraftResponse,
  normalizeSiteDraft,
} from "../src/site-builder-service.js";

const modelStatus = {
  configured: true,
  missing: [],
  provider: "test-provider",
  model: "test-model",
};

test("site builder persists only a valid model result", async () => {
  const response = await buildSiteDraftResponse({
    prompt: "突出我的相册",
    profile: { nickname: "Tester", stationConfig: { language: "zh" } },
    modelStatus,
    runAgent: async () => ({
      reply: JSON.stringify({
        version: 1,
        title: "Tester 的小站",
        theme: "gallery",
        summary: "相册主页",
        sections: [
          {
            type: "gallery",
            title: "照片",
            subtitle: "作品",
            assetIds: ["asset-1"],
          },
        ],
      }),
      provider: "test-provider",
      tokenUsage: { total: 10 },
      latencyMs: 20,
    }),
  });

  assert.equal(response.source, "model");
  assert.equal(response.draft.sections.length, 1);
  assert.equal(response.draft.sections[0].type, "gallery");
});

test("site builder fails closed when the model is unavailable", async () => {
  let called = false;
  await assert.rejects(
    () => buildSiteDraftResponse({
      prompt: "生成主页",
      modelStatus: { configured: false, missing: ["NEW_API_KEY"] },
      runAgent: async () => {
        called = true;
      },
    }),
    (error) =>
      error?.status === 503 &&
      error?.details?.code === "SITE_BUILDER_UNAVAILABLE",
  );
  assert.equal(called, false);
});

test("site builder never replaces malformed model output with a template", async () => {
  await assert.rejects(
    () => buildSiteDraftResponse({
      prompt: "生成主页",
      modelStatus,
      runAgent: async () => ({ reply: "not json" }),
    }),
    (error) =>
      error?.status === 502 && error?.details?.code === "SITE_BUILDER_FAILED",
  );
  assert.throws(
    () => normalizeSiteDraft({ title: "No sections", sections: [] }),
    (error) =>
      error?.status === 502 &&
      error?.details?.code === "SITE_BUILDER_INVALID_RESPONSE",
  );
});

test("site draft migration removes historical rule-generated drafts", async () => {
  const migration = await readFile(
    new URL("../database/023_require_model_site_drafts.sql", import.meta.url),
    "utf8",
  );

  assert.match(migration, /DELETE FROM station_site_drafts[\s\S]*source <> 'model'/);
  assert.match(migration, /CHECK \(source = 'model'\)/);
  assert.match(migration, /station_config[\s\S]*siteLayout[\s\S]*siteDraftId/);
});
