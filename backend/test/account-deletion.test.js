import assert from "node:assert/strict";
import test from "node:test";

process.env.DEFAULT_ADMIN_PASSWORD ||= "test-only-password";

const { createAccountService } = await import("../src/account-service.js");
const { listUserStorageKeys } = await import("../src/repositories.js");

test("account deletion verifies the password before touching storage or database", async () => {
  const calls = [];
  const service = createAccountService({
    getCredential: async () => ({ id: "user-1", passwordHash: "stored-hash" }),
    verifyPassword: async () => false,
    listStorageKeys: async () => {
      calls.push("list-storage");
      return [];
    },
    deleteStorageObject: async () => calls.push("delete-storage"),
    deleteUser: async () => calls.push("delete-user"),
  });

  await assert.rejects(
    () => service.deleteAccount({ userId: "user-1", password: "wrong" }),
    (error) => error?.status === 401,
  );
  assert.deepEqual(calls, []);
});

test("account deletion removes each private object once before deleting the user", async () => {
  const calls = [];
  const service = createAccountService({
    getCredential: async () => ({ id: "user-1", passwordHash: "stored-hash" }),
    verifyPassword: async () => true,
    listStorageKeys: async () => ["users/u/a.jpg", "users/u/a.jpg", "users/u/b.txt", ""],
    deleteStorageObject: async ({ objectKey }) => calls.push(["storage", objectKey]),
    deleteUser: async ({ userId }) => calls.push(["user", userId]),
  });

  const result = await service.deleteAccount({ userId: "user-1", password: "correct" });

  assert.deepEqual(calls, [
    ["storage", "users/u/a.jpg"],
    ["storage", "users/u/b.txt"],
    ["user", "user-1"],
  ]);
  assert.deepEqual(result, { deleted: true });
});

test("account deletion never removes the database user when storage cleanup fails", async () => {
  let userDeleted = false;
  const service = createAccountService({
    getCredential: async () => ({ id: "user-1", passwordHash: "stored-hash" }),
    verifyPassword: async () => true,
    listStorageKeys: async () => ["users/u/a.jpg"],
    deleteStorageObject: async () => {
      throw new Error("storage unavailable");
    },
    deleteUser: async () => {
      userDeleted = true;
    },
  });

  await assert.rejects(() =>
    service.deleteAccount({ userId: "user-1", password: "correct" }));
  assert.equal(userDeleted, false);
});

test("account storage inventory includes every private avatar object", async () => {
  const calls = [];
  const result = await listUserStorageKeys("user-1", {
    queryFn: async (sql, params) => {
      calls.push({ sql, params });
      return [
        { storage_key: "users/user-1/avatar-3d/photos/a/source.jpg" },
        { storage_key: "users/user-1/avatar-3d/jobs/j/model.glb" },
      ];
    },
  });

  assert.deepEqual(result, [
    "users/user-1/avatar-3d/photos/a/source.jpg",
    "users/user-1/avatar-3d/jobs/j/model.glb",
  ]);
  assert.equal(calls.length, 1);
  for (const source of [
    "station_media_assets",
    "file_assets",
    "avatar_3d_job_photos",
    "source_storage_key",
    "normalized_storage_key",
    "avatar_3d_style_previews",
    "avatar_3d_models",
    "glb_storage_key",
    "thumbnail_storage_key",
  ]) {
    assert.match(calls[0].sql, new RegExp(source));
  }
  assert.deepEqual(calls[0].params, Array(7).fill("user-1"));
});
