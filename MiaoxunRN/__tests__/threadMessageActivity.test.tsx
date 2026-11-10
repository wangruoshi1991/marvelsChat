import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useMessageActions } from '../src/features/session/useMessageActions';
import { ChatThread } from '../src/features/session/sessionTypes';
import { apiClient } from '../src/services/apiClient';
import {
  setAIContractSession,
  clearAIContractSession,
} from '../src/services/aiContract';
import { mergeThreadMessageActivity } from '../src/features/session/sessionMappers';

jest.mock('../src/services/apiClient', () => ({
  apiClient: { sendMessage: jest.fn(), messages: jest.fn() },
}));
const api = jest.mocked(apiClient);
let actions: ReturnType<typeof useMessageActions>;
let threads: ChatThread[];
let tree: TestRenderer.ReactTestRenderer;
const thread = (
  id: string,
  at: string,
  pinned = false,
  content = id,
): ChatThread => ({
  id,
  agentId: id === 'comic' ? 'comic-diary' : null,
  title: id,
  avatarText: id,
  kind: 'agent',
  pinned,
  lastContent: content,
  lastMessageAt: at,
  unreadCount: 0,
  messages: [],
});
const receipt = (at: string) => [
  {
    id: 'agent-reply',
    threadId: 'comic',
    senderType: 'agent',
    senderName: '漫画',
    content: '协作讨论已回复',
    createdAt: at,
  },
  {
    id: 'input',
    threadId: 'comic',
    senderType: 'user',
    senderName: '我',
    content: '解释这份成果',
    createdAt: '2026-11-06T08:40:00.000Z',
  },
];
function Harness({ initial }: { initial: ChatThread[] }) {
  const [current, setThreads] = useState(initial);
  threads = current;
  actions = useMessageActions({
    token: 'owner',
    threads: current,
    currentUserName: '我',
    makeButlerContext: jest.fn(),
    setThreads,
    setErrorMessage: jest.fn(),
  });
  return null;
}
beforeEach(() => {
  api.sendMessage.mockReset();
  api.messages.mockReset();
  setAIContractSession('owner', { aiTasks: 1, agentWorkspaces: 6 });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  clearAIContractSession();
});

test.each(['send', 'refresh'] as const)(
  '%s applies the newest server message activity and reorders beneath pinned threads',
  async kind => {
    const data = receipt('2026-11-06T08:45:32.410Z');
    api.sendMessage.mockResolvedValue({ messages: data });
    api.messages.mockResolvedValue(data);
    await act(async () => {
      tree = TestRenderer.create(
        <Harness
          initial={[
            thread('pinned', '2026-11-06T07:00:00.000Z', true),
            thread('other', '2026-11-06T08:44:00.000Z'),
            thread('comic', '2026-11-06T08:24:00.000Z'),
          ]}
        />,
      );
    });
    await act(async () => {
      if (kind === 'send') await actions.sendMessage('comic', '解释这份成果');
      else await actions.refreshThreadMessages('comic');
    });
    expect(threads.map(item => item.id)).toEqual(['pinned', 'comic', 'other']);
    expect(threads[1]).toMatchObject({
      lastMessageAt: '2026-11-06T08:45:32.410Z',
      lastContent: '协作讨论已回复',
    });
    expect(threads[1].messages.map(item => item.id)).toEqual([
      'input',
      'agent-reply',
    ]);
  },
);

test('missing or invalid server timestamps never invent a newer activity time', () => {
  const current = thread(
    'comic',
    '2026-11-06T08:50:00.000Z',
    false,
    '当前真实协作动态',
  );
  const merged = mergeThreadMessageActivity(current, [
    {
      id: 'missing',
      threadId: 'comic',
      senderType: 'agent',
      senderName: '漫画',
      content: '没有服务器时间',
    },
    {
      id: 'invalid',
      threadId: 'comic',
      senderType: 'agent',
      senderName: '漫画',
      content: '非法服务器时间',
      createdAt: 'invalid',
    },
  ]);
  expect(merged).toMatchObject({
    lastMessageAt: current.lastMessageAt,
    lastContent: current.lastContent,
  });
  expect(merged.messages).toHaveLength(2);
});

test.each([
  ['user', '正在讨论协作成果'],
  ['agent', '协作讨论已回复'],
] as const)(
  'a %s contribution discussion keeps source-derived text out of the ordinary list preview',
  (senderType, preview) => {
    const current = thread('comic', '2026-11-06T08:24:00.000Z');
    const message = {
      id: 'discussion',
      threadId: 'comic',
      senderType,
      senderName: '参与者',
      content: '输入或旧回执中包含的私有成果文字',
      createdAt: '2026-11-06T08:45:32.410Z',
      metadata: {
        workspaceContext: {
          id: '45267cd7-549c-4f8f-8576-49d061cc335a',
          revision: 3,
          currentRound: 1,
          nodeId: '12a41286-e950-42a7-b482-1d1c56414e89',
          goal: '原任务',
        },
      },
    };
    const merged = mergeThreadMessageActivity(current, [message]);
    expect(merged).toMatchObject({
      lastMessageAt: message.createdAt,
      lastContent: preview,
    });
    expect(merged.lastContent).not.toContain('私有成果文字');
    expect(merged.messages[0].content).toBe(message.content);
  },
);

test.each(['send', 'refresh'] as const)(
  '%s keeps a newer workspace preview and time while still merging older messages',
  async kind => {
    const data = receipt('2026-11-06T08:45:32.410Z');
    let resolve!: (value: unknown) => void;
    const pending = new Promise(done => {
      resolve = done;
    });
    if (kind === 'send')
      api.sendMessage.mockReturnValue(
        pending as ReturnType<typeof apiClient.sendMessage>,
      );
    else
      api.messages.mockReturnValue(
        pending as ReturnType<typeof apiClient.messages>,
      );
    await act(async () => {
      tree = TestRenderer.create(
        <Harness
          initial={[
            thread('pinned', '2026-11-06T07:00:00.000Z', true),
            thread(
              'comic',
              '2026-11-06T08:50:00.000Z',
              false,
              '协作任务有了更新',
            ),
            thread('other', '2026-11-06T08:44:00.000Z'),
          ]}
        />,
      );
    });
    let request!: Promise<unknown>;
    act(() => {
      request =
        kind === 'send'
          ? actions.sendMessage('comic', '解释这份成果')
          : actions.refreshThreadMessages('comic');
    });
    expect(threads[1]).toMatchObject({
      lastMessageAt: '2026-11-06T08:50:00.000Z',
      lastContent: '协作任务有了更新',
    });
    await act(async () => {
      resolve(kind === 'send' ? { messages: data } : data);
      await request;
    });
    expect(threads.map(item => item.id)).toEqual(['pinned', 'comic', 'other']);
    expect(threads[1]).toMatchObject({
      lastMessageAt: '2026-11-06T08:50:00.000Z',
      lastContent: '协作任务有了更新',
    });
    expect(threads[1].messages.map(item => item.id)).toEqual([
      'input',
      'agent-reply',
    ]);
  },
);
