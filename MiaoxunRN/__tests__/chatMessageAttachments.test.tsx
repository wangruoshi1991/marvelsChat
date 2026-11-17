import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';

import {
  ChatMessageAttachments,
  ChatMessageAttachmentsHandle,
} from '../src/features/messages/ChatMessageAttachments';
import { ChatMessageMenu } from '../src/features/messages/ChatMessageMenu';
import type { ChatAttachmentDTO } from '../src/models/api';
import type { Palette } from '../src/shared/theme';
import * as chatMedia from '../src/services/chatMediaLibrary';
import * as chatAttachmentApi from '../src/services/api/chatAttachmentApi';

const palette = {
  background: '#fff',
  surface: '#fff',
  soft: '#f4f4f4',
  border: '#ddd',
  text: '#111',
  secondaryText: '#666',
  mint: '#0a8',
  rose: '#c33',
  shadow: '#000',
} as unknown as Palette;

const image = (id: string): ChatAttachmentDTO => ({
  id,
  kind: 'image',
  filename: `${id}.jpg`,
  title: id,
  mimeType: 'image/jpeg',
  byteSize: 12,
  durationMs: null,
  downloadPath: `/api/chat-attachments/${id}/content`,
  data: {},
});

const file: ChatAttachmentDTO = {
  id: '123e4567-e89b-12d3-a456-426614174000',
  kind: 'file',
  filename: 'notes.txt',
  title: 'notes.txt',
  mimeType: 'text/plain',
  byteSize: 42,
  durationMs: null,
  downloadPath:
    '/api/chat-attachments/123e4567-e89b-12d3-a456-426614174000/content',
  data: {},
};

