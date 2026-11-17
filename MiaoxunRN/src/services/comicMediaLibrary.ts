import { NativeModules, Platform } from 'react-native';

type NativeMediaLibrary = {
  saveImage?: (
    mediaAssetId: string,
    token: string,
  ) => Promise<{ status: 'saved'; mediaAssetId: string }>;
};

const nativeMediaLibrary = NativeModules.MiaoxunMediaLibraryModule as
  | NativeMediaLibrary
  | undefined;

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
  if (
    Platform.OS !== 'ios' ||
    typeof nativeMediaLibrary?.saveImage !== 'function'
  ) {
    throw new ComicMediaSaveError(
      'COMIC_MEDIA_SAVE_UNAVAILABLE',
      '当前设备暂不支持保存漫画图片到系统相册。',
    );
  }
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      nativeMediaLibrary.saveImage(mediaAssetId, token),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(
          () =>
            reject(
              new ComicMediaSaveError(
                'COMIC_MEDIA_SAVE_TIMEOUT',
                '保存到相册超时，请检查网络和相册权限后重试。',
              ),
            ),
          20_000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
