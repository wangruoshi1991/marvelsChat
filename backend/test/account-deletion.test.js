import assert from "node:assert/strict";
import test from "node:test";

import {
  createAccountService,
  deleteAccountStorageObject,
} from "../src/account-service.js";

test("account deletion verifies the password before storage or database changes", async () => {
  const calls = [];
  const service = createAccountService({
    getCredential: async () => ({ id: "user-1", passwordHash: "stored-hash" }),
    verifyPassword: async () => false,
    listStorageObjects: async () => {
      calls.push("list-storage");
      return [];
    },
    deleteStorageObject: async () => calls.push("delete-storage"),
    deleteUser: async () => calls.push("delete-user"),
  });

  await assert.rejects(
    () => service.deleteAccount({ userId: "user-1", password: "wrong" }),
    (error) => error?.status === 403
      && error?.details?.code === "INVALID_ACCOUNT_PASSWORD",
  );
  assert.deepEqual(calls, []);
});

test("account deletion removes every distinct private object before the user", async () => {
  const calls = [];
  const service = createAccountService({
    getCredential: async () => ({ id: "user-1", passwordHash: "stored-hash" }),
    verifyPassword: async () => true,
    listStorageObjects: async () => [
      { provider: "oss", objectKey: "users/u/model.glb" },
      { provider: "OSS", objectKey: "users/u/model.glb" },
      { provider: "local", objectKey: "users/u/photo.jpg" },
      { provider: "", objectKey: "" },
    ],
    deleteStorageObject: async (object) => calls.push(["storage", object]),
    deleteUser: async ({ userId }) => calls.push(["user", userId]),
  });

  const result = await service.deleteAccount({
    userId: "user-1",
    password: "correct",
  });

  assert.deepEqual(calls, [
    ["storage", { provider: "oss", objectKey: "users/u/model.glb" }],
    ["storage", { provider: "local", objectKey: "users/u/photo.jpg" }],
    ["user", "user-1"],
  ]);
  assert.deepEqual(result, { deleted: true });
});

test("account remains when private storage cleanup fails", async () => {
  let userDeleted = false;
  const service = createAccountService({
    getCredential: async () => ({ id: "user-1", passwordHash: "stored-hash" }),
    verifyPassword: async () => true,
    listStorageObjects: async () => [
      { provider: "oss", objectKey: "users/u/model.glb" },
    ],
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

test("storage deletion dispatches local and OSS objects explicitly", async () => {
  const calls = [];
  const dependencies = {
    deleteLocalObject: async (objectKey) => calls.push(["local", objectKey]),
    deleteOss: async ({ objectKey }) => calls.push(["oss", objectKey]),
  };
  await deleteAccountStorageObject(
    { provider: "local", objectKey: "users/u/local.jpg" },
    dependencies,
  );
  await deleteAccountStorageObject(
    { provider: "aliyun-oss", objectKey: "users/u/remote.glb" },
    dependencies,
  );

  assert.deepEqual(calls, [
    ["local", "users/u/local.jpg"],
    ["oss", "users/u/remote.glb"],
  ]);
  await assert.rejects(
    () => deleteAccountStorageObject(
      { provider: "unknown", objectKey: "users/u/unknown" },
      dependencies,
    ),
    (error) => error?.details?.code === "UNSUPPORTED_STORAGE_PROVIDER",
  );
});
