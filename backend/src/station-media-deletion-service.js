import { HttpError } from "./http-error.js";
import {
  deleteStationMediaAsset,
  deleteStationAlbum,
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
  deleteAsset = deleteStationMediaAsset,
} = {}) {
  return async (input) => {
    const deletedAsset = await deleteAsset(input);
    if (!deletedAsset) {
      throw new HttpError(404, "Media asset not found");
    }
    return deletedAsset;
  };
}

export const deleteOwnedStationMediaAsset =
  createStationMediaDeletionService();

export function createStationAlbumDeletionService({
  deleteAlbum = deleteStationAlbum,
} = {}) {
  return (input) => deleteAlbum(input);
}

export const deleteOwnedStationAlbum = createStationAlbumDeletionService();
