import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  buildAvatarPhotoObjectKey,
  createAvatar3dStorage,
  isValidSingleRange,
  validateSelfContainedGlb,
} = await import("../src/avatar-3d-storage.js");

const ids = {
  user: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  photo: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  job: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
};

const publicLookup = async () => [{ address: "8.8.8.8", family: 4 }];

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

const glbWithDocument = (document) => {
  const json = Buffer.from(JSON.stringify(document));
  const jsonLength = (json.length + 3) & ~3;
  const totalLength = 12 + 8 + jsonLength;
  const glb = Buffer.alloc(totalLength, 0x20);
  glb.write("glTF", 0, "ascii");
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonLength, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  json.copy(glb, 20);
  return glb;
};

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
  assert.equal(result.quality.status, "advisory");
  assert.equal(result.quality.canContinue, true);
});

test("normalization accepts a usable photo below 640 pixels with advice", async () => {
  const source = await sharp({
    create: { width: 320, height: 720, channels: 3, background: "#777777" },
  }).jpeg().toBuffer();
  const storage = createAvatar3dStorage({
    inspectObject: async () => ({ contentType: "image/jpeg", contentLength: source.length }),
    fetchObject: async () => responseWithBuffer(source, { contentType: "image/jpeg" }),
    putObject: async () => ({ stored: true }),
  });

  const result = await storage.verifyAndNormalizeAvatarPhoto({
    sourceStorageKey: "users/u/avatar-3d/photos/p/source.jpg",
    normalizedStorageKey: "users/u/avatar-3d/photos/p/normalized.jpg",
    expectedMimeType: "image/jpeg",
    expectedByteSize: source.length,
  });

  assert.equal(result.width, 320);
  assert.equal(result.quality.status, "advisory");
  assert.equal(result.quality.warningCodes.includes("low_resolution"), true);
});

test("normalization still rejects a photo with a side below 240 pixels", async () => {
  const source = await sharp({
    create: { width: 239, height: 720, channels: 3, background: "#777777" },
  }).jpeg().toBuffer();
  const storage = createAvatar3dStorage({
    inspectObject: async () => ({ contentType: "image/jpeg", contentLength: source.length }),
    fetchObject: async () => responseWithBuffer(source, { contentType: "image/jpeg" }),
    putObject: async () => ({ stored: true }),
  });

  await assert.rejects(
    () => storage.verifyAndNormalizeAvatarPhoto({
      sourceStorageKey: "users/u/avatar-3d/photos/p/source.jpg",
      normalizedStorageKey: "users/u/avatar-3d/photos/p/normalized.jpg",
      expectedMimeType: "image/jpeg",
      expectedByteSize: source.length,
    }),
    (error) => error?.details?.code === "PHOTO_RESOLUTION_TOO_SMALL",
  );
});

