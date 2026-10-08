import React, { useState } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { useMessageActions } from '../src/features/session/useMessageActions';
import { ChatThread } from '../src/features/session/sessionTypes';
import { apiClient } from '../src/services/apiClient';

jest.mock('../src/services/apiClient', () => ({
  apiClient: { sendMessage: jest.fn() },
}));

const sendMessage = apiClient.sendMessage as jest.Mock;
let actions: ReturnType<typeof useMessageActions>;
let currentThreads: ChatThread[] = [];

function Harness() {
  const [threads, setThreads] = useState<ChatThread[]>([
    {
      id: 'thread-1',
      agentId: null,
      title: 'Test thread',
      avatarText: 'T',
      kind: 'direct',
      pinned: false,
      lastContent: '',
      unreadCount: 0,
      messages: [],
    },
  ]);
  currentThreads = threads;
  actions = useMessageActions({
    token: 'test-token',
    threads,
    currentUserName: 'Tester',
    makeButlerContext: () => ({
      currentPage: 'messages',
      language: 'zh',
      appearance: 'light',
      profileSnapshot: {
        nickname: 'Tester',
        followersCount: 0,
        followingCount: 0,
        collectionsCount: 0,
        miaoPoints: 0,
      },
      enabledAgentIds: [],
    }),
    setThreads,
    setErrorMessage: () => undefined,
  });
  return null;
}

test('a failed quoted message retries with its original idempotency key and reply', async () => {
  sendMessage.mockReset();
  sendMessage.mockRejectedValueOnce(new Error('response lost'));
  sendMessage.mockResolvedValueOnce({
    messages: [
      {
        id: 'server-1',
        threadId: 'thread-1',
        senderType: 'user',
        senderName: 'Tester',
        content: 'hello',
        metadata: { replyTo: { messageId: 'quoted-1' } },
        createdAt: '2026-09-29T00:00:00.000Z',
      },
    ],
  });
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness />);
  });

  await ReactTestRenderer.act(async () => {
    await actions.sendMessage('thread-1', 'hello', null, undefined, 'quoted-1');
  });
  const failed = currentThreads[0].messages[0];
  expect(failed.localStatus).toBe('failed');
  expect(failed.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
  expect(failed.metadata?.replyTo).toEqual({ messageId: 'quoted-1' });

  await ReactTestRenderer.act(async () => {
    await actions.sendMessage('thread-1', 'hello', null, failed.id, 'quoted-1');
  });
  expect(sendMessage).toHaveBeenCalledTimes(2);
  expect(sendMessage.mock.calls[0][6]).toBe(failed.clientMessageId);
  expect(sendMessage.mock.calls[1][6]).toBe(failed.clientMessageId);
  expect(sendMessage.mock.calls[1][5]).toBe('quoted-1');
  expect(currentThreads[0].messages.map(message => message.id)).toEqual([
    'server-1',
  ]);
  await ReactTestRenderer.act(async () => renderer!.unmount());
});
