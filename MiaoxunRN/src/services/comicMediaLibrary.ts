import { NativeModules, Platform } from 'react-native';

type SaveReceipt = { status: 'saved'; mediaAssetId: string };
type NativeMediaLibrary = {
  saveImage?: (mediaAssetId: string, token: string) => Promise<SaveReceipt>;
};

const pendingSaves = new Map<string, Promise<SaveReceipt>>();

export class ComicMediaSaveError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ComicMediaSaveError';
    this.code = code;
  }
}

export async function saveComicImageToLibrary({
  mediaAssetId,
  token,
}: {
  mediaAssetId: string;
  token: string;
}) {
  if (!mediaAssetId.trim()) {
    throw new ComicMediaSaveError(
      'COMIC_MEDIA_INVALID_ID',
      '图片引用无效，未保存。',
    );
  }
  if (!token.trim()) {
    throw new ComicMediaSaveError(
      'COMIC_MEDIA_MISSING_SESSION',
      '登录状态已失效，请重新登录后再保存。',
    );
  }
  const nativeMediaLibrary = NativeModules.MiaoxunMediaLibraryModule as
    | NativeMediaLibrary
    | undefined;
  if (
    Platform.OS !== 'ios' ||
    typeof nativeMediaLibrary?.saveImage !== 'function'
  ) {
    throw new ComicMediaSaveError(
      'COMIC_MEDIA_SAVE_UNAVAILABLE',
      '当前设备暂不支持保存漫画图片到系统相册。',
    );
  }
  const key = JSON.stringify([token, mediaAssetId]);
  const pending = pendingSaves.get(key);
  if (pending) return pending;
  // The native download has a timeout. The Photos permission prompt and write
  // can outlive a viewer, so share the operation until PhotoKit settles it.
  const saving = nativeMediaLibrary
    .saveImage(mediaAssetId, token)
    .then(receipt => {
      if (
        receipt?.status !== 'saved' ||
        receipt.mediaAssetId !== mediaAssetId
      ) {
        throw new ComicMediaSaveError(
          'COMIC_MEDIA_SAVE_UNCONFIRMED',
          '保存到相册未确认，请检查相册后重试。',
        );
      }
      return receipt;
    })
    .finally(() => pendingSaves.delete(key));
  pendingSaves.set(key, saving);
  return saving;
}
