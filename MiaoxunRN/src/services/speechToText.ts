import { NativeEventEmitter, NativeModules } from 'react-native';

type SpeechToTextResult = { text: string };
export type SpeechRecognitionUpdate = {
  requestId: string;
  state: 'preparing' | 'listening' | 'finishing';
  text: string;
};
export type SpeechRecognitionSession = {
  result: Promise<string>;
  finish: () => void;
  cancel: () => void;
};

export type SpeechPermissionPreparation = {
  result: Promise<void>;
  cancel: () => void;
};

type SpeechNativeModule = {
  prepare: (requestId: string) => Promise<{ ready: boolean }>;
  recognize: (
    requestId: string,
    languageCode: string,
  ) => Promise<SpeechToTextResult>;
  finish: (requestId: string) => void;
  cancel: (requestId: string) => void;
  addListener: (eventName: string) => void;
  removeListeners: (count: number) => void;
};
let nextRequest = 0;

export function startSpeechRecognition(
  languageCode: 'zh' | 'en',
  onUpdate?: (update: SpeechRecognitionUpdate) => void,
): SpeechRecognitionSession {
  const nativeSpeech = NativeModules.MiaoxunSpeechModule as
    | SpeechNativeModule
    | undefined;
  if (
    !nativeSpeech?.recognize ||
    !nativeSpeech.finish ||
    !nativeSpeech.cancel
  ) {
    throw new Error('当前安装包未接入语音识别模块，请重新构建 App。');
  }
  const requestId = `speech-${Date.now()}-${++nextRequest}`;
  let settled = false;
  let cancelled = false;
  const subscription = new NativeEventEmitter(nativeSpeech).addListener(
    'MiaoxunSpeechUpdate',
    (update: SpeechRecognitionUpdate) => {
      if (!settled && !cancelled && update.requestId === requestId) {
        onUpdate?.(update);
      }
    },
  );
  let nativeResult: Promise<SpeechToTextResult>;
  try {
    nativeResult = nativeSpeech.recognize(requestId, languageCode);
  } catch (cause) {
    subscription.remove();
    throw cause;
  }
  const result = nativeResult
    .then(response => {
      if (cancelled) {
        throw Object.assign(new Error('语音输入已取消。'), {
          code: 'speech_cancelled',
        });
      }
      const text = response.text.trim();
      if (!text) throw new Error('没有识别到有效文字。');
      return text;
    })
    .finally(() => {
      settled = true;
      subscription.remove();
    });
  return {
    result,
    finish: () => {
      if (!settled && !cancelled) nativeSpeech.finish(requestId);
    },
    cancel: () => {
      if (settled || cancelled) return;
      cancelled = true;
      subscription.remove();
      nativeSpeech.cancel(requestId);
    },
  };
}

export function prepareSpeechRecognition(): SpeechPermissionPreparation {
  const nativeSpeech = NativeModules.MiaoxunSpeechModule as
    | SpeechNativeModule
    | undefined;
  if (!nativeSpeech?.prepare || !nativeSpeech.cancel) {
    throw new Error('当前安装包未接入语音权限模块，请重新构建 App。');
  }
  const requestId = `speech-permission-${Date.now()}-${++nextRequest}`;
  let cancelled = false;
  let settled = false;
  const result = nativeSpeech
    .prepare(requestId)
    .then(response => {
      if (cancelled)
        throw Object.assign(new Error('语音授权已取消。'), {
          code: 'speech_cancelled',
        });
      if (!response.ready) throw new Error('语音权限尚未开启。');
    })
    .finally(() => {
      settled = true;
    });
  return {
    result,
    cancel: () => {
      if (settled || cancelled) return;
      cancelled = true;
      nativeSpeech.cancel(requestId);
    },
  };
}

export async function recognizeSpeechOnce(languageCode: 'zh' | 'en') {
  // Existing tap-to-speak callers explicitly start one recognition after their permission flow.
  await prepareSpeechRecognition().result;
  return startSpeechRecognition(languageCode).result;
}
