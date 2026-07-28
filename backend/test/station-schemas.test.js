import assert from "node:assert/strict";
import test from "node:test";
import {
  miaoPointLedgerQuerySchema,
  stationAlbumParamsSchema,
  stationAlbumUpdateSchema,
  stationDiaryParamsSchema,
  stationDiaryUpdateSchema,
  stationMediaAssetRouteParamsSchema,
  stationMediaAssetUpdateSchema,
  stationMediaUploadCompleteSchema,
  stationMediaUploadUrlSchema,
  stationPostParamsSchema,
  stationPostSchema,
} from "../src/schemas.js";

const uuid = "11111111-1111-4111-8111-111111111111";

test("miao point ledger query applies a bounded limit", () => {
  assert.deepEqual(miaoPointLedgerQuerySchema.parse({}), { limit: 80 });
  assert.deepEqual(miaoPointLedgerQuerySchema.parse({ limit: "20" }), {
    limit: 20,
  });
  assert.throws(() => miaoPointLedgerQuerySchema.parse({ limit: 101 }));
});

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
  assert.equal(stationPostParamsSchema.parse({ postId: uuid }).postId, uuid);
  assert.equal(stationDiaryParamsSchema.parse({ entryId: uuid }).entryId, uuid);
  assert.equal(stationAlbumParamsSchema.parse({ albumId: uuid }).albumId, uuid);
  assert.equal(
    stationMediaAssetRouteParamsSchema.parse({ mediaAssetId: uuid })
      .mediaAssetId,
    uuid,
  );

  assert.throws(() => stationDiaryParamsSchema.parse({ entryId: "not-a-uuid" }));
  assert.throws(() => stationPostParamsSchema.parse({ postId: "not-a-uuid" }));
  assert.throws(() => stationAlbumParamsSchema.parse({ albumId: "not-a-uuid" }));
  assert.throws(() =>
    stationMediaAssetRouteParamsSchema.parse({ mediaAssetId: "not-a-uuid" }),
  );
});

test("station post schema requires content and bounds attachments", () => {
  assert.deepEqual(stationPostSchema.parse({ body: "  hello  " }), {
    body: "hello",
    locationLabel: "",
    visibility: "public",
    agentCapabilities: [],
    mediaAssetIds: [],
  });
  assert.equal(
    stationPostSchema.parse({ mediaAssetIds: [uuid] }).mediaAssetIds[0],
    uuid,
  );
  assert.throws(() => stationPostSchema.parse({}));
  assert.throws(() =>
    stationPostSchema.parse({ mediaAssetIds: [uuid, uuid] }),
  );
  assert.throws(() =>
    stationPostSchema.parse({
      mediaAssetIds: Array.from({ length: 10 }, (_, index) =>
        `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      ),
    }),
  );
});

test("station media upload schemas enforce type and size limits", () => {
  const maxImageBytes = 25 * 1024 * 1024;
  const maxVideoBytes = 250 * 1024 * 1024;

  assert.equal(
    stationMediaUploadUrlSchema.parse({
      mimeType: "image/jpeg",
      byteSize: maxImageBytes,
    }).byteSize,
    maxImageBytes,
  );
  assert.equal(
    stationMediaUploadUrlSchema.parse({
      mimeType: "video/mp4",
      byteSize: maxVideoBytes,
    }).byteSize,
    maxVideoBytes,
  );

  assert.throws(() =>
    stationMediaUploadUrlSchema.parse({
      mimeType: "image/jpeg",
      byteSize: maxImageBytes + 1,
    }),
  );
  assert.throws(() =>
    stationMediaUploadUrlSchema.parse({
      mimeType: "video/mp4",
      byteSize: maxVideoBytes + 1,
    }),
  );
  assert.throws(() =>
    stationMediaUploadUrlSchema.parse({
      mimeType: "image/svg+xml",
      byteSize: 100,
    }),
  );
  assert.throws(() =>
    stationMediaUploadUrlSchema.parse({
      mimeType: "application/pdf",
      byteSize: 100,
    }),
  );
  assert.deepEqual(
    stationMediaUploadCompleteSchema.parse({ storageKey: "users/u/asset.jpg" }),
    { storageKey: "users/u/asset.jpg" },
  );
  assert.equal(
    stationMediaUploadUrlSchema.parse({
      mimeType: "image/jpg",
      byteSize: 100,
    }).mimeType,
    "image/jpeg",
  );
});
