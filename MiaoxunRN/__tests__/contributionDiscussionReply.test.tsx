import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, AppStateStatus, Share, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { ChatMessageItem } from '../src/features/messages/ChatMessageItem';
import { messageApi } from '../src/services/api/messageApi';
import { palettes } from '../src/shared/theme';
import { WorkspaceButton } from '../src/shared/workspaceUi';
import { ChatMessage, ChatThread } from '../src/features/session/sessionTypes';
import { AIAssistGestureSurface } from '../src/features/assist/AIAssistGestureSurface';

jest.mock('../src/services/api/messageApi', () => ({
  messageApi: { contributionDiscussion: jest.fn() },
}));
const mockAssist = {
  isActive: false,
  dismiss: jest.fn(),
  askButler: jest.fn(),
};
jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => mockAssist,
}));
const api = jest.mocked(messageApi);
const context = {
  id: '45267cd7-549c-4f8f-8576-49d061cc335a',
  revision: 3,
  currentRound: 1,
  nodeId: '12a41286-e950-42a7-b482-1d1c56414e89',
  goal: '虚构修伞故事',
};
const item: ChatMessage = {
  id: 'reply',
  threadId: 'thread',
  senderType: 'agent',
  senderName: '漫画Agent',
  content: '协作贡献讨论，请打开查看。',
  metadata: {
    workspaceContext: context,
    contributionDiscussion: { state: 'available' },
  },
};
const thread = {
  id: 'thread',
  agentId: 'comic-diary',
  title: '漫画',
  messages: [item],
} as ChatThread;
const props = {
  token: 'owner',
  item,
  previousMessage: null,
  palette: palettes.light,
  language: 'zh' as const,
  currentUserId: 'user',
  currentUserName: '测试',
  thread,
  agents: [],
  isDarkPalette: false,
  renderUserAvatar: () => <View />,
  onOpenMessageMenu: jest.fn(),
  onRetrySend: jest.fn(),
  onActionMessage: jest.fn(),
};
let tree: TestRenderer.ReactTestRenderer;
let listeners: ((state: AppStateStatus) => void)[];
const content = () =>
  tree.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
beforeEach(() => {
  jest.clearAllMocks();
  api.contributionDiscussion.mockReset();
  listeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, fn) => {
    listeners.push(fn);
    return {
      remove: () => {
        listeners = listeners.filter(value => value !== fn);
      },
    };
  });
  api.contributionDiscussion.mockResolvedValue({
    content: '真实模型针对该成果的解释。',
  });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  jest.restoreAllMocks();
});

test('a node discussion loads its protected body without replacing the ordinary message or copy payload', async () => {
  await act(async () => {
    tree = TestRenderer.create(<ChatMessageItem {...props} />);
  });
  expect(api.contributionDiscussion).toHaveBeenCalledWith(
    'thread',
    'reply',
    'owner',
  );
  expect(content()).toContain('真实模型针对该成果的解释');
  expect(item.content).toBe('协作贡献讨论，请打开查看。');
});

