import { mergeMessages } from '../src/features/session/sessionMappers';
import React, { useState } from 'react';
import ReactTestRenderer from 'react-test-renderer';

import { useMessageActions } from '../src/features/session/useMessageActions';
import { ChatThread } from '../src/features/session/sessionTypes';
import { apiClient } from '../src/services/apiClient';
import { MiaoxunApiError } from '../src/services/api/http';
import {
  clearAIContractSession,
  setAIContractSession,
} from '../src/services/aiContract';
import { workspaceAssistContext } from '../src/features/assist/workspaceAssistContext';
import { buildAssistMessage } from '../src/features/assist/assistRequest';
import { agentWorkspace } from '../__fixtures__/agentWorkspace';
import {
  workspaceDiscussionContext,
  workspaceContextSelector,
} from '../src/models/workspaceContext';

jest.mock('../src/services/apiClient', () => ({
  apiClient: { sendMessage: jest.fn() },
}));

const sendMessage = apiClient.sendMessage as jest.Mock;
let actions: ReturnType<typeof useMessageActions>;
let currentThreads: ChatThread[] = [];

function Harness({
  agentId = null,
  onError = () => undefined,
}: {
  agentId?: string | null;
  onError?: (message: unknown) => void;
}) {
  const [threads, setThreads] = useState<ChatThread[]>([
    {
      id: 'thread-1',
      agentId,
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
    makeButlerContext: currentPage => ({
      currentPage,
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
    setErrorMessage: onError,
  });
  return null;
}

test('a failed quoted message retries with its original idempotency key and reply', async () => {
  setAIContractSession('test-token', { aiTasks: 1 });
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
    await actions.sendMessage('thread-1', 'hello', undefined, 'quoted-1', [
      { kind: 'station-album', id: 'album-1', title: '选中相册' },
    ]);
  });
  const failed = currentThreads[0].messages[0];
  expect(failed.localStatus).toBe('failed');
  expect(failed.clientMessageId).toMatch(/^[0-9a-f-]{36}$/);
  expect(failed.metadata?.replyTo).toEqual({ messageId: 'quoted-1' });

  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      'hello',
      failed.id,
      'different-quote',
      [{ kind: 'station-album', id: 'changed-selection' }],
    );
  });
  expect(sendMessage).toHaveBeenCalledTimes(2);
  expect(sendMessage.mock.calls[0][5]).toBe(failed.clientMessageId);
  expect(sendMessage.mock.calls[1][5]).toBe(failed.clientMessageId);
  expect(sendMessage.mock.calls[1][4]).toBe('quoted-1');
  expect(sendMessage.mock.calls[0][7]).toEqual([
    { kind: 'station-album', id: 'album-1', title: '选中相册' },
  ]);
  expect(sendMessage.mock.calls[1][7]).toEqual(sendMessage.mock.calls[0][7]);
  expect(currentThreads[0].messages.map(message => message.id)).toEqual([
    'server-1',
  ]);
  await ReactTestRenderer.act(async () => renderer!.unmount());
});

test('a missing original failed message never falls back to a new execution key', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset();
  const onError = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness agentId="site-builder" onError={onError} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    expect(
      await actions.sendMessage('thread-1', '旧请求', 'missing-failed-message'),
    ).toBe(false);
  });
  expect(sendMessage).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(
    expect.stringContaining('原失败消息已不可重试'),
  );
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('an album request against an unverified server is blocked before sending and keeps an explicit failed input', async () => {
  clearAIContractSession();
  sendMessage.mockReset();
  const onError = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness agentId="album-manager" onError={onError} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    expect(await actions.sendMessage('thread-1', 'Find my photos')).toBe(false);
  });
  expect(sendMessage).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith(
    expect.stringContaining('当前服务器不支持'),
  );
  expect(currentThreads[0].messages[0].localStatus).toBe('failed');
  await ReactTestRenderer.act(async () => renderer!.unmount());
});

test('a task recovered after a lost response replaces its failed optimistic message by client id', () => {
  const optimistic = {
    id: 'local-stable',
    threadId: 'thread-1',
    senderType: 'user',
    senderName: 'Tester',
    content: 'find media',
    clientMessageId: 'stable',
    localStatus: 'failed' as const,
  };
  const accepted = {
    ...optimistic,
    id: 'saved-message',
    localStatus: undefined,
  };
  expect(mergeMessages([optimistic], [accepted])).toEqual([accepted]);
  const otherThread = { ...optimistic, threadId: 'thread-2' };
  expect(mergeMessages([otherThread], [accepted])).toHaveLength(2);
});

