import assert from "node:assert/strict";
import test from "node:test";

const {
  mediaRetrievalAdminControlsSchema,
  mediaRetrievalEnableSchema,
  mediaRetrievalEventsQuerySchema,
  mediaRetrievalIdempotencyKeySchema,
  mediaRetrievalReindexSchema,
  mediaRetrievalSearchSchema,
} = await import("../src/schemas.js");

test("media retrieval request schemas enforce consent, idempotency, query, and bounded reindex inputs", () => {
  assert.equal(mediaRetrievalEnableSchema.parse({ consentVersion: "media-retrieval-consent-v1" }).consentVersion, "media-retrieval-consent-v1");
  assert.throws(() => mediaRetrievalEnableSchema.parse({ consentVersion: "older-consent" }));
  assert.equal(mediaRetrievalIdempotencyKeySchema.parse("valid-key-0001"), "valid-key-0001");
  assert.throws(() => mediaRetrievalIdempotencyKeySchema.parse("short"));
  assert.equal(mediaRetrievalSearchSchema.parse({ query: "黄色连衣裙", kind: "image", limit: 20 }).limit, 20);
  assert.throws(() => mediaRetrievalSearchSchema.parse({ query: "x".repeat(241) }));
  assert.throws(() => mediaRetrievalSearchSchema.parse({ query: "x", kind: "audio" }));
  assert.equal(mediaRetrievalReindexSchema.parse({ scope: "stale", mediaAssetIds: [] }).scope, "stale");
  assert.throws(() => mediaRetrievalReindexSchema.parse({ mediaAssetIds: Array.from({ length: 101 }, () => "11111111-1111-4111-8111-111111111111") }));
  assert.equal(mediaRetrievalEventsQuerySchema.parse({ afterSequence: "4" }).afterSequence, 4);
});

test("media retrieval administrator controls accept explicit per-user limits and operation reservations", () => {
  assert.deepEqual(
    mediaRetrievalAdminControlsSchema.parse({
      userDailyRequestLimit: 9,
      userMonthlyBudgetFen: 9000,
      captionReserveFen: 40,
      embeddingReserveFen: 20,
    }),
    {
      userDailyRequestLimit: 9,
      userMonthlyBudgetFen: 9000,
      captionReserveFen: 40,
      embeddingReserveFen: 20,
    },
  );
});
