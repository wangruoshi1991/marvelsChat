import React from 'react';
import { Image } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatMessageAttachments } from '../src/features/messages/ChatMessageAttachments';
import type { ChatAttachmentDTO } from '../src/models/api';
import { palettes } from '../src/shared/theme';

jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaProvider: View, SafeAreaView: View };
});

const image = (suffix: string): ChatAttachmentDTO => {
  const id = `123e4567-e89b-12d3-a456-42661417400${suffix}`;
  return {
    id,
    kind: 'image',
    filename: `photo-${suffix}.jpg`,
    title: 'Synthetic',
    mimeType: 'image/jpeg',
    byteSize: 12,
    durationMs: null,
    downloadPath: `/api/chat-attachments/${id}/content`,
    data: {},
  };
};
let tree: TestRenderer.ReactTestRenderer;
afterEach(() => act(() => tree?.unmount()));
const mount = (attachments: ChatAttachmentDTO[]) => {
  act(() => {
    tree = TestRenderer.create(
      <ChatMessageAttachments
        attachments={attachments}
        token="synthetic-token"
        palette={palettes.light}
        language="en"
        onActionMessage={jest.fn()}
      />,
    );
  });
};

test('tapping a failed thumbnail retries it without leaving the conversation', () => {
  mount([image('1')]);
  act(() =>
    tree.root
      .findByProps({ testID: 'chat-attachment-image-content' })
      .props.onError(),
  );
  expect(
    tree.root
      .findAllByType(Image)
      .filter(item => item.props.testID === 'chat-attachment-image-content'),
  ).toHaveLength(0);
  act(() =>
    tree.root.findByProps({ testID: 'chat-attachment-image' }).props.onPress(),
  );
  expect(
    tree.root
      .findAllByType(Image)
      .filter(item => item.props.testID === 'chat-attachment-image-content'),
  ).toHaveLength(1);
  act(() =>
    tree.root
      .findByProps({ testID: 'chat-attachment-viewer-close' })
      .props.onPress(),
  );
  expect(
    tree.root
      .findAllByType(Image)
      .filter(item => item.props.testID === 'chat-attachment-image-content'),
  ).toHaveLength(1);
});

test('retrying one failed thumbnail preserves the other image failure', () => {
  mount([image('1'), image('2')]);
  const contents = tree.root
    .findAllByType(Image)
    .filter(item => item.props.testID === 'chat-attachment-image-content');
  act(() => contents.forEach(content => content.props.onError()));
  expect(
    tree.root
      .findAllByType(Image)
      .filter(item => item.props.testID === 'chat-attachment-image-content'),
  ).toHaveLength(0);
  act(() =>
    tree.root
      .findAllByProps({ testID: 'chat-attachment-image' })[0]
      .props.onPress(),
  );
  const retried = tree.root
    .findAllByType(Image)
    .filter(item => item.props.testID === 'chat-attachment-image-content');
  expect(retried).toHaveLength(1);
  expect(retried[0].props.source.uri).toContain(image('1').id);
  expect(
    tree.root.findByProps({
      testID: 'chat-attachment-image',
      accessibilityLabel: 'Retry image photo-2.jpg',
    }).props.accessibilityLabel,
  ).toBe('Retry image photo-2.jpg');
});

test('a new session clears old image errors and ignores its late failure callback', () => {
  const attachment = image('1');
  mount([attachment]);
  const oldFailure = tree.root.findByProps({
    testID: 'chat-attachment-image-content',
  }).props.onError;
  act(() => oldFailure());
  expect(
    tree.root
      .findAllByType(Image)
      .filter(item => item.props.testID === 'chat-attachment-image-content'),
  ).toHaveLength(0);
  act(() =>
    tree.update(
      <ChatMessageAttachments
        attachments={[attachment]}
        token="next-synthetic-token"
        palette={palettes.light}
        language="en"
        onActionMessage={jest.fn()}
      />,
    ),
  );
  expect(
    tree.root
      .findAllByType(Image)
      .filter(item => item.props.testID === 'chat-attachment-image-content'),
  ).toHaveLength(1);
  act(() => oldFailure());
  expect(
    tree.root
      .findAllByType(Image)
      .filter(item => item.props.testID === 'chat-attachment-image-content'),
  ).toHaveLength(1);
  act(() =>
    tree.root
      .findByProps({ testID: 'chat-attachment-image-content' })
      .props.onError(),
  );
  expect(
    tree.root
      .findAllByType(Image)
      .filter(item => item.props.testID === 'chat-attachment-image-content'),
  ).toHaveLength(0);
});
