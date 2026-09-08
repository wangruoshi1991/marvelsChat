import assert from "node:assert/strict";
import test from "node:test";

import {
  createStationAlbumDeletionService,
  createStationMediaDeletionService,
  deleteStationMediaStorageObject,
} from "../src/station-media-deletion-service.js";

test("station album deletion removes every stored object before database rows", async () => {
  const calls = [];
  const deleteAlbum = createStationAlbumDeletionService({
    listAssets: async () => [
      { id: "asset-1", storageKey: "one.jpg" },
      { id: "asset-2", storageKey: "two.jpg" },
    ],
    deleteStorageObject: async (asset) => calls.push(`storage:${asset.id}`),
    deleteAlbum: async () => {
      calls.push("database:album");
      return true;
    },
  });

  assert.equal(await deleteAlbum({ userId: "user-1", albumId: "album-1" }), true);
  assert.deepEqual(calls, ["storage:asset-1", "storage:asset-2", "database:album"]);
});

test("station album remains retryable when one stored object cannot be deleted", async () => {
  let databaseDeleted = false;
  const deleteAlbum = createStationAlbumDeletionService({
    listAssets: async () => [{ id: "asset-1", storageKey: "one.jpg" }],
    deleteStorageObject: async () => {
      throw new Error("storage unavailable");
    },
    deleteAlbum: async () => {
      databaseDeleted = true;
    },
  });

  await assert.rejects(() => deleteAlbum({ userId: "user-1", albumId: "album-1" }));
  assert.equal(databaseDeleted, false);
});

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
