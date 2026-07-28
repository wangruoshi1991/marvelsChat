import {
  Asset,
  ImageLibraryOptions,
  launchCamera,
  launchImageLibrary,
} from 'react-native-image-picker';

export type PickedStationMedia = {
  kind: 'image' | 'video';
  uri: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number | null;
  width: number | null;
  height: number | null;
};

const photoPickerOptions: ImageLibraryOptions = {
  mediaType: 'photo',
  selectionLimit: 1,
  quality: 0.9,
  includeBase64: false,
  includeExtra: false,
};

const normalizeAsset = (
  asset: Asset | undefined,
  kind: PickedStationMedia['kind'],
): PickedStationMedia | null => {
  if (!asset?.uri) {
    return null;
  }
  const sourceMimeType = String(asset.type || '').trim().toLowerCase();
  const mimeType =
    sourceMimeType === 'image/jpg'
      ? 'image/jpeg'
      : sourceMimeType ||
        (kind === 'video' ? 'video/quicktime' : 'image/jpeg');

  return {
    kind,
    uri: asset.uri,
    originalFilename:
      asset.fileName ||
      (kind === 'video'
        ? `miaoxun-video-${Date.now()}.mov`
        : `miaoxun-photo-${Date.now()}.jpg`),
    mimeType,
    byteSize: typeof asset.fileSize === 'number' ? asset.fileSize : null,
    width: typeof asset.width === 'number' ? asset.width : null,
    height: typeof asset.height === 'number' ? asset.height : null,
  };
};

const normalizeAssets = (
  assets: Asset[] | undefined,
  kind: PickedStationMedia['kind'],
) =>
  (assets || [])
    .map(asset => normalizeAsset(asset, kind))
    .filter((asset): asset is PickedStationMedia => Boolean(asset));

export async function pickStationImagesFromLibrary(selectionLimit = 9) {
  const response = await launchImageLibrary({
    ...photoPickerOptions,
    selectionLimit: Math.max(1, Math.min(9, selectionLimit)),
  });
  if (response.didCancel) {
    return [];
  }
  if (response.errorMessage) {
    throw new Error(response.errorMessage);
  }
  return normalizeAssets(response.assets, 'image');
}

export async function pickStationPhotoFromLibrary() {
  const assets = await pickStationImagesFromLibrary(1);
  return assets[0] || null;
}

export async function pickStationVideoFromLibrary() {
  const response = await launchImageLibrary({
    mediaType: 'video',
    selectionLimit: 1,
    includeBase64: false,
    includeExtra: false,
    videoQuality: 'high',
  });
  if (response.didCancel) {
    return null;
  }
  if (response.errorMessage) {
    throw new Error(response.errorMessage);
  }
  return normalizeAssets(response.assets, 'video')[0] || null;
}

export async function takeStationPhoto() {
  const response = await launchCamera({
    ...photoPickerOptions,
    cameraType: 'back',
    saveToPhotos: false,
  });
  if (response.didCancel) {
    return null;
  }
  if (response.errorMessage) {
    throw new Error(response.errorMessage);
  }
  return normalizeAssets(response.assets, 'image')[0] || null;
}