test.each([
  'album-manager',
  'site-builder',
  'file-preprocessor',
  'comic-diary',
  'video-production',
  'virtual-character',
  'model-3d',
])(
  'professional %s requires contract 5 before even an ordinary send',
  async agentId => {
    setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 4 });
    sendMessage.mockReset();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Harness agentId={agentId} />);
    });
    await ReactTestRenderer.act(async () => {
      expect(await actions.sendMessage('thread-1', '你好')).toBe(false);
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(currentThreads[0].messages[0].localStatus).toBe('failed');
    await ReactTestRenderer.act(async () => renderer.unmount());
  },
);

test('professional retry preserves original text, selection, reset and key without Butler private context or a workspace selector', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset().mockRejectedValue(new Error('response lost'));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness agentId="comic-diary" />);
  });
  const refs = [
    {
      kind: 'station-diary' as const,
      id: 'selected-diary',
      version: 'a'.repeat(64),
    },
  ];
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      '为这篇日记写分镜',
      undefined,
      null,
      refs,
      { currentPage: 'station.diaries' },
      undefined,
      undefined,
      true,
    );
  });
  const failed = currentThreads[0].messages[0];
  expect(failed.metadata?.agentContextReset).toBe(true);
  expect(failed.metadata?.butlerContextReset).toBeUndefined();
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      '不同的新正文',
      failed.id,
      null,
      [],
      undefined,
      undefined,
      undefined,
      false,
    );
  });
  expect(sendMessage.mock.calls).toHaveLength(2);
  expect(sendMessage.mock.calls[1]).toEqual(sendMessage.mock.calls[0]);
  expect(sendMessage.mock.calls[0][1]).toBe('为这篇日记写分镜');
  expect(sendMessage.mock.calls[0][3]).toBeNull();
  expect(sendMessage.mock.calls[0][5]).toBe(failed.clientMessageId);
  expect(sendMessage.mock.calls[0][7]).toEqual(refs);
  expect(sendMessage.mock.calls[0].slice(8)).toEqual([
    undefined,
    undefined,
    true,
  ]);
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a failed assistance request retries from its captured page and discards local metadata on server success', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset();
  sendMessage.mockRejectedValueOnce(new Error('response lost'));
  sendMessage.mockRejectedValueOnce(new Error('still offline'));
  sendMessage.mockResolvedValueOnce({
    messages: [
      {
        id: 'server-assistance',
        threadId: 'thread-1',
        senderType: 'user',
        senderName: 'Tester',
        content: '请分析这个任务',
        metadata: { source: 'app' },
      },
    ],
  });
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness agentId="miaoxun-butler" />);
  });
  const source = { currentPage: 'miao.task' };
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      '请分析这个任务',
      undefined,
      null,
      [],
      source,
    );
  });
  const failed = currentThreads[0].messages[0];
  expect(failed.metadata?.assistSource).toEqual({ currentPage: 'miao.task' });
  expect(sendMessage.mock.calls[0][3].currentPage).toBe('miao.task');
  // The caller can mutate its own object or navigate; the failed input retains
  // its source, and retries need no newly supplied context.
  source.currentPage = 'second-floor.albums';
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage('thread-1', failed.content, failed.id);
  });
  expect(sendMessage.mock.calls[1][3].currentPage).toBe('miao.task');
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage('thread-1', failed.content, failed.id, null, [], {
      currentPage: 'second-floor.files',
    });
  });
  expect(sendMessage.mock.calls[2][3].currentPage).toBe('miao.task');
  expect(sendMessage.mock.calls.map(call => call[5])).toEqual([
    failed.clientMessageId,
    failed.clientMessageId,
    failed.clientMessageId,
  ]);
  expect(currentThreads[0].messages).toEqual([
    expect.objectContaining({
      id: 'server-assistance',
      metadata: { source: 'app' },
    }),
  ]);
  await ReactTestRenderer.act(async () => renderer!.unmount());
});

test('invalid assistance locations stop before sending or creating a local message', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset();
  const onError = jest.fn();
  let renderer: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness agentId="miaoxun-butler" onError={onError} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    expect(
      await actions.sendMessage('thread-1', '请分析', undefined, null, [], {
        currentPage: 'x'.repeat(121),
      }),
    ).toBe(false);
  });
  expect(sendMessage).not.toHaveBeenCalled();
  expect(currentThreads[0].messages).toEqual([]);
  expect(onError).toHaveBeenCalledWith(expect.stringContaining('来源无效'));
  await ReactTestRenderer.act(async () => renderer!.unmount());
});

