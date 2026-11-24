import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import type { ChatAttachmentDTO } from '../src/models/api';
import { ChatVoiceInput } from '../src/features/messages/ChatVoiceInput';
import { ChatVoiceMessage } from '../src/features/messages/ChatVoiceMessage';
import {
  useChatVoice,
  type ChatVoiceControls,
} from '../src/features/messages/useChatVoice';
import * as audio from '../src/services/chatVoiceAudio';
import * as api from '../src/services/api/chatAttachmentApi';
import { palettes } from '../src/shared/theme';

const attachmentId = '00000000-0000-4000-8000-000000000001';
const attachment: ChatAttachmentDTO = {
  id: attachmentId,
  kind: 'audio',
  filename: 'voice.m4a',
  title: 'voice.m4a',
  mimeType: 'audio/mp4',
  byteSize: 6000,
  durationMs: 2200,
  downloadPath: `/api/chat-attachments/${attachmentId}/content`,
  data: {},
};
const recording = { uri: 'file:///temporary/voice.m4a', durationMs: 2200 };

let tree: ReactTestRenderer.ReactTestRenderer | undefined;
let controls: ChatVoiceControls;
let submit: jest.Mock;
let alert: jest.Mock;

function Harness({ scope = 'chat-A' }: { scope?: string }) {
  controls = useChatVoice({
    scope,
    threadId: scope,
    token: 'test-token',
    onError: alert,
  });
  return (
    <ChatVoiceInput
      controls={{
        ...controls,
        start: mode => {
          controls.start(mode, submit).catch(() => undefined);
        },
      }}
      palette={palettes.light}
      language="zh"
      borderColor="#ddd"
      disabled={false}
    />
  );
}

const touch = (pageY: number, pageX = 180) => ({
  nativeEvent: { pageY, pageX },
});

beforeEach(() => {
  submit = jest.fn().mockResolvedValue(undefined);
  alert = jest.fn();
  jest.spyOn(audio, 'prepareVoiceRecording').mockResolvedValue(true);
  jest.spyOn(audio, 'startVoiceRecording').mockResolvedValue(undefined);
  jest.spyOn(audio, 'finishVoiceRecording').mockResolvedValue(recording);
  jest.spyOn(audio, 'cancelVoiceRecording').mockImplementation(() => undefined);
  jest
    .spyOn(audio, 'releaseVoiceRecording')
    .mockImplementation(() => undefined);
  jest.spyOn(api, 'uploadChatAudio').mockResolvedValue(attachment);
});

afterEach(() => {
  if (tree) act(() => tree?.unmount());
  tree = undefined;
  jest.restoreAllMocks();
});

test('hold and release makes a local draft, and only Send uploads and releases it', async () => {
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness />);
  });
  const hold = tree!.root.findByProps({ testID: 'chat-voice-hold' });
  await act(async () => hold.props.onResponderGrant(touch(400)));
  expect(controls.status).toBe('recording');
  expect(hold.props.accessibilityLabel).toContain('上滑取消');
  await act(async () => hold.props.onResponderRelease(touch(395)));

  const recordingId = jest.mocked(audio.startVoiceRecording).mock.calls[0][0];
  expect(audio.finishVoiceRecording).toHaveBeenCalledWith(recordingId);
  expect(controls.status).toBe('ready');
  expect(api.uploadChatAudio).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
  const send = tree!.root.findByProps({ testID: 'chat-voice-send' });
  await act(async () => send.props.onPress());
  expect(api.uploadChatAudio).toHaveBeenCalledWith({
    threadId: 'chat-A',
    token: 'test-token',
    uri: recording.uri,
    filename: 'voice.m4a',
    idempotencyKey: recordingId,
  });
  expect(submit).toHaveBeenCalledWith(attachmentId);
  expect(audio.releaseVoiceRecording).toHaveBeenCalledWith(recordingId);
});

test('slide up changes the hint and releases the microphone without upload', async () => {
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness />);
  });
  const hold = tree!.root.findByProps({ testID: 'chat-voice-hold' });
  await act(async () => hold.props.onResponderGrant(touch(400)));
  act(() => hold.props.onResponderMove(touch(335)));
  expect(hold.props.accessibilityLabel).toBe('松开取消');
  await act(async () => hold.props.onResponderRelease(touch(335)));
  expect(audio.cancelVoiceRecording).toHaveBeenCalledTimes(1);
  expect(audio.finishVoiceRecording).not.toHaveBeenCalled();
  expect(api.uploadChatAudio).not.toHaveBeenCalled();
  expect(submit).not.toHaveBeenCalled();
});

test('releasing during permission preparation cannot start late recording', async () => {
  let allowed!: (allowed: boolean) => void;
  jest.mocked(audio.prepareVoiceRecording).mockReturnValueOnce(
    new Promise(resolve => {
      allowed = resolve;
    }),
  );
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness />);
  });
  const hold = tree!.root.findByProps({ testID: 'chat-voice-hold' });
  await act(async () => hold.props.onResponderGrant(touch(400)));
  await act(async () => hold.props.onResponderRelease(touch(400)));
  await act(async () => allowed(true));
  expect(audio.startVoiceRecording).not.toHaveBeenCalled();
  expect(controls.status).toBe('idle');
});

