import { Platform } from 'react-native';
import { appErrorText } from '../src/shared/i18n';
import {
  assertVoiceCallResourceAvailable,
  isVoiceCallActive,
  releaseVoiceCallResources,
  reserveVoiceCallResources,
  subscribeToVoiceCallResources,
} from '../src/services/voiceCall/voiceCallResources';

const first = {};
const second = {};
afterEach(() => {
  releaseVoiceCallResources(first);
  releaseVoiceCallResources(second);
  jest.restoreAllMocks();
});

test('only the current call may release camera, microphone and playback access', () => {
  const onChange = jest.fn();
  const unsubscribe = subscribeToVoiceCallResources(onChange);
  reserveVoiceCallResources(first);
  reserveVoiceCallResources(second);
  releaseVoiceCallResources(first);
  expect(isVoiceCallActive()).toBe(true);
  for (const resource of ['camera', 'microphone', 'playback'] as const) {
    expect(() => assertVoiceCallResourceAvailable(resource)).toThrow('通话');
  }
  releaseVoiceCallResources(second);
  expect(isVoiceCallActive()).toBe(false);
  expect(() => assertVoiceCallResourceAvailable('camera')).not.toThrow();
  expect(onChange).toHaveBeenCalledTimes(2);
  unsubscribe();
});

test('an Android system picker is blocked and an in-app iOS picker stays available', () => {
  reserveVoiceCallResources(first);
  jest.replaceProperty(Platform, 'OS', 'android');
  let conflict: unknown;
  try {
    assertVoiceCallResourceAvailable('picker');
  } catch (error) {
    conflict = error;
  }
  expect(appErrorText('en', conflict, '操作失败', 'Failed')).toBe(
    'The system picker leaves Miaoxun. End the call first.',
  );
  jest.replaceProperty(Platform, 'OS', 'ios');
  expect(() => assertVoiceCallResourceAvailable('picker')).not.toThrow();
});
