import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";
process.env.OSS_BUCKET = "miaoxun-test";
process.env.OSS_ENDPOINT = "oss-cn-test.aliyuncs.com";
process.env.OSS_ACCESS_KEY_ID = "test-access-key";
process.env.OSS_ACCESS_KEY_SECRET = "test-secret";

const {
  buildStationMediaObjectKey,
  createOssDeleteSignedUrl,
  createOssHeadSignedUrl,
  deleteOssObject,
  inspectOssObject,
} = await import("../src/oss-service.js");

test("station media object keys stay inside the user and asset prefix", () => {
  assert.equal(
    buildStationMediaObjectKey({
      userId: "user-1",
      assetId: "asset-1",
      originalFilename: "../../My photo (1).jpg",
    }),
    "users/user-1/station-media/asset-1/My-photo-1-.jpg",
  );
});

test("HEAD URLs use the OSS HEAD canonical signature", () => {
  const objectKey = "users/user-1/station-media/asset-1/photo.jpg";
  const signedUrl = new URL(createOssHeadSignedUrl({ objectKey }));
  const expires = signedUrl.searchParams.get("Expires");
  const expectedSignature = crypto
    .createHmac("sha1", "test-secret")
    .update(`HEAD\n\n\n${expires}\n/miaoxun-test/${objectKey}`)
    .digest("base64");

  assert.equal(signedUrl.searchParams.get("Signature"), expectedSignature);
  assert.equal(
    signedUrl.pathname,
    "/users/user-1/station-media/asset-1/photo.jpg",
  );
});

test("inspectOssObject performs HEAD and returns normalized metadata", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return new Response(null, {
      status: 200,
      headers: {
        "content-type": "image/jpeg",
        "content-length": "2048",
        etag: '"etag-value"',
      },
    });
  };

  const result = await inspectOssObject({
    objectKey: "users/user-1/station-media/asset-1/photo.jpg",
    fetchImpl,
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "HEAD");
  assert.deepEqual(result, {
    contentType: "image/jpeg",
    contentLength: 2048,
    etag: '"etag-value"',
  });
});

test("DELETE URLs use the OSS DELETE canonical signature", () => {
  const objectKey = "users/user-1/station-media/asset-1/photo.jpg";
  const signedUrl = new URL(createOssDeleteSignedUrl({ objectKey }));
  const expires = signedUrl.searchParams.get("Expires");
  const expectedSignature = crypto
    .createHmac("sha1", "test-secret")
    .update(`DELETE\n\n\n${expires}\n/miaoxun-test/${objectKey}`)
    .digest("base64");

  assert.equal(signedUrl.searchParams.get("Signature"), expectedSignature);
});

test("deleteOssObject treats an already missing object as deleted", async () => {
  const calls = [];
  const result = await deleteOssObject({
    objectKey: "users/user-1/station-media/asset-1/photo.jpg",
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 404 });
    },
  });

  assert.equal(calls[0].options.method, "DELETE");
  assert.deepEqual(result, { deleted: true });
});
