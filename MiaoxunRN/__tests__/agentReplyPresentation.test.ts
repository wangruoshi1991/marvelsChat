import { agentReplyPresentation } from '../src/features/messages/agentReplyPresentation';
import { ChatMessage } from '../src/features/session/sessionTypes';
import React from 'react';
import { Share, Text, View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import Clipboard from '@react-native-clipboard/clipboard';
import { ChatMessageItem } from '../src/features/messages/ChatMessageItem';
import { AIAssistProvider } from '../src/features/assist/AIAssistProvider';
import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';
import { palettes } from '../src/shared/theme';
import { ChatScreen } from '../src/features/messages/MessagesScreen';
import { ChatComposer } from '../src/features/messages/ChatComposer';

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/features/ai/useAITasks', () => ({
  useAITasks: () => ({
    tasks: [],
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));

let renderer: TestRenderer.ReactTestRenderer | undefined;
beforeEach(() => jest.useFakeTimers());
afterEach(async () => {
  await act(async () => renderer?.unmount());
  renderer = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const comic = {
  title: '周末',
  summary: '一次轻松的旅行',
  frames: [
    {
      title: '出发',
      scene: '晨光中的车站',
      caption: '天刚亮，我们出发了。',
      dialogue: '走吧！',
      mood: 'hopeful',
      camera: 'wide',
      mediaAssetIds: ['private-media-id'],
    },
  ],
};
const message = (value: unknown): ChatMessage => ({
  id: 'reply',
  threadId: 'thread',
  senderType: 'agent',
  senderName: '助手',
  content: JSON.stringify(value),
  metadata: {},
});

test('recognized legacy comic drafts show story content while keeping the stored message intact', () => {
  const original = message(comic);
  const before = JSON.stringify(original);
  const displayed = agentReplyPresentation(original, 'comic-diary', 'zh');
  expect(displayed).toContain('分镜草稿');
  for (const value of [
    '周末',
    '一次轻松的旅行',
    '出发',
    '晨光中的车站',
    '天刚亮，我们出发了。',
    '走吧！',
  ])
    expect(displayed).toContain(value);
  expect(displayed).not.toMatch(
    /mediaAssetIds|private-media-id|hopeful|wide|"frames"/,
  );
  expect(JSON.stringify(original)).toBe(before);
});

test('recognized legacy page drafts show readable sections without resource IDs or machine configuration', () => {
  const original = message({
    language: 'zh',
    theme: 'gallery',
    title: '旅行页',
    summary: '我的旅行',
    sections: [
      {
        type: 'hero',
        title: '海边',
        subtitle: '秋天',
        body: '海风与阳光',
        assetIds: ['asset-id'],
        diaryEntryIds: [],
        actions: [],
      },
    ],
  });
  const displayed = agentReplyPresentation(original, 'site-builder', 'zh');
  expect(displayed).toContain('海风与阳光');
  expect(displayed).toContain('不能在这里保存或发布');
  expect(displayed).not.toMatch(/asset-id|assetIds|hero|gallery/);
});

test('user JSON, unrelated agents and unknown reply structures are never rewritten', () => {
  const original = message(comic);
  for (const [value, agentId] of [
    [{ ...original, senderType: 'user' }, 'comic-diary'],
    [original, 'miaoxun-butler'],
    [message({ ...comic, frames: [{ title: 'incomplete' }] }), 'comic-diary'],
    [{ ...original, content: '{invalid-json' }, 'comic-diary'],
  ] as Array<[ChatMessage, string]>)
    expect(agentReplyPresentation(value, agentId, 'zh')).toBe(value.content);
});

test('recognized legacy drafts omit extra runtime fields without depending on a provider label', () => {
  const original = message({
    ...comic,
    providerTrace: 'private-provider-trace',
    frames: comic.frames.map(frame => ({
      ...frame,
      retrievalRunId: 'private-retrieval-run',
    })),
  });
  const displayed = agentReplyPresentation(original, 'comic-diary', 'zh');
  expect(displayed).toContain('晨光中的车站');
  expect(displayed).not.toMatch(
    /private-provider-trace|private-retrieval-run|mediaAssetIds/,
  );
});

test.each([
  'recognized',
  'user-json',
  'unknown-json',
  'dispatch-reply',
  'dispatch-clarify',
  'dispatch-workspace',
])(
  'rendered %s content matches accessibility, copying, sharing and selected assistance without changing storage',
  async kind => {
    const item = kind.startsWith('dispatch-')
      ? {
          ...message(comic),
          metadata: {
            agentDispatch: {
              version: 1 as const,
              kind: kind.slice(9) as 'reply' | 'clarify' | 'workspace',
            },
          },
        }
      : kind === 'user-json'
      ? { ...message(comic), senderType: 'user' }
      : kind === 'unknown-json'
      ? message({
          unknown: 'User-facing JSON',
          mediaAssetIds: ['must-remain'],
        })
      : message(comic);
    const stored = JSON.stringify(item);
    const expected =
      kind === 'recognized'
        ? agentReplyPresentation(item, 'comic-diary', 'zh')
        : item.content;
    const clipboard = jest
      .spyOn(Clipboard, 'setString')
      .mockImplementation(() => undefined);
    const share = jest
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: Share.sharedAction });
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation(callback => callback(0, 0, 300, 180));
    const ask = jest.fn();
    const menu = jest.fn();
    try {
      await act(async () => {
        renderer = TestRenderer.create(
          React.createElement(AIAssistProvider, {
            routeKey: 'message-presentation',
            onAskButler: ask,
            children: React.createElement(ChatMessageItem, {
              item,
              previousMessage: null,
              palette: palettes.light,
              language: 'zh',
              currentUserId: 'owner',
              currentUserName: 'Owner',
              thread: {
                id: 'thread',
                agentId: 'comic-diary',
                title: '漫画日记',
                avatarText: '漫',
                kind: 'agent',
                pinned: false,
                unreadCount: 0,
                lastContent: '',
                messages: [item],
              },
              agents: [],
              isDarkPalette: false,
              renderUserAvatar: () => null,
              onOpenMessageMenu: menu,
              onRetrySend: jest.fn(),
              onActionMessage: jest.fn(),
            }),
          }),
        );
      });
      expect(
        renderer!.root.findByProps({ testID: 'chat-message-content-reply' })
          .props.children,
      ).toBe(expected);
      const labels = renderer!.root
        .findAll(node => typeof node.props.accessibilityLabel === 'string')
        .map(node => node.props.accessibilityLabel);
      expect(labels).toContain(expected);
      if (kind === 'recognized')
        expect(labels.filter(Boolean).join(' ')).not.toMatch(
          /mediaAssetIds|private-media-id|"frames"/,
        );
      const surface = renderer!.root.findByType(AIAssistGestureSurface);
      expect(surface.props.object.metadata.content).toBe(expected);
      for (const direction of ['down', 'up', 'right', 'left']) {
        await act(async () =>
          surface.props.actions
            .find(
              (action: { direction: string }) => action.direction === direction,
            )
            .onSelect(surface.props.object),
        );
      }
      expect(clipboard).toHaveBeenCalledWith(expected);
      expect(share).toHaveBeenCalledWith({ message: expected });
      expect(ask).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ content: expected }),
        }),
      );
      expect(menu).toHaveBeenCalledWith(
        expect.objectContaining({ id: item.id, content: expected }),
        expect.any(Boolean),
        expect.any(Object),
        expect.any(Object),
      );
      expect(JSON.stringify(item)).toBe(stored);
    } finally {
      if (renderer) await act(async () => renderer!.unmount());
      renderer = undefined;
      jest.restoreAllMocks();
    }
  },
);

