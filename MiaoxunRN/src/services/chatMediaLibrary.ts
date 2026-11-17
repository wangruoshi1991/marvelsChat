import { NativeModules } from 'react-native';

type NativeChatMediaLibrary = {
  saveChatImage?: (
    attachmentId: string,
    token: string,
  ) => Promise<{ status: 'saved'; attachmentId: string }>;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const nativeMediaLibrary = NativeModules.MiaoxunMediaLibraryModule as
  | NativeChatMediaLibrary
  | undefined;

export class ChatMediaSaveError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'ChatMediaSaveError';
    this.code = code;
  }
}

export async function saveChatImageToLibrary({
  attachmentId,
  token,
}: {
  attachmentId: string;
  token: string;
}): Promise<{ status: 'saved'; attachmentId: string }> {
  if (!uuidPattern.test(attachmentId)) {
    throw new ChatMediaSaveError(
      'CHAT_MEDIA_INVALID_ID',
      '图片引用无效，未保存。',
    );
  }
  if (!token.trim()) {
    throw new ChatMediaSaveError(
      'CHAT_MEDIA_MISSING_SESSION',
      '登录状态已失效，请重新登录后再保存。',
    );
  }
  if (typeof nativeMediaLibrary?.saveChatImage !== 'function') {
    throw new ChatMediaSaveError(
      'CHAT_MEDIA_SAVE_UNAVAILABLE',
      '当前设备暂不支持保存聊天图片到系统相册。',
    );
  }
  try {
    const result = await nativeMediaLibrary.saveChatImage(attachmentId, token);
    if (result?.status !== 'saved' || result.attachmentId !== attachmentId) {
      throw new ChatMediaSaveError(
        'CHAT_MEDIA_SAVE_UNCONFIRMED',
        '保存到相册未确认，请检查相册后重试。',
      );
    }
    return result;
  } catch (error) {
    if (error instanceof ChatMediaSaveError) throw error;
    throw new ChatMediaSaveError(
      'CHAT_MEDIA_SAVE_FAILED',
      error instanceof Error ? error.message : '保存到相册失败，请重试。',
    );
  }
}
