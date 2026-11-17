import React from 'react';
import { View } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { ChatAttachmentDTO } from '../src/models/api';
import { ChatComposer } from '../src/features/messages/ChatComposer';
import { palettes } from '../src/shared/theme';
import { useChatAttachments } from '../src/features/messages/useChatAttachments';
import { ChatScreen } from '../src/features/messages/MessagesScreen';
import type { ChatThread } from '../src/features/session/sessionTypes';
import { ThreadSettingsSheet } from '../src/features/messages/ThreadSettingsSheet';
import * as stationMediaPicker from '../src/services/stationMediaPicker';

jest.mock('../src/services/api/chatAttachmentApi', () => ({
  uploadChatImage: jest.fn(),
  uploadChatFile: jest.fn(),
}));
jest.mock('../src/services/stationFilePicker', () => ({
  pickStationFile: jest.fn(),
  releaseStationFile: jest.fn(async () => undefined),
}));
jest.mock('../src/services/api/customStickerApi', () => ({
  customStickerApi: { list: jest.fn(async () => []) },
}));
jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => ({ isActive: false }),
}));
jest.mock('../src/shared/useReduceMotion', () => ({
  useReduceMotion: () => true,
}));
jest.mock('react-native-safe-area-context', () => {
  const NativeView = require('react-native').View;
  return {
    SafeAreaProvider: NativeView,
    SafeAreaView: NativeView,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});

import {
  uploadChatFile,
  uploadChatImage,
} from '../src/services/api/chatAttachmentApi';
import {
  pickStationFile,
  releaseStationFile,
} from '../src/services/stationFilePicker';

const dto = (
  id: string,
  kind: 'image' | 'file' = 'image',
): ChatAttachmentDTO => ({
  id,
  kind,
  filename: `${id}.${kind === 'image' ? 'jpg' : 'txt'}`,
  title: id,
  mimeType: kind === 'image' ? 'image/jpeg' : 'text/plain',
  byteSize: 10,
  durationMs: null,
  downloadPath: `/api/chat-attachments/${id}/content`,
  data: {},
});

let latest: ReturnType<typeof useChatAttachments>;
function Harness({
  userId = 'user-1',
  threadId = 'thread-1',
  token = 'token-1',
}: {
  userId?: string;
  threadId?: string;
  token?: string;
}) {
  latest = useChatAttachments({ userId, threadId, token, enabled: true });
  return null;
}

async function mount(props = {}) {
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<Harness {...props} />);
  });
  return renderer;
}

