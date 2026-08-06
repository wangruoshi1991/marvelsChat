import assert from "node:assert/strict";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const {
  deleteLocalMediaObject,
  fetchLocalMediaObject,
  inspectLocalMediaObject,
  localMediaPathForObjectKey,
  writeLocalMediaObject,
} = await import("../src/local-media-storage.js");

test("local media storage writes, inspects, ranges, and deletes an object", async () => {
  const objectKey = `tests/${crypto.randomUUID()}/photo.jpg`;
  const bytes = Buffer.from("local-media-payload");
  try {
    const stored = await writeLocalMediaObject({
      objectKey,
      readable: Readable.from(bytes),
      expectedBytes: bytes.length,
      maxBytes: 1024,
    });
    assert.equal(stored.byteSize, bytes.length);

    const inspected = await inspectLocalMediaObject({
      objectKey,
      contentType: "image/jpeg",
    });
    assert.equal(inspected.contentLength, bytes.length);
    assert.equal(inspected.contentType, "image/jpeg");

    const response = await fetchLocalMediaObject({
      objectKey,
      contentType: "image/jpeg",
      range: "bytes=6-10",
    });
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("content-range"), `bytes 6-10/${bytes.length}`);
    assert.equal(
      Buffer.from(await new Response(response.body).arrayBuffer()).toString(),
      "media",
    );
  } finally {
    await deleteLocalMediaObject(objectKey);
  }
});

test("local media storage rejects traversal and oversized input", async () => {
  assert.throws(() => localMediaPathForObjectKey("../secret"));

  const objectKey = `tests/${crypto.randomUUID()}/oversized.bin`;
  await assert.rejects(() =>
    writeLocalMediaObject({
      objectKey,
      readable: Readable.from(Buffer.alloc(12)),
      expectedBytes: 12,
      maxBytes: 10,
    }),
  );
  await deleteLocalMediaObject(objectKey);
});
