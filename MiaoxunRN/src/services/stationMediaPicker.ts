import {
  Asset,
  ImageLibraryOptions,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';

export type PickedStationMedia = {
  uri: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number | null;
  width: number | null;
  height: number | null;
};

const pickerOptions: ImageLibraryOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  quality: 0.9,
  includeBase64: false,
  includeExtra: false,
};

const normalizeAsset = (
  asset: Asset | undefined,
): PickedStationMedia | null => {
  if (!asset?.uri) {
    return null;
  }

  return {
    uri: asset.uri,
    originalFilename: asset.fileName || `miaoxun-photo-${Date.now()}.jpg`,
    mimeType: asset.type || 'image/jpeg',
    byteSize: typeof asset.fileSize === 'number' ? asset.fileSize : null,
    width: typeof asset.width === 'number' ? asset.width : null,
    height: typeof asset.height === 'number' ? asset.height : null,
  };
};

const pickFirstAsset = (assets: Asset[] | undefined) =>
  normalizeAsset(assets?.[0]);

const pickAssets = (assets: Asset[] | undefined) =>
  (assets || [])
    .map(asset => normalizeAsset(asset))
    .filter((asset): asset is PickedStationMedia => Boolean(asset));

export async function pickStationPhotoFromLibrary() {
  const response = await launchImageLibrary(pickerOptions);
  if (response.didCancel) {
    return null;
  }
  if (response.errorMessage) {
    throw new Error(response.errorMessage);
  }
  return pickFirstAsset(response.assets);
}

export async function pickStationPhotosFromLibrary(selectionLimit = 9) {
  const response = await launchImageLibrary({
    ...pickerOptions,
    selectionLimit: Math.min(Math.max(selectionLimit, 1), 9),
  });
  if (response.didCancel) {
    return [];
  }
  if (response.errorMessage) {
    throw new Error(response.errorMessage);
  }
  return pickAssets(response.assets);
}

export async function takeStationPhoto() {
  const response = await launchCamera({
    ...pickerOptions,
    cameraType: 'back',
    saveToPhotos: false,
  });
  if (response.didCancel) {
    return null;
  }
  if (response.errorMessage) {
    throw new Error(response.errorMessage);
  }
  return pickFirstAsset(response.assets);
}
