import { Platform } from 'react-native';

export type VoiceCallConflict = 'camera' | 'microphone' | 'playback' | 'picker';
let callOwner: object | undefined;
const listeners = new Set<() => void>();

export const isVoiceCallActive = () => Boolean(callOwner);
export const subscribeToVoiceCallResources = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const notify = () => listeners.forEach(listener => listener());

export function reserveVoiceCallResources(owner: object) {
  const wasActive = isVoiceCallActive();
  callOwner = owner;
  if (!wasActive) notify();
}

export function releaseVoiceCallResources(owner: object) {
  if (callOwner !== owner) return;
  callOwner = undefined;
  notify();
}

export const voiceCallConflictCopy: Record<
  VoiceCallConflict,
  [string, string]
> = {
  camera: [
    '通话中暂不能拍摄或扫码，请先结束通话。',
    'End the call before using the camera.',
  ],
  microphone: [
    '通话正在使用麦克风，请先结束通话。',
    'The call is using the microphone. End the call first.',
  ],
  playback: [
    '通话中暂不能播放语音或视频，请先结束通话。',
    'End the call before playing a voice message or video.',
  ],
  picker: [
    '系统选择器会离开妙讯，请先结束通话。',
    'The system picker leaves Miaoxun. End the call first.',
  ],
};

export function assertVoiceCallResourceAvailable(resource: VoiceCallConflict) {
  if (callOwner && (resource !== 'picker' || Platform.OS === 'android')) {
    throw Object.assign(new Error(voiceCallConflictCopy[resource][0]), {
      code: 'VOICE_CALL_MEDIA_CONFLICT',
      resource,
    });
  }
}

export function getVoiceCallConflict(error: unknown) {
  if (
    !error ||
    typeof error !== 'object' ||
    !('code' in error) ||
    error.code !== 'VOICE_CALL_MEDIA_CONFLICT' ||
    !('resource' in error) ||
    typeof error.resource !== 'string' ||
    !Object.hasOwn(voiceCallConflictCopy, error.resource)
  )
    return undefined;
  return voiceCallConflictCopy[error.resource as VoiceCallConflict];
}
