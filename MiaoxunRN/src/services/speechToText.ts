import { NativeModules } from 'react-native';

type SpeechToTextResult = {
  text: string;
};

const nativeSpeech = NativeModules.MiaoxunSpeechModule as
  | {
      recognizeOnce?: (languageCode?: string) => Promise<SpeechToTextResult>;
    }
  | undefined;

export async function recognizeSpeechOnce(languageCode: 'zh' | 'en') {
  if (!nativeSpeech?.recognizeOnce) {
    throw new Error('当前安装包未接入语音识别模块，请重新构建 App。');
  }

  const result = await nativeSpeech.recognizeOnce(languageCode);
  const text = result.text.trim();
  if (!text) {
    throw new Error('没有识别到有效文字。');
  }
  return text;
}