test("provider persistence rejects non-HTTPS and oversized GLB results", async () => {
  const storage = createAvatar3dStorage({
    lookupHost: publicLookup,
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
    () => storage.persistAvatarProviderModel({
      userId: ids.user,
      jobId: ids.job,
      modelUrl: "http://example.com/model.glb",
    }),
    (error) => error?.status === 502,
  );
  await assert.rejects(
    () => storage.persistAvatarProviderModel({
      userId: ids.user,
      jobId: ids.job,
      modelUrl: "https://example.com/model.glb",
    }),
    (error) => error?.status === 502 && error?.details?.code === "PROVIDER_RESULT_TOO_LARGE",
  );
});

test("provider thumbnail persistence never downloads the GLB and normalizes to private JPEG", async () => {
  const webp = await sharp({
    create: { width: 96, height: 128, channels: 3, background: "#7595a5" },
  }).webp().toBuffer();
  const writes = [];
  const fetched = [];
  const storage = createAvatar3dStorage({
    lookupHost: publicLookup,
    fetchImpl: async (url) => {
      fetched.push(url);
      return responseWithBuffer(webp, { contentType: "image/webp" });
    },
    putObject: async (input) => { writes.push(input); return { stored: true }; },
  });

  const result = await storage.persistAvatarProviderThumbnail({
    userId: ids.user,
    jobId: ids.job,
    thumbnailUrl: "https://result.example/preview.webp",
  });
  const thumbnailWrite = writes.find((write) => write.objectKey.endsWith("thumbnail.jpg"));
  const metadata = await sharp(thumbnailWrite.body).metadata();

  assert.deepEqual(fetched, ["https://result.example/preview.webp"]);
  assert.equal(result.contentType, "image/jpeg");
  assert.equal(result.width, 96);
  assert.equal(result.height, 128);
  assert.equal(metadata.format, "jpeg");
  assert.equal(metadata.exif, undefined);
});

test("four provider reference images are persisted in fixed private view slots", async () => {
  const image = await sharp({
    create: { width: 320, height: 480, channels: 3, background: "#7595a5" },
  }).png().toBuffer();
  const fetched = [];
  const writes = [];
  const storage = createAvatar3dStorage({
    lookupHost: publicLookup,
    fetchImpl: async (url) => {
      fetched.push(url);
      return responseWithBuffer(image, { contentType: "image/png" });
    },
    putObject: async (input) => { writes.push(input); return { stored: true }; },
  });
  const imageUrls = ["front", "left", "back", "right"]
    .map((view) => `https://result.example/${view}.png`);

  const result = await storage.persistAvatarReferenceImages({
    userId: ids.user,
    jobId: ids.job,
    referenceSetId: ids.photo,
    imageUrls,
  });

  assert.deepEqual(fetched, imageUrls);
  assert.deepEqual(result.map((item) => item.view), ["front", "left", "back", "right"]);
  assert.deepEqual(result.map((item) => item.sequenceIndex), [0, 1, 2, 3]);
  assert.deepEqual(
    writes.map((item) => item.objectKey.split("/").at(-1)),
    ["front.jpg", "left.jpg", "back.jpg", "right.jpg"],
  );
  assert.equal(result.every((item) => item.contentType === "image/jpeg"), true);
});

test("reference persistence rejects incomplete input before download", async () => {
  let fetchCalls = 0;
  const storage = createAvatar3dStorage({
    fetchImpl: async () => { fetchCalls += 1; return responseWithBuffer(Buffer.alloc(0)); },
  });

  await assert.rejects(
    () => storage.persistAvatarReferenceImages({
      userId: ids.user,
      jobId: ids.job,
      referenceSetId: ids.photo,
      imageUrls: [
        "https://result.example/front.png",
        "https://result.example/left.png",
        "https://result.example/back.png",
      ],
    }),
    (error) => error?.details?.code === "REFERENCE_SET_INCOMPLETE",
  );
  assert.equal(fetchCalls, 0);
});

test("partial reference persistence removes already written private objects", async () => {
  const valid = await sharp({
    create: { width: 320, height: 480, channels: 3, background: "#7595a5" },
  }).png().toBuffer();
  let fetchCalls = 0;
  const writes = [];
  const deletes = [];
  const storage = createAvatar3dStorage({
    lookupHost: publicLookup,
    fetchImpl: async () => {
      fetchCalls += 1;
      return responseWithBuffer(fetchCalls === 1 ? valid : Buffer.from("invalid"));
    },
    putObject: async (input) => { writes.push(input.objectKey); return { stored: true }; },
    deleteObject: async (input) => { deletes.push(input.objectKey); return { deleted: true }; },
  });

  await assert.rejects(
    () => storage.persistAvatarReferenceImages({
      userId: ids.user,
      jobId: ids.job,
      referenceSetId: ids.photo,
      imageUrls: ["front", "left", "back", "right"]
        .map((view) => `https://result.example/${view}.png`),
    }),
    (error) => error?.details?.code === "INVALID_REFERENCE_IMAGE",
  );
  assert.equal(writes.length, 1);
  assert.deepEqual(deletes, writes);
});

test("provider model persistence never downloads the thumbnail", async () => {
  const glb = glbWithDocument({ asset: { version: "2.0" }, scenes: [{ nodes: [] }] });
  const fetched = [];
  const writes = [];
  const storage = createAvatar3dStorage({
    lookupHost: publicLookup,
    fetchImpl: async (url) => {
      fetched.push(url);
      return responseWithBuffer(glb, { contentType: "model/gltf-binary" });
    },
    optimizeMobileModel: async (source) => ({ body: Buffer.from(source) }),
    putObject: async (input) => { writes.push(input); return { stored: true }; },
  });

  const result = await storage.persistAvatarProviderModel({
    userId: ids.user,
    jobId: ids.job,
    modelUrl: "https://result.example/model.glb",
  });

  assert.deepEqual(fetched, ["https://result.example/model.glb"]);
  assert.equal(result.contentType, "model/gltf-binary");
  assert.equal(result.byteSize, glb.length);
  assert.equal(result.mobile.contentType, "model/gltf-binary");
  assert.equal(result.mobile.byteSize, glb.length);
  assert.deepEqual(
    writes.map((item) => item.objectKey.split("/").at(-1)),
    ["model.glb", "model-mobile.glb"],
  );
});

test("provider GLB must be structurally valid and self-contained", async () => {
  const valid = glbWithDocument({
    asset: { version: "2.0" },
    images: [{ uri: "data:image/png;base64,AA==" }],
  });
  const external = glbWithDocument({
    asset: { version: "2.0" },
    images: [{ uri: "https://tracker.example/private-texture.png" }],
  });
  assert.equal(validateSelfContainedGlb(valid), true);
  assert.equal(validateSelfContainedGlb(external), false);

  let writes = 0;
  const storage = createAvatar3dStorage({
    lookupHost: publicLookup,
    fetchImpl: async () => responseWithBuffer(external, { contentType: "model/gltf-binary" }),
    putObject: async () => { writes += 1; },
  });
  await assert.rejects(
    () => storage.persistAvatarProviderModel({
      userId: ids.user,
      jobId: ids.job,
      modelUrl: "https://result.example/model.glb",
    }),
    (error) => error?.details?.code === "INVALID_GLB_RESULT",
  );
  assert.equal(writes, 0);
});

test("provider persistence rejects hostnames that resolve to private networks", async () => {
  let fetchCalls = 0;
  const storage = createAvatar3dStorage({
    lookupHost: async () => [{ address: "127.0.0.1", family: 4 }],
    fetchImpl: async () => { fetchCalls += 1; return responseWithBuffer(Buffer.alloc(0)); },
  });

  await assert.rejects(
    () => storage.persistAvatarProviderModel({
      userId: ids.user,
      jobId: ids.job,
      modelUrl: "https://provider.example/model.glb",
    }),
    (error) => error?.details?.code === "INVALID_PROVIDER_RESULT_URL",
  );
  assert.equal(fetchCalls, 0);
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
