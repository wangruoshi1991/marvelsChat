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

test("avatar job requires one face photo and explicit face-first consent", () => {
  const parsed = schemas.avatar3dCreateJobSchema.parse({
    generationMode: "face_first_multiview",
    photoId: photoIds[0],
    bodyShape: "athletic",
    pose: "natural",
    outfit: "sport",
    userDescription: "蓝白色运动套装",
    qualityPreset: "ultra",
    acceptedPhotoRights: true,
    acceptedAdultSubject: true,
    acceptedFaceCompletion: true,
    acceptedReferenceCostVersion: "2026-07-21",
  });

  assert.equal(parsed.photoId, photoIds[0]);
  assert.equal(parsed.generationMode, "face_first_multiview");
  assert.equal(parsed.qualityPreset, "ultra");

  const base = {
    generationMode: "face_first_multiview",
    photoId: photoIds[0],
    bodyShape: "balanced",
    pose: "natural",
    outfit: "smart_casual",
    qualityPreset: "standard",
    acceptedPhotoRights: true,
    acceptedAdultSubject: true,
    acceptedFaceCompletion: true,
    acceptedReferenceCostVersion: "2026-07-21",
  };
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    generationMode: "legacy_photo_3d",
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    bodyShape: "strong",
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    pose: "dynamic",
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    acceptedPhotoRights: false,
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    acceptedAdultSubject: false,
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    acceptedFaceCompletion: false,
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    acceptedReferenceCostVersion: "2026-07-20",
  }));
  assert.throws(() => schemas.avatar3dCreateJobSchema.parse({
    ...base,
    userDescription: "衣".repeat(241),
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

test("reference confirmation binds the exact set, quality, and current model cost", () => {
  assert.deepEqual(schemas.avatar3dReferenceConfirmSchema.parse({
    referenceSetId: photoIds[0],
    qualityPreset: "ultra",
    accepted: true,
    acceptedCostVersion: "2026-07-21",
  }), {
    referenceSetId: photoIds[0],
    qualityPreset: "ultra",
    accepted: true,
    acceptedCostVersion: "2026-07-21",
  });
  assert.throws(() => schemas.avatar3dReferenceConfirmSchema.parse({
    referenceSetId: photoIds[0],
    qualityPreset: "ultra",
    accepted: false,
    acceptedCostVersion: "2026-07-21",
  }));
  assert.deepEqual(schemas.avatar3dReferenceImageParamsSchema.parse({
    jobId: photoIds[0],
    view: "back",
  }), { jobId: photoIds[0], view: "back" });
  assert.throws(() => schemas.avatar3dReferenceImageParamsSchema.parse({
    jobId: photoIds[0],
    view: "three-quarter",
  }));
});
