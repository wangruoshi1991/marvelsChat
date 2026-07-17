import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  buildAvatarPhotoObjectKey,
  createAvatar3dStorage,
  isValidSingleRange,
} = await import("../src/avatar-3d-storage.js");

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  photo: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  job: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

const responseWithBuffer = (buffer, { contentType = "application/octet-stream" } = {}) => ({
  ok: true,
  status: 200,
  headers: new Headers({
    "content-type": contentType,
    "content-length": String(buffer.length),
  }),
  arrayBuffer: async () => buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ),
  body: null,
});

test("photo object keys remain under the owning user avatar prefix", () => {
  const key = buildAvatarPhotoObjectKey({
    userId: ids.user,
    photoId: ids.photo,
    originalFilename: "../../ front portrait.PNG",
    mimeType: "image/png",
  });

  assert.match(key, new RegExp(`^users/${ids.user}/avatar-3d/photos/${ids.photo}/source\\.png$`));
  assert.doesNotMatch(key, /\.\./);
});

test("photo verification rejects mismatched MIME type and byte size", async () => {
  const storage = createAvatar3dStorage({
    inspectObject: async () => ({ contentType: "image/png", contentLength: 99 }),
    fetchObject: async () => responseWithBuffer(Buffer.from("not-used")),
    putObject: async () => ({ stored: true }),
  });

  await assert.rejects(
    () => storage.verifyAndNormalizeAvatarPhoto({
      sourceStorageKey: "users/u/avatar-3d/photos/p/source.jpg",
      normalizedStorageKey: "users/u/avatar-3d/photos/p/normalized.jpg",
      expectedMimeType: "image/jpeg",
      expectedByteSize: 100,
    }),
    (error) => error?.status === 409 && error?.details?.code === "PHOTO_UPLOAD_MISMATCH",
  );
});

test("photo verification rejects non-image magic bytes before decoding", async () => {
  const body = Buffer.from("this is not a jpeg");
  const storage = createAvatar3dStorage({
    inspectObject: async () => ({ contentType: "image/jpeg", contentLength: body.length }),
    fetchObject: async () => responseWithBuffer(body, { contentType: "image/jpeg" }),
    putObject: async () => ({ stored: true }),
  });

  await assert.rejects(
    () => storage.verifyAndNormalizeAvatarPhoto({
      sourceStorageKey: "users/u/avatar-3d/photos/p/source.jpg",
      normalizedStorageKey: "users/u/avatar-3d/photos/p/normalized.jpg",
      expectedMimeType: "image/jpeg",
      expectedByteSize: body.length,
    }),
    (error) => error?.status === 422 && error?.details?.code === "INVALID_IMAGE_CONTENT",
  );
});

test("normalization strips EXIF and writes a bounded JPEG", async () => {
  const source = await sharp({
    create: { width: 640, height: 720, channels: 3, background: "#6f8f7b" },
  })
    .withMetadata({ orientation: 6 })
    .jpeg({ quality: 95 })
    .toBuffer();
  let stored;
  const storage = createAvatar3dStorage({
    inspectObject: async () => ({ contentType: "image/jpeg", contentLength: source.length }),
    fetchObject: async () => responseWithBuffer(source, { contentType: "image/jpeg" }),
    putObject: async (input) => { stored = input; return { stored: true }; },
  });

  const result = await storage.verifyAndNormalizeAvatarPhoto({
    sourceStorageKey: "users/u/avatar-3d/photos/p/source.jpg",
    normalizedStorageKey: "users/u/avatar-3d/photos/p/normalized.jpg",
    expectedMimeType: "image/jpeg",
    expectedByteSize: source.length,
  });
  const metadata = await sharp(stored.body).metadata();

  assert.equal(stored.contentType, "image/jpeg");
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.orientation, undefined);
  assert.equal(result.width, 720);
  assert.equal(result.height, 640);
});

test("provider persistence rejects non-HTTPS and oversized GLB results", async () => {
  const storage = createAvatar3dStorage({
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-length": String(150 * 1024 * 1024 + 1) }),
      body: null,
      arrayBuffer: async () => new ArrayBuffer(0),
    }),
    putObject: async () => ({ stored: true }),
  });

  await assert.rejects(
    () => storage.persistAvatarProviderResult({
      userId: ids.user,
      jobId: ids.job,
      modelUrl: "http://example.com/model.glb",
    }),
    (error) => error?.status === 502,
  );
  await assert.rejects(
    () => storage.persistAvatarProviderResult({
      userId: ids.user,
      jobId: ids.job,
      modelUrl: "https://example.com/model.glb",
    }),
    (error) => error?.status === 502 && error?.details?.code === "PROVIDER_RESULT_TOO_LARGE",
  );
});

test("provider WebP thumbnails are normalized to private metadata-free JPEG", async () => {
  const glb = Buffer.alloc(12);
  glb.write("glTF", 0, "ascii");
  const webp = await sharp({
    create: { width: 96, height: 128, channels: 3, background: "#7595a5" },
  }).webp().toBuffer();
  const writes = [];
  const storage = createAvatar3dStorage({
    fetchImpl: async (url) => url.endsWith("model.glb")
      ? responseWithBuffer(glb, { contentType: "model/gltf-binary" })
      : responseWithBuffer(webp, { contentType: "image/webp" }),
    putObject: async (input) => { writes.push(input); return { stored: true }; },
  });

  const result = await storage.persistAvatarProviderResult({
    userId: ids.user,
    jobId: ids.job,
    modelUrl: "https://result.example/model.glb",
    thumbnailUrl: "https://result.example/preview.webp",
  });
  const thumbnailWrite = writes.find((write) => write.objectKey.endsWith("thumbnail.jpg"));
  const metadata = await sharp(thumbnailWrite.body).metadata();

  assert.equal(result.thumbnail.contentType, "image/jpeg");
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined);
});

test("Range forwarding accepts exactly one valid byte range", async () => {
  assert.equal(isValidSingleRange("bytes=0-499"), true);
  assert.equal(isValidSingleRange("bytes=500-"), true);
  assert.equal(isValidSingleRange("bytes=-500"), true);
  assert.equal(isValidSingleRange("bytes=0-1,4-5"), false);
  assert.equal(isValidSingleRange("items=0-1"), false);

  const calls = [];
  const storage = createAvatar3dStorage({
    fetchObject: async (input) => { calls.push(input); return { ok: true }; },
  });
  await storage.streamAvatarObject({ objectKey: "users/u/avatar-3d/model.glb", range: "bytes=0-499" });
  assert.equal(calls[0].range, "bytes=0-499");
  await assert.rejects(
    () => storage.streamAvatarObject({
      objectKey: "users/u/avatar-3d/model.glb",
      range: "bytes=0-1,4-5",
    }),
    (error) => error?.status === 416,
  );
});