describe('chat message attachments', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest
      .spyOn(chatAttachmentApi, 'readChatAttachmentText')
      .mockResolvedValue('hello attachment');
  });

  it('renders a stable image grid for one through six private attachments', () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ChatMessageAttachments
          attachments={Array.from({ length: 6 }, (_, index) =>
            image(`123e4567-e89b-12d3-a456-42661417400${index}`),
          )}
          token="token"
          palette={palette}
          language="en"
          onActionMessage={jest.fn()}
        />,
      );
    });

    expect(
      tree.root.findAllByProps({ testID: 'chat-attachment-image-content' })
        .length,
    ).toBeGreaterThanOrEqual(6);
    expect(
      tree.root.findAllByProps({ accessibilityRole: 'button' }).length,
    ).toBeGreaterThanOrEqual(6);
  });

  it('opens a paged fullscreen viewer and reports image loading failures', async () => {
    const onActionMessage = jest.fn();
    const ref = React.createRef<ChatMessageAttachmentsHandle>();
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ChatMessageAttachments
          ref={ref}
          attachments={[
            image('123e4567-e89b-12d3-a456-426614174001'),
            image('123e4567-e89b-12d3-a456-426614174002'),
          ]}
          token="token"
          palette={palette}
          language="en"
          onActionMessage={onActionMessage}
        />,
      );
    });
    await act(async () => {
      ref.current?.openImageViewer(1);
    });
    expect(
      tree.root.findByProps({ testID: 'chat-attachment-viewer' }),
    ).toBeTruthy();
    expect(
      tree.root.findByProps({ testID: 'chat-attachment-viewer-page' }).props
        .accessibilityLabel,
    ).toBe('2/2');
    const imageNode = tree.root.findAllByProps({
      testID: 'chat-attachment-image-content',
    })[0];
    act(() => imageNode.props.onError());
    expect(onActionMessage).toHaveBeenCalled();
  });

  it('loads file text only when opened and exposes explicit error state', async () => {
    let tree!: TestRenderer.ReactTestRenderer;
    act(() => {
      tree = TestRenderer.create(
        <ChatMessageAttachments
          attachments={[file]}
          token="token"
          palette={palette}
          language="en"
          onActionMessage={jest.fn()}
        />,
      );
    });
    const open = tree.root.findByProps({ testID: 'chat-attachment-file' });
    await act(async () => open.props.onPress());
    expect(chatAttachmentApi.readChatAttachmentText).toHaveBeenCalledWith({
      attachment: file,
      token: 'token',
    });
    expect(
      tree.root.findByProps({ testID: 'chat-attachment-file-body' }).props
        .children,
    ).toBe('hello attachment');
  });

  it('does not expose attachment actions for recalled or deleted messages', () => {
    const onView = jest.fn();
    const base = {
      id: 'message-1',
      threadId: 'thread-1',
      senderType: 'user',
      senderName: 'Me',
      content: '',
      metadata: { attachments: [file] },
    } as any;
    for (const state of [{ recalledAt: 'now' }, { deletedAt: 'now' }]) {
      let tree!: TestRenderer.ReactTestRenderer;
      act(() => {
        tree = TestRenderer.create(
          <ChatMessageMenu
            palette={palette}
            language="en"
            selectedMessage={{ ...base, ...state }}
            position={{ x: 0, y: 0, isMine: true, arrowPlacement: 'top' }}
            arrowLeft={0}
            canRecall={false}
            onClose={jest.fn()}
            onReply={jest.fn()}
            onDeleteMessage={jest.fn()}
            onRecallMessage={jest.fn()}
            onActionMessage={jest.fn()}
            onViewAttachments={onView}
            onPreviewAttachment={jest.fn()}
            onSaveAttachment={jest.fn()}
          />,
        );
      });
      expect(
        tree.root.findAllByProps({ accessibilityLabel: 'View images' }),
      ).toHaveLength(0);
      expect(
        tree.root.findAllByProps({ accessibilityLabel: 'Preview file' }),
      ).toHaveLength(0);
      expect(
        tree.root.findAllByProps({ accessibilityLabel: 'Save image' }),
      ).toHaveLength(0);
    }
    expect(onView).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'] as const)(
    'keeps the current file preview when a closed file finishes with %s',
    async outcome => {
      let resolveFirst!: (value: string) => void;
      let rejectFirst!: (error: Error) => void;
      const firstRead = new Promise<string>((resolve, reject) => {
        resolveFirst = resolve;
        rejectFirst = reject;
      });
      jest
        .mocked(chatAttachmentApi.readChatAttachmentText)
        .mockReset()
        .mockReturnValueOnce(firstRead)
        .mockResolvedValueOnce('second file');
      const secondFile = {
        ...file,
        id: '123e4567-e89b-12d3-a456-426614174001',
        filename: 'second.txt',
        downloadPath:
          '/api/chat-attachments/123e4567-e89b-12d3-a456-426614174001/content',
      };
      let tree!: TestRenderer.ReactTestRenderer;
      act(() => {
        tree = TestRenderer.create(
          <ChatMessageAttachments
            attachments={[file, secondFile]}
            token="token"
            palette={palette}
            language="en"
            onActionMessage={jest.fn()}
          />,
        );
      });
      await act(async () =>
        tree.root
          .findAllByProps({ testID: 'chat-attachment-file' })[0]
          .props.onPress(),
      );
      act(() =>
        tree.root
          .findByProps({ accessibilityLabel: 'Close file preview' })
          .props.onPress(),
      );
      await act(async () =>
        tree.root
          .findAllByProps({ testID: 'chat-attachment-file' })
          .filter(node => typeof node.props.onPress === 'function')[1]
          .props.onPress(),
      );
      expect(
        tree.root.findByProps({ testID: 'chat-attachment-file-body' }).props
          .children,
      ).toBe('second file');
      await act(async () => {
        if (outcome === 'success') resolveFirst('first file');
        else rejectFirst(new Error('first file failed'));
      });
      expect(
        tree.root.findByProps({ testID: 'chat-attachment-file-body' }).props
          .children,
      ).toBe('second file');
      act(() => tree.unmount());
    },
  );

  it('discards an old account file read and clears its visible preview on account change', async () => {
    let resolveRead!: (value: string) => void;
    jest
      .mocked(chatAttachmentApi.readChatAttachmentText)
      .mockReset()
      .mockImplementation(
        () =>
          new Promise<string>(resolve => {
            resolveRead = resolve;
          }),
      );
    let tree!: TestRenderer.ReactTestRenderer;
    const render = (token: string) => (
      <ChatMessageAttachments
        attachments={[file]}
        token={token}
        palette={palette}
        language="en"
        onActionMessage={jest.fn()}
      />
    );
    act(() => {
      tree = TestRenderer.create(render('account-a'));
    });
    await act(async () =>
      tree.root.findByProps({ testID: 'chat-attachment-file' }).props.onPress(),
    );
    act(() => tree.update(render('account-b')));
    await act(async () => resolveRead('account-a private text'));
    expect(
      tree.root.findAllByProps({ testID: 'chat-attachment-file-body' }),
    ).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('consumes a save menu action once even when the viewer or parent rerenders', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174001';
    const save = jest
      .spyOn(chatMedia, 'saveChatImageToLibrary')
      .mockResolvedValue({ status: 'saved', attachmentId: id });
    const attachments = [image(id)];
    const action = { type: 'image' as const, save: true, attachmentId: id };
    const render = () => (
      <ChatMessageAttachments
        attachments={attachments}
        action={action}
        token="token"
        palette={palette}
        language="en"
        onActionMessage={jest.fn()}
      />
    );
    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(render());
    });
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => tree.update(render()));
    expect(save).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