test('a failed task discussion retries its original selector and key without replacing them with a new selection', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset();
  sendMessage.mockRejectedValue(new Error('offline'));
  const workspace = agentWorkspace({
    id: '45267cd7-549c-4f8f-8576-49d061cc335a',
    revision: 12,
  });
  const context = workspaceDiscussionContext(workspace);
  const selected = workspaceAssistContext(workspace, [], 'zh');
  const content = buildAssistMessage(
    '帮我理解',
    selected.scene,
    selected,
    'zh',
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness agentId="miaoxun-butler" />);
  });
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      content,
      undefined,
      null,
      [],
      {
        currentPage: 'miao.feed',
      },
      undefined,
      context,
    );
  });
  const failed = currentThreads[0].messages[0];
  expect(failed.localStatus).toBe('failed');
  expect(failed.content).toBe(content);
  expect(failed.content).toBe('帮我理解');
  expect(failed.metadata?.workspaceContext).toEqual(context);
  expect(failed.content).not.toMatch(
    /selected-workspace|记录版本|发起位置|所在模块/,
  );
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      failed.content,
      failed.id,
      null,
      [{ kind: 'station-album', id: 'must-not-add-new-reference' }],
      { currentPage: 'second-floor.albums' },
      undefined,
      { ...context, revision: 99, currentRound: 8 },
    );
  });
  expect(sendMessage).toHaveBeenCalledTimes(2);
  for (const call of sendMessage.mock.calls) {
    expect(call[1]).toBe(content);
    expect(call[3].currentPage).toBe('miao.feed');
    expect(call[5]).toBe(failed.clientMessageId);
    expect(call[7]).toEqual([]);
    expect(call[9]).toEqual(workspaceContextSelector(context));
  }
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a professional Agent discussion sends and retries its exact contribution node, while metadata-only task discussion is rejected', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset();
  sendMessage.mockRejectedValue(new Error('offline'));
  const context = {
    ...workspaceDiscussionContext(
      agentWorkspace({ id: '45267cd7-549c-4f8f-8576-49d061cc335a' }),
    ),
    nodeId: '12a41286-e950-42a7-b482-1d1c56414e89',
  };
  const onError = jest.fn();
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness agentId="comic-diary" onError={onError} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      '解释这份成果',
      undefined,
      null,
      [],
      undefined,
      undefined,
      context,
    );
  });
  expect(sendMessage.mock.calls[0][9]).toEqual(
    workspaceContextSelector(context),
  );
  const failed = currentThreads[0].messages[0];
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      'changed',
      failed.id,
      null,
      [],
      undefined,
      undefined,
      { ...context, nodeId: 'efbb42c0-82cc-4f51-9205-492d55aec6c7' },
    );
  });
  expect(sendMessage.mock.calls[1][9]).toEqual(
    workspaceContextSelector(context),
  );
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      '不选贡献',
      undefined,
      null,
      [],
      undefined,
      undefined,
      { ...context, nodeId: undefined },
    );
  });
  expect(sendMessage).toHaveBeenCalledTimes(2);
  expect(onError).toHaveBeenLastCalledWith(
    expect.stringContaining('任务讨论关联无效'),
  );
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a task discussion cannot be sent with an explicitly supplied reset value', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset();
  const onError = jest.fn();
  const context = workspaceDiscussionContext(
    agentWorkspace({
      id: '45267cd7-549c-4f8f-8576-49d061cc335a',
      revision: 12,
    }),
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(
      <Harness agentId="miaoxun-butler" onError={onError} />,
    );
  });
  await ReactTestRenderer.act(async () => {
    expect(
      await actions.sendMessage(
        'thread-1',
        '请继续讨论',
        undefined,
        null,
        [],
        undefined,
        false,
        context,
      ),
    ).toBe(false);
  });
  expect(sendMessage).not.toHaveBeenCalled();
  expect(currentThreads[0].messages).toEqual([]);
  expect(onError).toHaveBeenCalledWith(
    expect.stringContaining('任务讨论关联无效'),
  );
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('a denied album reference retains the exact request and explicit access failure for review', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset();
  sendMessage.mockRejectedValueOnce(
    new MiaoxunApiError('请先确认相册读取授权。', {
      status: 403,
      code: 'AI_CONTEXT_SCOPE_REQUIRED',
    }),
  );
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness agentId="miaoxun-butler" />);
  });
  const reference = {
    kind: 'station-album' as const,
    id: 'selected-album',
    title: '旅行',
  };
  await ReactTestRenderer.act(async () => {
    expect(
      await actions.sendMessage(
        'thread-1',
        '理解所选内容',
        undefined,
        null,
        [reference],
        {
          currentPage: 'second-floor.albums',
        },
      ),
    ).toBe(false);
  });
  const failed = currentThreads[0].messages[0];
  expect(failed.localFailure).toEqual({
    message: '请先确认相册读取授权。',
    code: 'AI_CONTEXT_SCOPE_REQUIRED',
  });
  expect(failed.content).toBe('理解所选内容');
  expect(failed.metadata?.contextRefs).toEqual([reference]);
  expect(failed.metadata?.assistSource).toEqual({
    currentPage: 'second-floor.albums',
  });
  expect(sendMessage).toHaveBeenCalledTimes(1);
  sendMessage.mockResolvedValueOnce({
    messages: [
      {
        id: 'saved-after-review',
        threadId: 'thread-1',
        senderType: 'user',
        senderName: 'Tester',
        content: failed.content,
      },
    ],
  });
  await ReactTestRenderer.act(async () => {
    expect(
      await actions.sendMessage('thread-1', failed.content, failed.id),
    ).toBe(true);
  });
  expect(sendMessage.mock.calls[1][5]).toBe(failed.clientMessageId);
  expect(sendMessage.mock.calls[1][7]).toEqual([reference]);
  expect(sendMessage.mock.calls[1][3].currentPage).toBe('second-floor.albums');
  expect(currentThreads[0].messages[0].localFailure).toBeUndefined();
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test('an explicit Butler context reset is retained by the same failed request and cannot be changed on retry', async () => {
  setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
  sendMessage.mockReset();
  sendMessage.mockRejectedValue(new Error('response lost'));
  let renderer!: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(async () => {
    renderer = ReactTestRenderer.create(<Harness agentId="miaoxun-butler" />);
  });
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      '取消原素材范围',
      undefined,
      null,
      [],
      { currentPage: 'second-floor.albums' },
      true,
    );
  });
  const failed = currentThreads[0].messages[0];
  expect(failed.metadata?.butlerContextReset).toBe(true);
  await ReactTestRenderer.act(async () => {
    await actions.sendMessage(
      'thread-1',
      failed.content,
      failed.id,
      null,
      [],
      undefined,
      false,
    );
  });
  expect(sendMessage.mock.calls[0][8]).toBe(true);
  expect(sendMessage.mock.calls[1][8]).toBe(true);
  expect(sendMessage.mock.calls[1][5]).toBe(failed.clientMessageId);
  expect(sendMessage.mock.calls[1][3].currentPage).toBe('second-floor.albums');
  await ReactTestRenderer.act(async () => renderer.unmount());
});

