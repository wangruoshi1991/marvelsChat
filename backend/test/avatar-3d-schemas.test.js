import assert from "node:assert/strict";
import test from "node:test";
import * as schemas from "../src/schemas.js";

const photoIds = [
  "11111111-1111-4111-8111-111111111111",
  "22222222-2222-4222-8222-222222222222",
  "33333333-3333-4333-8333-333333333333",
  "44444444-4444-4444-8444-444444444444",
];

test("avatar photo upload accepts only JPEG or PNG up to 10 MB", () => {
  assert.deepEqual(schemas.avatar3dPhotoUploadSchema.parse({
    originalFilename: "front.jpg",
    mimeType: "image/jpeg",
    byteSize: 10 * 1024 * 1024,
  }), {
    originalFilename: "front.jpg",
    mimeType: "image/jpeg",
    byteSize: 10 * 1024 * 1024,
  });
  assert.throws(() => schemas.avatar3dPhotoUploadSchema.parse({
    originalFilename: "front.webp",
    mimeType: "image/webp",
    byteSize: 100,
  }));
  assert.throws(() => schemas.avatar3dPhotoUploadSchema.parse({
    originalFilename: "front.png",
    mimeType: "image/png",
    byteSize: 10 * 1024 * 1024 + 1,
  }));
});

test("avatar job requires one front view, unique views, rights, and current cost version", () => {
  const parsed = schemas.avatar3dCreateJobSchema.parse({
    style: "realistic",
    photos: [
      { photoId: photoIds[0], view: "front" },
      { photoId: photoIds[1], view: "left" },
      { photoId: photoIds[2], view: "back" },
      { photoId: photoIds[3], view: "right" },
    ],
    acceptedPhotoRights: true,
    acceptedCostVersion: "2026-07-17",
  });

  assert.equal(parsed.photos.length, 4);
  assert.equal(parsed.style, "realistic");

  const base = {
    style: "cartoon",
    acceptedPhotoRights: true,
    acceptedCostVersion: "2026-07-17",
  };
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    photos: [{ photoId: photoIds[0], view: "left" }],
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    photos: [
      { photoId: photoIds[0], view: "front" },
      { photoId: photoIds[1], view: "front" },
    ],
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    photos: [
      { photoId: photoIds[0], view: "front" },
      { photoId: photoIds[0], view: "left" },
    ],
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    acceptedPhotoRights: false,
    photos: [{ photoId: photoIds[0], view: "front" }],
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    acceptedCostVersion: "2026-07-16",
    photos: [{ photoId: photoIds[0], view: "front" }],
  }));
});

test("avatar route and idempotency schemas require UUIDs", () => {
  assert.deepEqual(
    schemas.avatar3dJobParamsSchema.parse({ jobId: photoIds[0] }),
    { jobId: photoIds[0] },
  );
  assert.deepEqual(
    schemas.avatar3dIdempotencySchema.parse({ idempotencyKey: photoIds[1] }),
    { idempotencyKey: photoIds[1] },
  );
  assert.throws(() => schemas.avatar3dModelParamsSchema.parse({ modelId: "not-a-uuid" }));
  assert.throws(() => schemas.avatar3dIdempotencySchema.parse({ idempotencyKey: "retry-me" }));
});

test("style confirmation is explicit and upload completion accepts no client storage key", () => {
  assert.deepEqual(schemas.avatar3dStyleConfirmSchema.parse({ accepted: true }), { accepted: true });
  assert.throws(() => schemas.avatar3dStyleConfirmSchema.parse({ accepted: false }));
  assert.deepEqual(schemas.avatar3dPhotoCompleteSchema.parse({}), {});
  assert.throws(() => schemas.avatar3dPhotoCompleteSchema.parse({ storageKey: "users/private" }));
});
