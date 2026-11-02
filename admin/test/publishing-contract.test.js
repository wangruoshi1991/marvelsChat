import test from "node:test";
import assert from "node:assert/strict";
import {
  bindPublishedDependencies,
  buildIdentity,
  buildProductFields,
  identityFormValues,
  validateAvatarFile,
} from "../src/publishing-model.js";

const release = {
  id: "release-a",
  agentKey: "album",
  version: "1.0.0",
  catalogStatus: "published",
  declaredScopes: ["album:read", "album:write"],
};
const identity = {
  key: "album",
  avatarKind: "agent-mark",
  displayName: "相册",
  description: "真实发布身份",
  mark: "册",
  shape: "circle",
  colors: { background: "#AABBCC", foreground: "#112233", accent: "#445566" },
  source: "registry",
  published: true,
  updatedAt: "2026-11-02T00:00:00.000Z",
};

test("product dependencies bind exact published release scopes without mutating the contract", () => {
  const dependencies = bindPublishedDependencies([release.id], [release]);
  assert.deepEqual(dependencies, [
    {
      agentKey: "album",
      agentReleaseId: "release-a",
      version: "1.0.0",
      scopes: ["album:read", "album:write"],
    },
  ]);
  dependencies[0].scopes.push("admin:write");
  assert.deepEqual(release.declaredScopes, ["album:read", "album:write"]);
});

test("stale, unpublished, duplicate and same-Agent dependencies cannot be submitted", () => {
  assert.throws(() => bindPublishedDependencies([], [release]), /至少选择/);
  assert.throws(
    () => bindPublishedDependencies(["missing"], [release]),
    /已不可用/
  );
  assert.throws(
    () =>
      bindPublishedDependencies(
        [release.id],
        [{ ...release, catalogStatus: "review" }]
      ),
    /已不可用/
  );
  assert.throws(
    () => bindPublishedDependencies([release.id, release.id], [release]),
    /重复绑定/
  );
  assert.throws(
    () =>
      bindPublishedDependencies(
        [release.id, "release-b"],
        [release, { ...release, id: "release-b" }]
      ),
    /同一个 Agent/
  );
  assert.throws(
    () =>
      bindPublishedDependencies(
        [release.id],
        [{ ...release, declaredScopes: undefined }]
      ),
    /缺少权限合同/
  );
});

test("identity revision preserves unified shape and colors while normalizing draft ownership", () => {
  const values = identityFormValues(identity);
  const result = buildIdentity(values, "album", "2026-11-02T01:00:00.000Z");
  assert.deepEqual(result, {
    ...identity,
    published: false,
    source: "admin",
    updatedAt: "2026-11-02T01:00:00.000Z",
  });
  assert.equal(Object.hasOwn(result, "avatar"), false);
});

test("image identity requires managed asset and mark mode removes retained upload metadata", () => {
  const values = { ...identityFormValues(identity), avatarKind: "agent-image" };
  assert.throws(() => buildIdentity(values, "album"), /先上传/);
  const asset = {
    assetId: "managed-asset",
    url: "/api/agent-avatar-assets/managed.webp",
    sha256: "a".repeat(64),
    mimeType: "image/webp",
    width: 512,
    height: 512,
  };
  assert.deepEqual(
    buildIdentity({ ...values, avatar: asset }, "album").avatar,
    asset
  );
  assert.equal(
    Object.hasOwn(
      buildIdentity(
        { ...values, avatarKind: "agent-mark", avatar: asset },
        "album"
      ),
      "avatar"
    ),
    false
  );
});

test("product form binds identity to product key and excludes client status and arbitrary scopes", () => {
  const result = buildProductFields(
    {
      productKey: "photo-product",
      version: "1.1.0",
      displayName: "相册服务",
      description: "",
      identity: identityFormValues(identity),
      supportedPlatforms: ["ios"],
      releaseIds: [release.id],
      status: "published",
      scopes: ["admin:write"],
    },
    [release]
  );
  assert.equal(result.identity.key, "photo-product");
  assert.equal(result.identity.displayName, "相册服务");
  assert.equal(result.identity.description, "");
  assert.equal(result.identity.published, false);
  assert.equal(Object.hasOwn(result, "status"), false);
  assert.deepEqual(result.dependencies[0].scopes, release.declaredScopes);
});

test("avatar upload accepts only supported images within the actual 2 MB boundary", () => {
  for (const type of ["image/png", "image/jpeg", "image/webp"])
    assert.doesNotThrow(() =>
      validateAvatarFile({ type, size: 2 * 1024 * 1024 })
    );
  assert.throws(
    () => validateAvatarFile({ type: "image/svg+xml", size: 10 }),
    /PNG/
  );
  assert.throws(
    () => validateAvatarFile({ type: "image/png", size: 2 * 1024 * 1024 + 1 }),
    /2 MB/
  );
  assert.throws(
    () => validateAvatarFile({ type: "image/png", size: 0 }),
    /1 字节/
  );
});
