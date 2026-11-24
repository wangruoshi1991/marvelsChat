import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { VoiceCallAudioOutput } from '../src/features/voiceCalls/VoiceCallAudioOutput';
import {
  CallAudioRouteError,
  observeCallAudioRoute,
  readCallAudioRoute,
  selectCallAudioRoute,
  type CallAudioSnapshot,
} from '../src/services/voiceCall/voiceCallAudioRoute';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/voiceCall/voiceCallAudioRoute', () => ({
  CallAudioRouteError: jest.requireActual(
    '../src/services/voiceCall/voiceCallAudioRoute',
  ).CallAudioRouteError,
  observeCallAudioRoute: jest.fn(),
  readCallAudioRoute: jest.fn(),
  selectCallAudioRoute: jest.fn(),
}));

const earpiece = { id: 'receiver', kind: 'earpiece' } as const;
const speaker = { id: 'speaker', kind: 'speaker' } as const;
const bluetooth = {
  id: 'bt',
  kind: 'bluetooth',
  name: 'Test headset',
} as const;
const initial = { currentId: earpiece.id, devices: [earpiece, speaker] };
let tree: Renderer.ReactTestRenderer;
let emit: (data: CallAudioSnapshot) => void;
const find = (testID: string) => tree.root.findAllByProps({ testID })[0];
const press = (testID: string) => act(async () => find(testID).props.onPress());
const remove = jest.fn();
beforeEach(async () => {
  jest.resetAllMocks();
  jest.mocked(readCallAudioRoute).mockResolvedValue(initial);
  jest.mocked(observeCallAudioRoute).mockImplementation(listener => {
    emit = listener;
    return { remove };
  });
  await act(async () => {
    tree = Renderer.create(
      <VoiceCallAudioOutput
        connectedAt={1}
        disabled={false}
        language="zh"
        palette={palettes.light}
      />,
    );
  });
});
afterEach(() => act(() => tree.unmount()));

test('one tap switches the speaker and a second tap returns to the earpiece', async () => {
  jest.mocked(selectCallAudioRoute).mockResolvedValueOnce(initial);
  expect(find('voice-call-audio-devices')).toBeUndefined();
  await press('voice-call-speaker');
  expect(selectCallAudioRoute).toHaveBeenCalledWith(
    speaker,
    expect.any(Function),
  );
  expect(find('voice-call-speaker').props.accessibilityState).toMatchObject({
    busy: true,
    selected: false,
  });
  expect(find('voice-call-audio-current').props.children).toContain('听筒');

  act(() => emit({ ...initial, currentId: speaker.id }));
  expect(find('voice-call-speaker').props.accessibilityState.selected).toBe(
    true,
  );
  jest.mocked(selectCallAudioRoute).mockResolvedValueOnce(initial);
  await press('voice-call-speaker');
  expect(selectCallAudioRoute).toHaveBeenLastCalledWith(
    earpiece,
    expect.any(Function),
  );
  expect(find('voice-call-speaker').props.accessibilityState.selected).toBe(
    false,
  );
});

test('a single connected headset is a direct control and Bluetooth denial retains the active route', async () => {
  act(() => emit({ ...initial, devices: [...initial.devices, bluetooth] }));
  jest
    .mocked(selectCallAudioRoute)
    .mockRejectedValueOnce(new CallAudioRouteError('permission'));
  expect(find('voice-call-audio-devices').props.accessibilityLabel).toBe(
    bluetooth.name,
  );
  await press('voice-call-audio-devices');
  expect(selectCallAudioRoute).toHaveBeenCalledWith(
    bluetooth,
    expect.any(Function),
  );
  expect(find('voice-call-audio-current').props.children).toContain('听筒');
  expect(find('voice-call-audio-error').props.children).toContain('附近设备');
  act(() => emit(initial));
  expect(find('voice-call-audio-devices')).toBeUndefined();
});

test('only multiple attached headsets open a menu of available alternatives', async () => {
  const wired = { id: 'wired', kind: 'wired' } as const;
  act(() =>
    emit({ ...initial, devices: [...initial.devices, bluetooth, wired] }),
  );
  expect(find('voice-call-audio-option-bt')).toBeUndefined();
  await press('voice-call-audio-devices');
  expect(find('voice-call-audio-option-bt').props.accessibilityLabel).toBe(
    bluetooth.name,
  );
  expect(find('voice-call-audio-option-wired').props.accessibilityLabel).toBe(
    '有线耳机',
  );
  expect(selectCallAudioRoute).not.toHaveBeenCalled();
});
