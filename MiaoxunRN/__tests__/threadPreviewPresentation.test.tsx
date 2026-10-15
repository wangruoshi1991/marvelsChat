import React from 'react';
import { Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ThreadListScreen } from '../src/features/messages/ThreadListScreen';
import { ChatMessage, ChatThread } from '../src/features/session/sessionTypes';
import { palettes } from '../src/shared/theme';

jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => ({ isActive: false }),
}));

const content = JSON.stringify({
  title: '周末',
  summary: '一起出发',
  frames: [
    {
      title: '车站',
      scene: '晨光',
      caption: '天亮了',
      dialogue: '走吧',
      mood: 'hopeful',
      camera: 'wide',
      mediaAssetIds: ['private-media-id'],
    },
  ],
});
const reply: ChatMessage = {
  id: 'reply',
  threadId: 'comic-thread',
  senderType: 'agent',
  senderName: '漫画助手',
  content,
  metadata: { provider: 'new-api' },
};

test.each([
  ['recognized model draft', reply, content, true],
  ['user JSON', { ...reply, senderType: 'user' }, content, false],
  ['unmarked reply', { ...reply, metadata: {} }, content, true],
  [
    'unknown schema',
    { ...reply, content: '{"frames":[]}' },
    '{"frames":[]}',
    false,
  ],
  ['newer unmatched preview', reply, '新的消息', false],
  [
    'agent prose',
    { ...reply, content: '**三步路线图**\n\n1. 准备素材\n2. 确认页面' },
    '**三步路线图**\n\n1. 准备素材\n2. 确认页面',
    false,
    '三步路线图 1. 准备素材 2. 确认页面',
  ],
  [
    'user prose',
    { ...reply, senderType: 'user', content: '**我的原文**' },
    '**我的原文**',
    false,
    '**我的原文**',
  ],
  [
    'unknown JSON containing markup',
    { ...reply, content: '{"unknown":"**保留原文**"}' },
    '{"unknown":"**保留原文**"}',
    false,
    '{"unknown":"**保留原文**"}',
  ],
  [
    'newer unmatched markup',
    reply,
    '**尚未同步来源的内容**',
    false,
    '**尚未同步来源的内容**',
  ],
])(
  'thread preview presents %s without changing stored messages',
  (_name, message, lastContent, formatted, expectedPreview = lastContent) => {
    const thread: ChatThread = {
      id: 'comic-thread',
      title: '漫画日记',
      avatarText: '漫',
      agentId: 'comic-diary',
      kind: 'agent',
      pinned: false,
      unreadCount: 0,
      lastContent: lastContent as string,
      messages: [message as ChatMessage],
    };
    const before = JSON.stringify(thread);
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <ThreadListScreen
          palette={palettes.light}
          language="zh"
          threads={[thread]}
          agents={[]}
          notices={[]}
          unreadNoticeCount={0}
          selectedMessageTab="chat"
          renderUserAvatar={() => null}
          onOpenThread={jest.fn()}
          onOpenMessageActions={jest.fn()}
          onOpenSearch={jest.fn()}
          onSelectMessageTab={jest.fn()}
          onMarkNotificationRead={jest.fn(async () => undefined)}
          onAcceptFriendRequest={jest.fn(async () => undefined)}
          onRejectFriendRequest={jest.fn(async () => undefined)}
        />,
      );
    });
    const displayed = renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .flat(Infinity)
      .join(' ');
    if (formatted) {
      expect(displayed).toContain('分镜草稿');
      expect(displayed).toContain('一起出发');
      expect(displayed).not.toMatch(/mediaAssetIds|private-media-id|"frames"/);
    } else {
      expect(displayed).toContain(expectedPreview);
    }
    expect(JSON.stringify(thread)).toBe(before);
    act(() => renderer.unmount());
  },
);
