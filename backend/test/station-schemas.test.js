import assert from "node:assert/strict";
import test from "node:test";
import {
  stationAlbumParamsSchema,
  stationAlbumUpdateSchema,
  stationDiaryParamsSchema,
  stationDiaryUpdateSchema,
  stationMediaAssetRouteParamsSchema,
  stationMediaAssetUpdateSchema,
} from "../src/schemas.js";

const uuid = "11111111-1111-4111-8111-111111111111";

test("station update schemas require at least one valid field", () => {
  assert.deepEqual(stationDiaryUpdateSchema.parse({ mood: "calm" }), {
    mood: "calm",
  });
  assert.deepEqual(stationAlbumUpdateSchema.parse({ description: "Summer" }), {
    description: "Summer",
  });
  assert.deepEqual(stationMediaAssetUpdateSchema.parse({ albumId: null }), {
    albumId: null,
  });

  assert.throws(() => stationDiaryUpdateSchema.parse({}));
  assert.throws(() => stationAlbumUpdateSchema.parse({}));
  assert.throws(() => stationMediaAssetUpdateSchema.parse({}));
});

test("station route params reject malformed identifiers", () => {
  assert.equal(stationDiaryParamsSchema.parse({ entryId: uuid }).entryId, uuid);
  assert.equal(stationAlbumParamsSchema.parse({ albumId: uuid }).albumId, uuid);
  assert.equal(
    stationMediaAssetRouteParamsSchema.parse({ mediaAssetId: uuid })
      .mediaAssetId,
    uuid,
  );

  assert.throws(() => stationDiaryParamsSchema.parse({ entryId: "not-a-uuid" }));
  assert.throws(() => stationAlbumParamsSchema.parse({ albumId: "not-a-uuid" }));
  assert.throws(() =>
    stationMediaAssetRouteParamsSchema.parse({ mediaAssetId: "not-a-uuid" }),
  );
});
