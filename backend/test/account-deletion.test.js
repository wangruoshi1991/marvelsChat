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
    deleteUser: async () => calls.push("delete-user"),
  });

  await assert.rejects(
    () => service.deleteAccount({ userId: "user-1", password: "wrong" }),
    (error) => error?.status === 403
      && error?.details?.code === "INVALID_ACCOUNT_PASSWORD",
  );
  assert.deepEqual(calls, []);
});

test("account deletion submits the verified password revision to the atomic repository operation", async () => {
  const calls = [];
  const service = createAccountService({
    getCredential: async () => ({ id: "user-1", passwordHash: "stored-hash" }),
    verifyPassword: async () => true,
    deleteUser: async (input) => {
      calls.push(input);
      return { deleted: true, cleanupStatus: "pending" };
    },
  });

  const result = await service.deleteAccount({
    userId: "user-1",
    password: "correct",
  });

  assert.deepEqual(calls, [{ userId: "user-1", expectedPasswordHash: "stored-hash" }]);
  assert.deepEqual(result, { deleted: true, cleanupStatus: "pending" });
});

test("failed account database transaction leaves the durable deletion request unapplied", async () => {
  const objects = new Set(["first.jpg", "second.jpg"]);
  const queued = [];
  const service = createAccountService({
    getCredential: async () => ({ id: "user-1", passwordHash: "stored-hash" }),
    verifyPassword: async () => true,
    listStorageObjects: async () => Array.from(objects, (objectKey) => ({ provider: "local", objectKey })),
    enqueueCleanup: async () => queued.push("cleanup"),
    deleteUser: async () => { throw new Error("database rollback"); },
  });
  await assert.rejects(
    () => service.deleteAccount({ userId: "user-1", password: "correct" }),
    /database rollback/,
  );
  assert.deepEqual([...objects], ["first.jpg", "second.jpg"]);
  assert.deepEqual(queued, []);
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