describe('ordinary chat picker ownership', () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it.each([
    ['相册', 'thread'],
    ['拍摄', 'thread'],
    ['文件', 'thread'],
    ['相册', 'account'],
    ['拍摄', 'account'],
    ['文件', 'account'],
  ] as const)(
    'drops a late %s picker result after a %s change',
    async (tool, change) => {
      const image = {
        kind: 'image' as const,
        uri: 'file://old-scope.jpg',
        originalFilename: 'old-scope.jpg',
        mimeType: 'image/jpeg',
        byteSize: 10,
        width: 1,
        height: 1,
      };
      const file = {
        uri: 'file://old-scope.txt',
        originalFilename: 'old-scope.txt',
        mimeType: 'text/plain',
        byteSize: 10,
        idempotencyKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      };
      let finishPicker!: () => void;
      if (tool === '相册') {
        jest
          .spyOn(stationMediaPicker, 'pickStationImagesFromLibrary')
          .mockReturnValue(
            new Promise(resolve => {
              finishPicker = () => resolve([image]);
            }),
          );
      } else if (tool === '拍摄') {
        jest.spyOn(stationMediaPicker, 'takeStationPhoto').mockReturnValue(
          new Promise(resolve => {
            finishPicker = () => resolve(image);
          }),
        );
      } else {
        jest.mocked(pickStationFile).mockReturnValueOnce(
          new Promise(resolve => {
            finishPicker = () => resolve(file);
          }),
        );
      }
      const props = {
        token: 'account-a-token',
        currentUserId: 'account-a',
        currentUserName: 'A',
        palette: palettes.light,
        language: 'zh' as const,
        thread: {
          id: 'thread-a',
          title: 'A',
          kind: 'direct',
          avatarText: 'A',
          pinned: false,
          lastContent: '',
          unreadCount: 0,
          messages: [],
        } satisfies ChatThread,
        agents: [],
        renderUserAvatar: () => <View />,
        onBack: jest.fn(),
        onSend: jest.fn(),
        onDeleteMessage: jest.fn(),
        onRecallMessage: jest.fn(),
        onSetMuted: jest.fn(async () => undefined),
        onActionError: jest.fn(),
      };
      let renderer!: ReactTestRenderer;
      try {
        await act(async () => {
          renderer = create(<ChatScreen {...props} />);
        });
        act(() =>
          renderer.root.findByType(ChatComposer).props.onComposerTool(tool),
        );
        await act(async () => {
          renderer.update(
            <ChatScreen
              {...props}
              token={change === 'account' ? 'account-b-token' : props.token}
              currentUserId={
                change === 'account' ? 'account-b' : props.currentUserId
              }
              thread={{ ...props.thread, id: 'thread-b' }}
            />,
          );
        });
        await act(async () => finishPicker());
        expect(uploadChatImage).not.toHaveBeenCalled();
        expect(uploadChatFile).not.toHaveBeenCalled();
        expect(
          renderer.root.findByType(ChatComposer).props.attachments,
        ).toEqual([]);
        if (tool === '文件')
          expect(releaseStationFile).toHaveBeenCalledWith(file);
      } finally {
        await act(async () => renderer?.unmount());
      }
    },
  );

  it('discards and releases a pending file when the group becomes read only', async () => {
    const file = {
      uri: 'file://group-file.txt',
      originalFilename: 'group-file.txt',
      mimeType: 'text/plain',
      byteSize: 10,
      idempotencyKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    let finishPicker!: () => void;
    jest.mocked(pickStationFile).mockReturnValueOnce(
      new Promise(resolve => {
        finishPicker = () => resolve(file);
      }),
    );
    const props = {
      token: 'group-token',
      currentUserId: 'group-user',
      currentUserName: 'Group user',
      palette: palettes.light,
      language: 'zh' as const,
      thread: {
        id: 'group-thread',
        groupId: 'group-1',
        title: 'Group',
        kind: 'group',
        avatarText: 'G',
        pinned: false,
        lastContent: '',
        unreadCount: 0,
        messages: [],
      } satisfies ChatThread,
      agents: [],
      renderUserAvatar: () => <View />,
      onBack: jest.fn(),
      onSend: jest.fn(),
      onDeleteMessage: jest.fn(),
      onRecallMessage: jest.fn(),
      onSetMuted: jest.fn(async () => undefined),
      onGroupLeft: jest.fn(),
      onActionError: jest.fn(),
    };
    let renderer!: ReactTestRenderer;
    try {
      await act(async () => {
        renderer = create(<ChatScreen {...props} />);
      });
      act(() =>
        renderer.root.findByType(ChatComposer).props.onComposerTool('文件'),
      );
      await act(async () =>
        renderer.root.findByType(ThreadSettingsSheet).props.onGroupLeft(),
      );
      await act(async () => finishPicker());
      expect(uploadChatFile).not.toHaveBeenCalled();
      expect(releaseStationFile).toHaveBeenCalledWith(file);
      expect(renderer.root.findAllByType(ChatComposer)).toHaveLength(0);
    } finally {
      await act(async () => renderer?.unmount());
    }
  });
});

