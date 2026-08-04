import { HttpError } from "./http-error.js";
import {
  deleteStationMediaAsset,
  getStationMediaAssetForUser,
} from "./station-repository.js";
import { deletePrivateStorageObject } from "./storage-deletion-service.js";

export async function deleteStationMediaStorageObject(
  { storageProvider, storageKey },
  dependencies,
) {
  await deletePrivateStorageObject(
    { provider: storageProvider, objectKey: storageKey },
    dependencies,
  );
}

export function createStationMediaDeletionService({
  findAsset = getStationMediaAssetForUser,
  deleteStorageObject = deleteStationMediaStorageObject,
  deleteAsset = deleteStationMediaAsset,
} = {}) {
  return async ({ userId, mediaAssetId }) => {
    const asset = await findAsset({ userId, mediaAssetId });
    if (!asset) throw new HttpError(404, "Media asset not found");

    await deleteStorageObject(asset);
    const deletedAsset = await deleteAsset({ userId, mediaAssetId });
    if (!deletedAsset) {
      throw new HttpError(409, "Media asset deletion state changed");
    }
    return deletedAsset;
  };
}

export const deleteOwnedStationMediaAsset =
  createStationMediaDeletionService();