test('restoring a quoted legacy result after authorization keeps its readable preview and original reply identity', async () => {
  const item = message(comic);
  const quoted: ChatMessage = {
    ...item,
    id: 'quoted',
    senderType: 'user',
    content: '请调整这段',
    metadata: {
      replyTo: {
        messageId: item.id,
        senderName: item.senderName,
        content: item.content,
      },
    },
  };
  const original = JSON.stringify(item);
  await act(async () => {
    renderer = TestRenderer.create(
      React.createElement(AIAssistProvider, {
        routeKey: 'restored-reply',
        onAskButler: jest.fn(),
        children: React.createElement(ChatScreen, {
          palette: palettes.light,
          language: 'zh',
          currentUserId: 'owner',
          currentUserName: 'Owner',
          thread: {
            id: 'thread',
            agentId: 'comic-diary',
            title: '漫画日记',
            avatarText: '漫',
            kind: 'agent',
            pinned: false,
            unreadCount: 0,
            lastContent: '',
            messages: [item, quoted],
          },
          agents: [],
          renderUserAvatar: () => null,
          onBack: jest.fn(),
          onSend: jest.fn(),
          onDeleteMessage: jest.fn(),
          onRecallMessage: jest.fn(),
          onSetMuted: jest.fn().mockResolvedValue(undefined),
          onActionError: jest.fn(),
          initialDraft: '这段需要调整',
          initialReplyToMessageId: item.id,
        }),
      }),
    );
  });
  expect(renderer!.root.findByType(ChatComposer).props.replyTarget).toEqual({
    ...item,
    content: agentReplyPresentation(item, 'comic-diary', 'zh'),
  });
  expect(JSON.stringify(item)).toBe(original);
  const renderedText = renderer!.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
  expect(renderedText).toContain('晨光中的车站');
  expect(renderedText).not.toMatch(/mediaAssetIds|private-media-id|"frames"/);
  expect(quoted.metadata?.replyTo).toEqual({
    messageId: item.id,
    senderName: item.senderName,
    content: item.content,
  });
});