test('accessible recording waits for confirmation and failed uploads replay the exact key', async () => {
  jest.mocked(api.uploadChatAudio).mockRejectedValueOnce(new Error('Offline'));
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness />);
  });
  await act(async () => controls.start('accessible', submit));
  await act(async () => controls.finish());
  expect(controls.status).toBe('ready');
  expect(api.uploadChatAudio).not.toHaveBeenCalled();
  await act(async () => controls.upload());
  expect(controls.status).toBe('failed');
  expect(alert).toHaveBeenCalledWith('Offline');
  await act(async () => controls.upload());
  const calls = jest.mocked(api.uploadChatAudio).mock.calls;
  expect(calls[1]).toEqual(calls[0]);
  expect(submit).toHaveBeenCalledTimes(1);
});

test('changing chat while upload is pending releases the file and blocks the old send', async () => {
  let uploaded!: (result: ChatAttachmentDTO) => void;
  jest.mocked(api.uploadChatAudio).mockReturnValueOnce(
    new Promise(resolve => {
      uploaded = resolve;
    }),
  );
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness />);
  });
  await act(async () => controls.start('hold', submit));
  await act(async () => {
    await controls.finish();
    controls.upload().catch(() => undefined);
  });
  expect(controls.status).toBe('uploading');
  await act(async () => tree!.update(<Harness scope="chat-B" />));
  await act(async () => uploaded(attachment));
  expect(submit).not.toHaveBeenCalled();
  expect(audio.releaseVoiceRecording).toHaveBeenCalledTimes(1);
});

test('the audio bubble starts and stops a scoped private playback', async () => {
  let finishPlayback!: () => void;
  const play = jest.spyOn(audio, 'playVoiceAttachment').mockReturnValueOnce(
    new Promise(resolve => {
      finishPlayback = resolve;
    }),
  );
  const stop = jest
    .spyOn(audio, 'stopVoicePlayback')
    .mockImplementation(() => undefined);
  await act(async () => {
    tree = ReactTestRenderer.create(
      <ChatVoiceMessage
        attachment={attachment}
        token="owner"
        palette={palettes.light}
        language="zh"
        onActionMessage={alert}
      />,
    );
  });
  const button = tree!.root.find(
    item =>
      item.props.testID === 'chat-attachment-audio' &&
      typeof item.props.onPress === 'function',
  );
  expect(button.props.accessibilityLabel).toBe('播放语音，3 秒');
  act(() => button.props.onPress());
  const [playId] = play.mock.calls[0];
  expect(play).toHaveBeenCalledWith(playId, attachment, 'owner');
  expect(button.props.accessibilityLabel).toBe('取消加载语音');
  act(() => button.props.onPress());
  expect(stop).toHaveBeenCalledWith(playId);
  await act(async () => finishPlayback());
  expect(button.props.accessibilityLabel).toBe('播放语音，3 秒');
});

test('left release locks the recording and a separate stop creates an unsent draft', async () => {
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness />);
  });
  const hold = tree!.root.findByProps({ testID: 'chat-voice-hold' });
  await act(async () => hold.props.onResponderGrant(touch(400, 200)));
  act(() => hold.props.onResponderMove(touch(394, 125)));
  expect(hold.props.accessibilityLabel).toBe('松开锁定');
  await act(async () => hold.props.onResponderRelease(touch(394, 125)));
  expect(controls.mode).toBe('locked');
  expect(controls.status).toBe('recording');
  expect(audio.finishVoiceRecording).not.toHaveBeenCalled();
  await act(async () =>
    tree!.root.findByProps({ accessibilityLabel: '结束录音' }).props.onPress(),
  );
  expect(controls.status).toBe('ready');
  expect(api.uploadChatAudio).not.toHaveBeenCalled();
});

test('preview plays the owned recording and discard stops it without uploading', async () => {
  let finishPreview!: () => void;
  const preview = jest.spyOn(audio, 'playVoiceRecording').mockReturnValue(
    new Promise(resolve => {
      finishPreview = resolve;
    }),
  );
  const stop = jest
    .spyOn(audio, 'stopVoicePlayback')
    .mockImplementation(() => undefined);
  await act(async () => {
    tree = ReactTestRenderer.create(<Harness />);
  });
  await act(async () => controls.start('accessible', submit));
  await act(async () => controls.finish());
  const id = controls.recordingId;
  await act(async () =>
    tree!.root.findByProps({ testID: 'chat-voice-preview' }).props.onPress(),
  );
  const [playbackId] = preview.mock.calls[0];
  expect(preview).toHaveBeenCalledWith(playbackId, id);
  expect(api.uploadChatAudio).not.toHaveBeenCalled();
  await act(async () =>
    tree!.root.findByProps({ accessibilityLabel: '丢弃录音' }).props.onPress(),
  );
  expect(stop).toHaveBeenCalledWith(playbackId);
  expect(audio.releaseVoiceRecording).toHaveBeenCalledWith(id);
  await act(async () => finishPreview());
  expect(controls.status).toBe('idle');
  expect(submit).not.toHaveBeenCalled();
});
