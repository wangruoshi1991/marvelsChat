import assert from "node:assert/strict";
import test from "node:test";
import * as mappers from "../src/repository-mappers.js";

test("station draft mapper exposes revision and explicit media IDs", () => {
  const mapped = mappers.mapStationSiteDraft({
    id: "draft-1",
    user_id: "user-1",
    prompt: "hello",
    draft: { version: 2, title: "Page" },
    selected_media_asset_ids: ["asset-1", "asset-2", "asset-3"],
    revision: 4,
    source: "model",
    status: "draft",
    model_provider: "configured-model",
    model_missing: [],
    model_error: "",
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:01:00.000Z",
  });

  assert.equal(mapped.revision, 4);
  assert.deepEqual(mapped.selectedMediaAssetIds, ["asset-1", "asset-2", "asset-3"]);
});

test("homepage job mapper keeps provider details out of the public contract", () => {
  const mapped = mappers.mapHomepageJob({
    id: "job-1",
    user_id: "user-1",
    idempotency_key: "attempt-1",
    prompt: "private prompt",
    selected_media_asset_ids: ["asset-1", "asset-2", "asset-3"],
    status: "succeeded",
    progress: 100,
    site_draft_id: "draft-1",
    source: "model",
    error_message: null,
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:01:00.000Z",
    finished_at: "2026-07-15T00:01:00.000Z",
  });

  assert.equal(mapped.id, "job-1");
  assert.equal(mapped.status, "completed");
  assert.equal(mapped.siteDraftId, "draft-1");
  assert.equal(mapped.source, "model");
  assert.equal("provider" in mapped, false);
  assert.equal("prompt" in mapped, false);
  assert.equal("idempotencyKey" in mapped, false);
});

test("homepage job mapper exposes fallback completion as completed", () => {
  const mapped = mappers.mapHomepageJob({
    id: "job-2",
    user_id: "user-1",
    selected_media_asset_ids: ["asset-1", "asset-2", "asset-3"],
    status: "fallback",
    progress: 100,
    site_draft_id: "draft-2",
    source: "fallback",
  });

  assert.equal(mapped.status, "completed");
  assert.equal(mapped.source, "fallback");
});