test('protected discussion exposes its authenticated text and reload as accessibility children while share/copy/assist retain the safe placeholder', async () => {
  const share = jest
    .spyOn(Share, 'share')
    .mockResolvedValue({ action: Share.sharedAction });
  await act(async () => {
    tree = TestRenderer.create(<ChatMessageItem {...props} />);
  });
  const surface = tree.root.findByType(AIAssistGestureSurface);
  const nativeSurface = surface
    .findAllByProps({ testID: 'chat-message-assist-reply' })
    .at(-1)!;
  expect(nativeSurface.props.accessible).toBe(false);
  expect(
    surface
      .findAllByType(Text)
      .some(node =>
        String(node.props.children).includes('真实模型针对该成果的解释'),
      ),
  ).toBe(true);
  const reload = surface
    .findAllByType(WorkspaceButton)
    .find(node => node.props.label === '重新读取讨论')!;
  expect(
    reload.findAllByProps({
      accessibilityRole: 'button',
      accessibilityLabel: '重新读取讨论',
    }).length,
  ).toBeGreaterThan(0);
  expect(surface.props.object.metadata.content).toBe(item.content);
  await act(async () => {
    surface.props.actions
      .find((action: { direction: string }) => action.direction === 'down')
      .onSelect(surface.props.object);
  });
  expect(Clipboard.setString).toHaveBeenCalledWith(item.content);
  await act(async () => {
    surface.props.actions
      .find((action: { direction: string }) => action.direction === 'up')
      .onSelect(surface.props.object);
  });
  expect(share).toHaveBeenCalledWith({ message: item.content });
  await act(async () => {
    surface.props.actions
      .find((action: { direction: string }) => action.direction === 'right')
      .onSelect(surface.props.object);
  });
  expect(mockAssist.askButler).toHaveBeenCalledWith(
    expect.objectContaining({
      metadata: expect.objectContaining({ content: item.content }),
    }),
  );
  const ordinary = {
    ...item,
    id: 'ordinary',
    metadata: undefined,
    content: '普通会话消息',
  };
  await act(async () => {
    tree.update(<ChatMessageItem {...props} item={ordinary} />);
  });
  expect(
    tree.root.findAllByProps({ testID: 'chat-message-assist-ordinary' }).at(-1)!
      .props.accessible,
  ).toBe(true);
});

test('background removes the private body and foreground rechecks source access', async () => {
  await act(async () => {
    tree = TestRenderer.create(<ChatMessageItem {...props} />);
  });
  await act(async () => {
    listeners.slice().forEach(fn => fn('background'));
  });
  expect(content()).not.toContain('真实模型');
  api.contributionDiscussion.mockRejectedValueOnce(new Error('来源授权已撤回'));
  await act(async () => {
    listeners.slice().forEach(fn => fn('active'));
  });
  expect(content()).toContain('来源授权已撤回');
  expect(content()).not.toContain('真实模型');
  expect(
    tree.root.findAllByType(WorkspaceButton).map(node => node.props.label),
  ).toContain('重新读取讨论');
});

test('a delayed reply from the old account cannot enter the new account chat', async () => {
  let resolve!: (value: { content: string }) => void;
  api.contributionDiscussion.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    tree = TestRenderer.create(<ChatMessageItem {...props} />);
  });
  api.contributionDiscussion.mockResolvedValueOnce({
    content: '新账号的获准正文',
  });
  await act(async () => {
    tree.update(
      <ChatMessageItem {...props} token="other" currentUserId="other-user" />,
    );
  });
  await act(async () => {
    resolve({ content: '旧账号私有正文' });
  });
  expect(content()).toContain('新账号的获准正文');
  expect(content()).not.toContain('旧账号私有正文');
});

test('even a batched background-to-foreground cycle invalidates the earlier private fetch and rechecks access', async () => {
  let resolve!: (value: { content: string }) => void;
  api.contributionDiscussion.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    tree = TestRenderer.create(<ChatMessageItem {...props} />);
  });
  api.contributionDiscussion.mockRejectedValueOnce(
    new Error('恢复前台时授权已撤回'),
  );
  await act(async () => {
    listeners.slice().forEach(fn => fn('background'));
    listeners.slice().forEach(fn => fn('active'));
  });
  await act(async () => {
    resolve({ content: '后台前请求返回的私有正文' });
  });
  expect(api.contributionDiscussion).toHaveBeenCalledTimes(2);
  expect(content()).not.toContain('后台前请求返回');
  expect(content()).toContain('恢复前台时授权已撤回');
});

test('a foreground reader rechecks access and removes content after a source is revoked', async () => {
  jest.useFakeTimers();
  try {
    await act(async () => {
      tree = TestRenderer.create(<ChatMessageItem {...props} />);
    });
    expect(content()).toContain('真实模型');
    api.contributionDiscussion.mockRejectedValueOnce(new Error('原文件已删除'));
    await act(async () => {
      jest.advanceTimersByTime(15000);
    });
    expect(content()).not.toContain('真实模型');
    expect(content()).toContain('原文件已删除');
  } finally {
    jest.useRealTimers();
  }
});
