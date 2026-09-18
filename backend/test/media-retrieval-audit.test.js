import assert from "node:assert/strict";
import test from "node:test";

import { safeEventPayload } from "../src/media-retrieval-repository-shared.js";

const PRODUCT_AUDIT_EVENT_TYPES = Object.freeze([
  "accepted",
  "profile-enabled",
  "queued",
  "searching",
  "completed",
  "blocked",
  "index-not-queued",
  "aggregate-completed",
  "recovery-queued",
  "temporary-cleanup-queue-failed",
]);

test("product audit event vocabulary is stable and payloads retain only allowlisted aggregates", () => {
  assert.equal(PRODUCT_AUDIT_EVENT_TYPES.length, 10);
  assert.deepEqual(
    safeEventPayload({
      indexedAssets: 2,
      skippedAssets: 1,
      reasonCode: "retrieval_not_enabled",
      jobType: "index",
      query: "private identity text",
      identityTerms: ["private identity text"],
      authorization: "secret",
      signedUrl: "https://private.invalid/object",
      providerBody: { secret: true },
    }),
    {
      indexedAssets: 2,
      skippedAssets: 1,
      reasonCode: "retrieval_not_enabled",
      jobType: "index",
    },
  );
});

test("completed search events retain only the strict public response contract", () => {
  const searchResponse = {
    agentRunId: "33333333-3333-4333-8333-333333333333",
    lifecycleStatus: "succeeded",
    method: "b7-product-baseline",
    results: [],
  };
  assert.deepEqual(safeEventPayload({ searchResponse }), { searchResponse });
  assert.throws(
    () => safeEventPayload({ searchResponse: { ...searchResponse, provider: "private" } }),
    /search response contract/i,
  );
});
