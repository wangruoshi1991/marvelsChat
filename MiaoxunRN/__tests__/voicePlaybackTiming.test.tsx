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
const waveform = Array.from({ length: 32 }, (_, index) => index / 31);
let tree: Renderer.ReactTestRenderer;
let snapshot: audio.VoicePlaybackState;
let completions: Array<() => void>;
let onError: jest.Mock;
const button = () =>
  tree.root.find(
    item =>
      item.props.testID === 'chat-attachment-audio' &&
      typeof item.props.onPress === 'function',
  );
const track = () => tree.root.findByProps({ testID: 'chat-voice-seek' });
const waveformCount = () =>
  tree.root.findAllByProps({ testID: 'chat-voice-waveform' }).length;
const press = async () => {
  await act(async () => button().props.onPress());
};
const tick = async (ms: number) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
};

beforeEach(async () => {
  jest.useFakeTimers();
  onError = jest.fn();
  completions = [];
  snapshot = { phase: 'loading', positionMs: 0, durationMs: 0, waveform: [] };
  jest.spyOn(audio, 'playVoiceAttachment').mockImplementation(
    () =>
      new Promise(resolve => {
        completions.push(resolve);
      }),
  );
  jest
    .spyOn(audio, 'readVoicePlayback')
    .mockImplementation(async () => snapshot);
  jest.spyOn(audio, 'stopVoicePlayback').mockImplementation(() => undefined);
  await act(async () => {
    tree = Renderer.create(
      <ChatVoiceMessage
        attachment={attachment}
        token="synthetic-owner"
        palette={palettes.light}
        language="zh"
        onActionMessage={onError}
      />,
    );
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

test('starts showing real playback before waveform decoding finishes without restarting or resetting progress', async () => {
  await press();
  await tick(40);
  expect(button().props.accessibilityLabel).toBe('取消加载语音');
  expect(waveformCount()).toBe(0);
  expect(track().props.accessibilityState.disabled).toBe(true);

  snapshot = {
    phase: 'playing',
    positionMs: 1800,
    durationMs: 4500,
    waveform: [],
  };
  await tick(70);
  expect(button().props.accessibilityLabel).toBe('暂停语音播放');
  expect(button().props.accessibilityValue.text).toBe('0:01 / 0:05');
  expect(track().props.accessibilityState.disabled).toBe(false);
  expect(waveformCount()).toBe(0);

  snapshot = { ...snapshot, positionMs: 2200, waveform };
  await tick(200);
  expect(waveformCount()).toBeGreaterThan(0);
  expect(button().props.accessibilityLabel).toBe('暂停语音播放');
  expect(button().props.accessibilityValue.text).toBe('0:02 / 0:05');
  expect(audio.playVoiceAttachment).toHaveBeenCalledTimes(1);
  expect(audio.stopVoicePlayback).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});

test('cancelled loading cannot revive from a late playing read or completion, including after a new playback starts', async () => {
  let lateRead!: (value: audio.VoicePlaybackState) => void;
  jest
    .mocked(audio.readVoicePlayback)
    .mockResolvedValueOnce(snapshot)
    .mockImplementationOnce(
      () =>
        new Promise(resolve => {
          lateRead = resolve;
        }),
    );
  await press();
  await tick(40);
  await tick(70);
  const oldId = jest.mocked(audio.playVoiceAttachment).mock.calls[0][0];
  expect(button().props.accessibilityLabel).toBe('取消加载语音');
  await press();
  expect(audio.stopVoicePlayback).toHaveBeenCalledWith(oldId);
  expect(button().props.accessibilityLabel).toBe('播放语音，5 秒');
  expect(waveformCount()).toBe(0);

  snapshot = {
    phase: 'playing',
    positionMs: 1000,
    durationMs: 4500,
    waveform: [],
  };
  await press();
  await tick(40);
  const newId = jest.mocked(audio.playVoiceAttachment).mock.calls[1][0];
  expect(newId).not.toBe(oldId);
  expect(button().props.accessibilityLabel).toBe('暂停语音播放');
  await act(async () => {
    lateRead({
      phase: 'playing',
      positionMs: 4000,
      durationMs: 4500,
      waveform,
    });
    completions[0]();
  });
  expect(button().props.accessibilityLabel).toBe('暂停语音播放');
  expect(button().props.accessibilityValue.text).toBe('0:01 / 0:05');
  expect(waveformCount()).toBe(0);
  expect(audio.stopVoicePlayback).toHaveBeenCalledTimes(1);

  await tick(200);
  const reads = jest
    .mocked(audio.readVoicePlayback)
    .mock.calls.map(call => call[0]);
  expect(reads).toEqual([oldId, oldId, newId, newId]);
  expect(audio.playVoiceAttachment).toHaveBeenCalledTimes(2);
  expect(onError).not.toHaveBeenCalled();
});
