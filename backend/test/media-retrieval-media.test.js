import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

const {
  MediaRetrievalMediaError,
  createEphemeralProviderUrl,
  loadOwnedMediaBytes,
  normalizeImageForProvider,
  selectRepresentativeFrameTimestamps,
} = await import("../src/media-retrieval-media.js");

test("owned uploaded images are normalized within provider limits", async () => {
  const source = await sharp({
    create: { width: 4000, height: 2000, channels: 3, background: "#eab308" },
  }).jpeg().toBuffer();
  const loaded = await loadOwnedMediaBytes({
    asset: {
      id: "asset-1",
      userId: "user-1",
      status: "uploaded",
      deletedAt: null,
      storageKey: "private/asset-1.jpg",
      mimeType: "image/jpeg",
      kind: "image",
    },
    fetchOssObject: async () => new Response(source),
  });
  const normalized = await normalizeImageForProvider({ bytes: loaded.bytes, mimeType: loaded.mimeType });
  const metadata = await sharp(normalized.bytes).metadata();

  assert.equal(loaded.bytes.equals(source), true);
  assert.equal(normalized.mimeType, "image/webp");
  assert.ok(metadata.width <= 3072);
  assert.ok(metadata.height <= 3072);
  assert.ok(normalized.bytes.length <= 8 * 1024 * 1024);
});

test("media helper refuses an unowned, deleted, or unavailable asset without storage details", async () => {
  await assert.rejects(
    () => loadOwnedMediaBytes({
      asset: { status: "deleted", storageKey: "private/should-not-read.jpg" },
      fetchOssObject: async () => {
        throw new Error("must not be called");
      },
    }),
    (error) => error instanceof MediaRetrievalMediaError && error.code === "asset_not_indexable",
  );
});

test("original media reads cancel declared or streamed oversized bodies and reject legacy body-less transports", async () => {
  const asset = { userId: "owner", status: "uploaded", storageKey: "owned-original", kind: "image", mimeType: "image/jpeg" };
  let cancelled = 0;
  const responses = [
    new Response(new ReadableStream({ cancel() { cancelled += 1; } }), { headers: { "content-length": String(26 * 1024 * 1024) } }),
    new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(26 * 1024 * 1024)); },
      cancel() { cancelled += 1; },
    })),
    { arrayBuffer: async () => Buffer.from("legacy transport") },
  ];
  for (const response of responses) await assert.rejects(
    loadOwnedMediaBytes({ asset, fetchOssObject: async () => response }),
    error => error.code === "asset_not_indexable");
  assert.equal(cancelled, 2);
});

test("representative video frame selection is ordered and never exceeds six frames", () => {
  const timestamps = selectRepresentativeFrameTimestamps({ durationSeconds: 120, maxFrames: 20 });
  assert.equal(timestamps.length, 6);
  assert.deepEqual([...timestamps].sort((left, right) => left - right), timestamps);
  assert.ok(timestamps[0] >= 0);
  assert.ok(timestamps.at(-1) < 120);
});

test("temporary provider media is stored and cleaned up without exposing its key in the persistent result", async () => {
  const calls = [];
  const temporary = await createEphemeralProviderUrl({
    userId: "user-1",
    traceId: "a".repeat(32),
    bytes: Buffer.from("synthetic image"),
    mimeType: "image/webp",
    putPrivateObject: async (input) => {
      calls.push({ type: "put", key: input.key });
      return { key: input.key, contentType: input.contentType, byteSize: input.bytes.length };
    },
    createGetSignedUrl: ({ objectKey }) => `https://private.example/${objectKey}?signature=hidden`,
    deleteObject: async ({ objectKey }) => calls.push({ type: "delete", key: objectKey }),
  });

  assert.match(temporary.url, /^https:\/\/private\.example\//);
  assert.equal(Object.hasOwn(temporary, "key"), false);
  await temporary.cleanup();
  assert.deepEqual(calls.map((call) => call.type), ["put", "delete"]);
});

test("a temporary-object cleanup failure is surfaced for durable retry instead of being swallowed", async () => {
  const temporary = await createEphemeralProviderUrl({
    userId: "user-1",
    traceId: "a".repeat(32),
    bytes: Buffer.from("synthetic image"),
    mimeType: "image/webp",
    putPrivateObject: async () => null,
    createGetSignedUrl: ({ objectKey }) => `https://private.example/${objectKey}?signature=hidden`,
    deleteObject: async () => { throw new Error("synthetic cleanup failure"); },
  });

  await assert.rejects(
    () => temporary.cleanup(),
    (error) => error instanceof MediaRetrievalMediaError &&
      error.code === "retrieval_temporary_cleanup_pending" &&
      typeof error.cleanupObjectKey === "string" &&
      error.cleanupObjectKey.includes("user-1"),
  );
});

test("a signed URL failure deletes the already-uploaded temporary object without exposing its key", async () => {
  const calls = [];
  await assert.rejects(
    () => createEphemeralProviderUrl({
      userId: "user-1",
      traceId: "a".repeat(32),
      bytes: Buffer.from("synthetic image"),
      mimeType: "image/webp",
      putPrivateObject: async (input) => calls.push({ type: "put", key: input.key }),
      createGetSignedUrl: () => { throw new Error("provider signer unavailable"); },
      deleteObject: async ({ objectKey }) => calls.push({ type: "delete", key: objectKey }),
    }),
    (error) => error instanceof MediaRetrievalMediaError && error.code === "retrieval_provider_transport_unavailable",
  );
  assert.deepEqual(calls.map((call) => call.type), ["put", "delete"]);
  assert.equal(JSON.stringify(calls).includes("provider signer unavailable"), false);
});

test("an invalid signed URL performs exactly one temporary-object cleanup", async () => {
  const calls = [];
  await assert.rejects(
    () => createEphemeralProviderUrl({
      userId: "user-1",
      traceId: "a".repeat(32),
      bytes: Buffer.from("synthetic image"),
      mimeType: "image/webp",
      putPrivateObject: async (input) => calls.push({ type: "put", key: input.key }),
      createGetSignedUrl: () => "not-a-signed-url",
      deleteObject: async ({ objectKey }) => calls.push({ type: "delete", key: objectKey }),
    }),
    (error) => error instanceof MediaRetrievalMediaError && error.code === "retrieval_provider_transport_unavailable",
  );
  assert.deepEqual(calls.map((call) => call.type), ["put", "delete"]);
});