describe('chat attachment drafts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(uploadChatImage)
      .mockImplementation(async args => dto(args.idempotencyKey));
    jest
      .mocked(uploadChatFile)
      .mockImplementation(async args => dto(args.idempotencyKey, 'file'));
  });

  it.each([
    ['ready', undefined, false],
    ['uploading', '附件仍在上传，请稍候。', true],
    ['failed', '附件上传失败，请重试或移除。', true],
  ] as const)(
    'shows attachment-only Send for %s attachments with correct disabled state',
    (status, reason, disabled) => {
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <ChatComposer
            palette={palettes.light}
            language="zh"
            threadTitle="朋友"
            draft=""
            isSending={false}
            isRecognizingSpeech={false}
            replyTarget={null}
            attachments={[
              {
                clientKey: 'attachment-1',
                kind: 'file',
                filename: 'notes.txt',
                mimeType: 'text/plain',
                byteSize: 10,
                idempotencyKey: 'key-1',
                status,
              },
            ]}
            attachmentBlockReason={reason || ''}
            onChangeDraft={jest.fn()}
            onClearReplyTarget={jest.fn()}
            onFocusInput={jest.fn()}
            onSend={jest.fn()}
          />,
        );
      });
      const send = renderer.root.findByProps({
        accessibilityLabel: '发送消息',
      });
      expect(send.props.disabled).toBe(disabled);
      act(() => renderer.unmount());
    },
  );

  it('keeps More and attachment-only Send together, and only sends a ready attachment', () => {
    for (const status of ['ready', 'uploading', 'failed'] as const) {
      const onSend = jest.fn();
      let renderer!: ReactTestRenderer;
      act(() => {
        renderer = create(
          <ChatComposer
            palette={palettes.light}
            language="zh"
            threadTitle="朋友"
            draft=""
            isSending={false}
            isRecognizingSpeech={false}
            replyTarget={null}
            attachments={[
              {
                clientKey: 'attachment-1',
                kind: 'image',
                filename: 'photo.jpg',
                mimeType: 'image/jpeg',
                byteSize: 10,
                idempotencyKey: 'key-1',
                status,
              },
            ]}
            attachmentBlockReason={
              status === 'uploading'
                ? '附件仍在上传，请稍候。'
                : status === 'failed'
                ? '附件上传失败，请重试或移除。'
                : ''
            }
            onChangeDraft={jest.fn()}
            onClearReplyTarget={jest.fn()}
            onFocusInput={jest.fn()}
            onSend={onSend}
          />,
        );
      });
      expect(
        renderer.root.findByProps({ accessibilityLabel: '更多功能' }),
      ).toBeTruthy();
      const send = renderer.root.findByProps({
        accessibilityLabel: '发送消息',
      });
      expect(send.props.disabled).toBe(status !== 'ready');
      act(() => send.props.onPress());
      expect(onSend).toHaveBeenCalledTimes(status === 'ready' ? 1 : 0);
      act(() => renderer.unmount());
    }
  });

  it('removes only the submitted attachment snapshot after a later item is added', async () => {
    const renderer = await mount();
    await act(async () => {
      latest
        .addImages([
          {
            uri: 'file://first.jpg',
            originalFilename: 'first.jpg',
            mimeType: 'image/jpeg',
            byteSize: 10,
          },
        ])
        .catch(() => undefined);
    });
    const submittedKeys = latest.items.map(item => item.clientKey);
    await act(async () => {
      latest
        .addImages([
          {
            uri: 'file://second.jpg',
            originalFilename: 'second.jpg',
            mimeType: 'image/jpeg',
            byteSize: 10,
          },
        ])
        .catch(() => undefined);
    });
    const retainedId = latest.items[1].id;

    await act(async () => latest.removeMany(submittedKeys));
    expect(latest.items.map(item => item.id)).toEqual([retainedId]);
    await act(async () => renderer.unmount());
  });

  it('keeps no more than six selected images and asks the picker for remaining slots', async () => {
    const renderer = await mount();
    const picks = Array.from({ length: 7 }, (_, index) => ({
      uri: `file://${index}`,
      originalFilename: `${index}.jpg`,
      mimeType: 'image/jpeg',
      byteSize: 10,
    }));
    await act(async () => {
      await latest.addImages(picks);
    });
    expect(latest.items).toHaveLength(6);
    expect(latest.remainingSlots).toBe(0);
    await act(async () => {
      latest
        .addImages([
          {
            uri: 'file://7',
            originalFilename: '7.jpg',
            mimeType: 'image/jpeg',
            byteSize: 10,
          },
        ])
        .catch(() => undefined);
    });
    expect(uploadChatImage).toHaveBeenCalledTimes(6);
    await act(async () => renderer.unmount());
  });

  it('leaves drafts unchanged when the picker is cancelled and removes one item independently', async () => {
    const renderer = await mount();
    await act(async () => {
      await latest.addImages([]);
    });
    await act(async () => {
      latest.addImages([
        {
          uri: 'file://1',
          originalFilename: '1.jpg',
          mimeType: 'image/jpeg',
          byteSize: 10,
        },
        {
          uri: 'file://2',
          originalFilename: '2.jpg',
          mimeType: 'image/jpeg',
          byteSize: 10,
        },
      ]);
    });
    const [first, second] = latest.items;
    await act(async () => {
      await latest.remove(first.clientKey);
    });
    expect(latest.items.map(item => item.clientKey)).toEqual([
      second.clientKey,
    ]);
    await act(async () => renderer.unmount());
  });

  it('retains a failed file and retries with the same idempotency key', async () => {
    jest
      .mocked(uploadChatFile)
      .mockRejectedValueOnce(new Error('offline'))
      .mockImplementationOnce(async args => dto(args.idempotencyKey, 'file'));
    const renderer = await mount();
    const file = {
      uri: 'file://native',
      originalFilename: 'notes.txt',
      mimeType: 'text/plain',
      byteSize: 10,
      idempotencyKey: 'stable-key',
    };
    await act(async () => {
      await latest.addFile(file);
    });
    expect(latest.items[0].status).toBe('failed');
    expect(latest.canSend).toBe(false);
    await act(async () => {
      await latest.retry(latest.items[0].clientKey);
    });
    expect(uploadChatFile).toHaveBeenLastCalledWith(
      expect.objectContaining({
        idempotencyKey: 'stable-key',
        nativeKey: 'stable-key',
      }),
    );
    expect(latest.items[0].status).toBe('ready');
    await act(async () => renderer.unmount());
  });

  it('releases a file copy when its item is removed and surfaces cleanup errors', async () => {
    jest
      .mocked(releaseStationFile)
      .mockRejectedValueOnce(new Error('cleanup denied'));
    const renderer = await mount();
    await act(async () => {
      await latest.addFile({
        uri: 'file://native',
        originalFilename: 'notes.txt',
        mimeType: 'text/plain',
        byteSize: 10,
        idempotencyKey: 'file-key',
      });
    });
    await act(async () => {
      await latest.remove(latest.items[0].clientKey);
    });
    expect(releaseStationFile).toHaveBeenCalled();
    expect(latest.cleanupError).toMatch(/cleanup denied/);
    await act(async () => renderer.unmount());
  });

  it('keeps the native cleanup identity when release fails after upload', async () => {
    jest
      .mocked(releaseStationFile)
      .mockRejectedValueOnce(new Error('cleanup denied'));
    const renderer = await mount();
    await act(async () => {
      await latest.addFile({
        uri: 'file://native',
        originalFilename: 'notes.txt',
        mimeType: 'text/plain',
        byteSize: 10,
        idempotencyKey: 'cleanup-key',
      });
    });
    expect(latest.items[0].status).toBe('ready');
    expect(latest.items[0].nativeFile?.idempotencyKey).toBe('cleanup-key');
    await act(async () => {
      await latest.remove('cleanup-key');
    });
    expect(releaseStationFile).toHaveBeenCalledTimes(2);
    await act(async () => renderer.unmount());
  });

  it('drops late upload results when the thread scope changes', async () => {
    let resolveUpload!: (value: ChatAttachmentDTO) => void;
    jest.mocked(uploadChatImage).mockReturnValueOnce(
      new Promise(resolve => {
        resolveUpload = resolve;
      }),
    );
    const renderer = await mount();
    act(() => {
      latest.addImages([
        {
          uri: 'file://1',
          originalFilename: '1.jpg',
          mimeType: 'image/jpeg',
          byteSize: 10,
        },
      ]);
    });
    await act(async () => {
      renderer.update(<Harness threadId="thread-2" />);
    });
    await act(async () => {
      resolveUpload(dto('late-result'));
    });
    expect(latest.items).toHaveLength(0);
    await act(async () => renderer.unmount());
  });

  it('keeps drafts isolated between two mounted thread hooks', async () => {
    let first!: ReturnType<typeof useChatAttachments>;
    let second!: ReturnType<typeof useChatAttachments>;
    function Pair() {
      first = useChatAttachments({
        userId: 'user-1',
        threadId: 'thread-a',
        token: 'token-1',
        enabled: true,
      });
      second = useChatAttachments({
        userId: 'user-1',
        threadId: 'thread-b',
        token: 'token-1',
        enabled: true,
      });
      return null;
    }
    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Pair />);
    });
    await act(async () => {
      await first.addImages([
        {
          uri: 'file://a',
          originalFilename: 'a.jpg',
          mimeType: 'image/jpeg',
          byteSize: 10,
        },
      ]);
    });
    expect(first.items).toHaveLength(1);
    expect(second.items).toHaveLength(0);
    await act(async () => renderer.unmount());
  });
});
