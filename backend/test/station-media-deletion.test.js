import assert from "node:assert/strict";
import test from "node:test";

import {
  createStationMediaDeletionService,
  deleteStationMediaStorageObject,
} from "../src/station-media-deletion-service.js";

test("station media deletion removes storage before the database record", async () => {
  const calls = [];
  const deleteMedia = createStationMediaDeletionService({
    findAsset: async () => ({
      id: "asset-1",
      storageProvider: "oss",
      storageKey: "station-media/user-1/asset-1.jpg",
    }),
    deleteStorageObject: async () => calls.push("storage"),
    deleteAsset: async () => {
      calls.push("database");
      return { id: "asset-1" };
    },
  });

  assert.deepEqual(
    await deleteMedia({ userId: "user-1", mediaAssetId: "asset-1" }),
    { id: "asset-1" },
  );
  assert.deepEqual(calls, ["storage", "database"]);
});

test("station media remains retryable when storage deletion fails", async () => {
  let databaseDeleted = false;
  const deleteMedia = createStationMediaDeletionService({
    findAsset: async () => ({
      id: "asset-1",
      storageProvider: "oss",
      storageKey: "station-media/user-1/asset-1.jpg",
    }),
    deleteStorageObject: async () => {
      throw new Error("storage unavailable");
    },
    deleteAsset: async () => {
      databaseDeleted = true;
    },
  });

  await assert.rejects(() =>
    deleteMedia({ userId: "user-1", mediaAssetId: "asset-1" }));
  assert.equal(databaseDeleted, false);
});

test("station media storage deletion dispatches local and OSS providers", async () => {
  const calls = [];
  const dependencies = {
    deleteLocalObject: async (objectKey) => calls.push(["local", objectKey]),
    deleteOss: async ({ objectKey }) => calls.push(["oss", objectKey]),
  };

  await deleteStationMediaStorageObject(
    { storageProvider: "local", storageKey: "local/item.jpg" },
    dependencies,
  );
  await deleteStationMediaStorageObject(
    { storageProvider: "OSS", storageKey: "remote/item.jpg" },
    dependencies,
  );
  await deleteStationMediaStorageObject(
    { storageProvider: "pending", storageKey: "" },
    dependencies,
  );

  assert.deepEqual(calls, [
    ["local", "local/item.jpg"],
    ["oss", "remote/item.jpg"],
  ]);
  await assert.rejects(
    () => deleteStationMediaStorageObject(
      { storageProvider: "unknown", storageKey: "unknown/item.jpg" },
      dependencies,
    ),
    (error) => error?.details?.code === "UNSUPPORTED_STORAGE_PROVIDER",
  );
});