test.each([
  undefined,
  { aiTasks: 1 },
  { aiTasks: 1, agentWorkspaces: 1 },
  { aiTasks: 1, agentWorkspaces: 2 },
])(
  'a Butler send without references requires workspace3 before the API call: %p',
  async contracts => {
    setAIContractSession('test-token', contracts);
    sendMessage.mockReset();
    const onError = jest.fn();
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <Harness agentId="miaoxun-butler" onError={onError} />,
      );
    });
    await ReactTestRenderer.act(async () => {
      expect(await actions.sendMessage('thread-1', '你好')).toBe(false);
    });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(currentThreads[0].messages[0]).toMatchObject({
      content: '你好',
      localStatus: 'failed',
    });
    expect(onError).toHaveBeenCalled();
    await ReactTestRenderer.act(async () => renderer.unmount());
  },
);

test.each([
  { agentId: null, contracts: undefined },
  { agentId: 'comic-diary', contracts: { aiTasks: 1, agentWorkspaces: 6 } },
  { agentId: 'miaoxun-butler', contracts: { aiTasks: 1, agentWorkspaces: 6 } },
])(
  'the existing contract permits a normal message for $agentId',
  async ({ agentId, contracts }) => {
    setAIContractSession('test-token', contracts);
    sendMessage.mockReset().mockResolvedValue({ messages: [] });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Harness agentId={agentId} />);
    });
    await ReactTestRenderer.act(async () => {
      expect(await actions.sendMessage('thread-1', '你好')).toBe(true);
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0][7]).toEqual([]);
    if (agentId === 'miaoxun-butler')
      expect(sendMessage.mock.calls[0][3]).toMatchObject({
        currentPage: 'messages.butler',
      });
    else expect(sendMessage.mock.calls[0][3]).toBeNull();
    await ReactTestRenderer.act(async () => renderer.unmount());
  },
);

test.each([
  '帮我建站，先写一份作品集页面',
  '用英文写一段视频旁白，不要修改界面语言',
  '分析深色视觉适不适合这个页面',
  '不要打开设置，先回答我',
  '解释二维码怎么工作',
])(
  'Butler receives the complete request without a fabricated local action: %s',
  async content => {
    setAIContractSession('test-token', { aiTasks: 1, agentWorkspaces: 6 });
    sendMessage.mockReset().mockResolvedValue({ messages: [] });
    let renderer!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<Harness agentId="miaoxun-butler" />);
    });
    await ReactTestRenderer.act(async () => {
      expect(await actions.sendMessage('thread-1', content)).toBe(true);
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]).toEqual([
      'thread-1',
      content,
      'test-token',
      expect.objectContaining({
        currentPage: 'messages.butler',
        language: 'zh',
        appearance: 'light',
      }),
      undefined,
      expect.any(String),
      45000,
      [],
    ]);
    await ReactTestRenderer.act(async () => renderer.unmount());
  },
);
