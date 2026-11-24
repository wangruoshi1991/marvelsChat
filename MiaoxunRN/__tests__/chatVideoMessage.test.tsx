import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import Video from 'react-native-video';
import { ChatVideoMessage } from '../src/features/messages/ChatVideoMessage';
import type { ChatAttachmentDTO } from '../src/models/api';
import * as api from '../src/services/api/chatAttachmentApi';
import { palettes } from '../src/shared/theme';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});

const attachment: ChatAttachmentDTO = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'video',
  filename: 'video.mp4',
  title: 'Video',
  mimeType: 'video/mp4',
  byteSize: 1000,
  durationMs: 4500,
  downloadPath:
    '/api/chat-attachments/00000000-0000-4000-8000-000000000001/content',
  data: {},
};
let tree: Renderer.ReactTestRenderer;
const render = (source = attachment, token = 'synthetic-owner') => (
  <ChatVideoMessage
    attachment={source}
    token={token}
    palette={palettes.light}
    language="zh"
  />
);
const button = (testID: string) =>
  tree.root
    .findAllByProps({ testID })
    .find(node => typeof node.props.onPress === 'function')!;
const player = () => tree.root.findByType(Video);

beforeEach(() => {
  jest
    .spyOn(api, 'downloadChatVideo')
    .mockResolvedValue('file:///synthetic/video.mp4');
  jest.spyOn(api, 'releaseChatVideo').mockImplementation(() => undefined);
  act(() => {
    tree = Renderer.create(render());
  });
});
afterEach(() => {
  act(() => tree.unmount());
  jest.restoreAllMocks();
});

test('a refreshed attachment object with the same ID keeps the pending download and its eventual result', async () => {
  let resolve!: (uri: string) => void;
  jest.mocked(api.downloadChatVideo).mockImplementationOnce(
    () =>
      new Promise(done => {
        resolve = done;
      }),
  );
  act(() => button('chat-video-attachment').props.onPress());
  const key = jest.mocked(api.downloadChatVideo).mock.calls[0][2];
  act(() =>
    tree.update(
      render({ ...attachment, filename: 'refreshed-name.mp4', data: {} }),
    ),
  );
  expect(api.downloadChatVideo).toHaveBeenCalledTimes(1);
  expect(api.releaseChatVideo).not.toHaveBeenCalled();
  await act(async () => resolve('file:///synthetic/original-download.mp4'));
  expect(player().props.source.uri).toBe(
    'file:///synthetic/original-download.mp4',
  );
  act(() => button('close-chat-video').props.onPress());
  expect(api.releaseChatVideo).toHaveBeenCalledTimes(1);
  expect(api.releaseChatVideo).toHaveBeenCalledWith(key);
});

test('a same-ID refresh preserves the mounted player and file, while a new token reloads under a new owner', async () => {
  await act(async () => button('chat-video-attachment').props.onPress());
  const firstPlayer = player();
  const firstKey = jest.mocked(api.downloadChatVideo).mock.calls[0][2];
  await act(async () => tree.update(render({ ...attachment, data: {} })));
  expect(player()).toBe(firstPlayer);
  expect(player().props.source.uri).toBe('file:///synthetic/video.mp4');
  expect(api.downloadChatVideo).toHaveBeenCalledTimes(1);
  expect(api.releaseChatVideo).not.toHaveBeenCalled();

  await act(async () =>
    tree.update(render({ ...attachment, data: {} }, 'next-synthetic-owner')),
  );
  expect(api.releaseChatVideo).toHaveBeenCalledWith(firstKey);
  expect(api.downloadChatVideo).toHaveBeenCalledTimes(2);
  const nextCall = jest.mocked(api.downloadChatVideo).mock.calls[1];
  expect(nextCall[0]).toBe(attachment.id);
  expect(nextCall[1]).toBe('next-synthetic-owner');
  expect(nextCall[2]).not.toBe(firstKey);
});
