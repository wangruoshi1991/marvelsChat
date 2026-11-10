import {
  Asset,
  ImageLibraryOptions,
  ImagePickerResponse,
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
  assetRepresentationMode: 'compatible',
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
  const sourceMimeType = String(asset.type || '')
    .trim()
    .toLowerCase();
  const mimeType =
    sourceMimeType === 'image/jpg'
      ? 'image/jpeg'
      : sourceMimeType || (kind === 'video' ? 'video/quicktime' : 'image/jpeg');

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

const throwPickerError = (
  response: ImagePickerResponse,
  source: 'camera' | 'library',
) => {
  if (!response.errorCode && !response.errorMessage) {
    return;
  }
  if (response.errorCode === 'camera_unavailable') {
    throw new Error('当前设备无法使用相机，请使用真机拍摄或从相册选择照片。');
  }
  if (response.errorCode === 'permission') {
    throw new Error(
      source === 'camera'
        ? '无法使用相机，请在系统设置中允许妙讯访问相机后重试。'
        : '无法访问相册，请在系统设置中允许妙讯访问照片后重试。',
    );
  }
  const message =
    source === 'camera'
      ? '拍摄失败，请重试或从相册选择照片。'
      : '选择照片或视频失败，请重试。';
  const detail = response.errorMessage?.trim();
  throw new Error(detail ? `${message}\n${detail}` : message);
};

export async function pickStationImagesFromLibrary(selectionLimit = 9) {
  const response = await launchImageLibrary({
    ...photoPickerOptions,
    selectionLimit: Math.max(1, Math.min(9, selectionLimit)),
  });
  if (response.didCancel) {
    return [];
  }
  throwPickerError(response, 'library');
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
  throwPickerError(response, 'library');
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
  throwPickerError(response, 'camera');
  return normalizeAssets(response.assets, 'image')[0] || null;
}
