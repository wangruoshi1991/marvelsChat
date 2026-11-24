import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { ChatVoiceMessage } from '../src/features/messages/ChatVoiceMessage';
import type { ChatAttachmentDTO } from '../src/models/api';
import * as audio from '../src/services/chatVoiceAudio';
import { palettes } from '../src/shared/theme';

const attachment: ChatAttachmentDTO = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'audio',
  filename: 'voice.m4a',
  title: 'Voice',
  mimeType: 'audio/mp4',
  byteSize: 1000,
  durationMs: 4500,
  downloadPath:
    '/api/chat-attachments/00000000-0000-4000-8000-000000000001/content',
  data: {},
};
let tree: Renderer.ReactTestRenderer;
let complete: () => void;
let error: jest.Mock;
let snapshot: audio.VoicePlaybackState;
const button = () =>
  tree.root.find(
    item =>
      item.props.testID === 'chat-attachment-audio' &&
      typeof item.props.onPress === 'function',
  );
const render = (token = 'synthetic-owner') => (
  <ChatVoiceMessage
    attachment={attachment}
    token={token}
    palette={palettes.light}
    language="zh"
    onActionMessage={error}
  />
);
const press = async () => {
  await act(async () => button().props.onPress());
};
const tick = async (ms = 200) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(async () => {
  jest.useFakeTimers();
  error = jest.fn();
  snapshot = {
    phase: 'playing',
    positionMs: 1200,
    durationMs: 4500,
    waveform: Array.from({ length: 32 }, (_, i) => i / 31),
  };
  jest.spyOn(audio, 'playVoiceAttachment').mockImplementation(
    () =>
      new Promise(resolve => {
        complete = resolve;
      }),
  );
  jest
    .spyOn(audio, 'readVoicePlayback')
    .mockImplementation(async () => snapshot);
  jest
    .spyOn(audio, 'setVoicePlaybackPaused')
    .mockImplementation(async (_id, paused) => {
      snapshot = { ...snapshot, phase: paused ? 'paused' : 'playing' };
      return true;
    });
  jest.spyOn(audio, 'stopVoicePlayback').mockImplementation(() => undefined);
  await act(async () => {
    tree = Renderer.create(render());
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('loading is cancellable and does not invent a waveform or playback position', async () => {
  expect(
    tree.root.findAllByProps({ testID: 'chat-voice-waveform' }),
  ).toHaveLength(0);
  await press();
  expect(button().props.accessibilityLabel).toBe('取消加载语音');
  await press();
  expect(audio.stopVoicePlayback).toHaveBeenCalledTimes(1);
  await act(async () => complete());
  await tick();
  expect(audio.readVoicePlayback).not.toHaveBeenCalled();
  expect(button().props.accessibilityLabel).toBe('播放语音，5 秒');
});

test('actual progress and waveform survive pause, resume does not create a second playback, completion resets position', async () => {
  await press();
  await tick(100);
  expect(button().props.accessibilityLabel).toBe('暂停语音播放');
  expect(button().props.accessibilityValue.text).toBe('0:01 / 0:05');
  expect(
    tree.root.findAllByProps({ testID: 'chat-voice-waveform' }).length,
  ).toBeGreaterThan(0);
  await press();
  expect(button().props.accessibilityLabel).toBe('继续播放语音');
  await tick(1000);
  expect(button().props.accessibilityValue.text).toBe('0:01 / 0:05');
  await press();
  expect(button().props.accessibilityLabel).toBe('暂停语音播放');
  expect(audio.playVoiceAttachment).toHaveBeenCalledTimes(1);
  expect(
    jest.mocked(audio.setVoicePlaybackPaused).mock.calls.map(call => call[1]),
  ).toEqual([true, false]);
  await act(async () => complete());
  expect(button().props.accessibilityLabel).toBe('播放语音，5 秒');
  expect(button().props.accessibilityValue).toBeUndefined();
  expect(
    tree.root.findAllByProps({ testID: 'chat-voice-waveform' }).length,
  ).toBeGreaterThan(0);
});

test('slow native reads do not accumulate and late reads cannot cross an account boundary', async () => {
  let resolve!: (value: audio.VoicePlaybackState) => void;
  jest.mocked(audio.readVoicePlayback).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await press();
  await tick(100);
  await tick(3000);
  expect(audio.readVoicePlayback).toHaveBeenCalledTimes(1);
  await act(async () => tree.update(render('different-synthetic-owner')));
  await act(async () => {
    resolve(snapshot);
    complete();
  });
  expect(button().props.accessibilityLabel).toBe('播放语音，5 秒');
  expect(
    tree.root.findAllByProps({ testID: 'chat-voice-waveform' }),
  ).toHaveLength(0);
  expect(audio.stopVoicePlayback).toHaveBeenCalledTimes(1);
});

test('failure exposes retry and a new scoped playback can succeed', async () => {
  jest
    .mocked(audio.playVoiceAttachment)
    .mockRejectedValueOnce(new Error('Synthetic offline'));
  await press();
  expect(error).toHaveBeenCalledWith('Synthetic offline');
  expect(button().props.accessibilityLabel).toBe('重试播放语音');
  await press();
  await tick(100);
  expect(button().props.accessibilityLabel).toBe('暂停语音播放');
  expect(audio.playVoiceAttachment).toHaveBeenCalledTimes(2);
});

test('failed pause does not pretend the native player paused', async () => {
  await press();
  await tick(100);
  jest.mocked(audio.setVoicePlaybackPaused).mockResolvedValueOnce(false);
  await press();
  expect(button().props.accessibilityLabel).toBe('暂停语音播放');
});

test('a playing snapshot already in flight cannot undo a successful pause', async () => {
  await press();
  await tick(100);
  let resolve!: (value: audio.VoicePlaybackState) => void;
  jest.mocked(audio.readVoicePlayback).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  await tick();
  await press();
  expect(button().props.accessibilityLabel).toBe('继续播放语音');
  await act(async () => resolve({ ...snapshot, phase: 'playing' }));
  expect(button().props.accessibilityLabel).toBe('继续播放语音');
});

test('paused timing stays unchanged during a position or speed command and trusts the native readback', async () => {
  await press();
  await tick(100);
  await press();
  const seek = jest
    .spyOn(audio, 'seekVoicePlayback')
    .mockImplementation(async (_id, target) => {
      snapshot = { ...snapshot, positionMs: target };
      return true;
    });
  const rate = jest
    .spyOn(audio, 'setVoicePlaybackRate')
    .mockResolvedValue(true);
  const track = tree.root.findByProps({ testID: 'chat-voice-seek' });
  await act(async () =>
    track.props.onAccessibilityAction({
      nativeEvent: { actionName: 'increment' },
    }),
  );
  const [playbackId] = jest.mocked(audio.playVoiceAttachment).mock.calls[0];
  expect(seek).toHaveBeenCalledWith(playbackId, 4500);
  await tick();
  expect(button().props.accessibilityValue.text).toBe('0:04 / 0:05');
  const speed = tree.root.findByProps({ testID: 'chat-voice-rate' });
  await act(async () => speed.props.onPress());
  await act(async () => speed.props.onPress());
  expect(speed.props.accessibilityValue.text).toBe('2×');
  expect(rate.mock.calls).toEqual([
    [playbackId, 1.5],
    [playbackId, 2],
  ]);
  expect(button().props.accessibilityLabel).toBe('继续播放语音');
  expect(audio.setVoicePlaybackPaused).toHaveBeenCalledTimes(1);
  await act(async () => complete());
  expect(speed.props.accessibilityValue.text).toBe('1×');
  expect(speed.props.disabled).toBe(true);
});
