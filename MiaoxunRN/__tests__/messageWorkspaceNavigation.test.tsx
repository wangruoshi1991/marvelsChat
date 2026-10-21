import React from 'react';
import { View } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { ChatMessageItem } from '../src/features/messages/ChatMessageItem';
import { messageWorkspaceId } from '../src/features/messages/WorkspaceMessageAction';
import { ChatMessage, ChatThread } from '../src/features/session/sessionTypes';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { WorkspaceButton, WorkspaceState } from '../src/shared/workspaceUi';
import { palettes } from '../src/shared/theme';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';

jest.mock('../src/features/assist/AIAssistProvider', () => ({
  useAIAssist: () => ({ isActive: false, dismiss: jest.fn() }),
}));
jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { get: jest.fn() },
}));

const workspaceId = '45267cd7-549c-4f8f-8576-49d061cc335a';
const message: ChatMessage = {
  id: 'reply-1',
  threadId: 'butler-thread',
  senderType: 'agent',
  senderName: '妙管家',
  content: '已安排协作，可查看任务进展。',
  metadata: { agentWorkspace: { id: workspaceId } },
};
const thread = {
  id: message.threadId,
  agentId: 'miaoxun-butler',
  kind: 'agent',
  messages: [message],
} as ChatThread;
const props = {
  token: 'token-a',
  item: message,
  previousMessage: null,
  palette: palettes.light,
  language: 'zh' as const,
  currentUserId: 'user-a',
  currentUserName: 'Tester',
  thread,
  agents: [],
  isDarkPalette: false,
  renderUserAvatar: () => <View />,
  onOpenMessageMenu: jest.fn(),
  onRetrySend: jest.fn(),
  onActionMessage: jest.fn(),
  onOpenWorkspace: jest.fn(),
};
const api = jest.mocked(agentWorkspaceApi);
let tree: TestRenderer.ReactTestRenderer | undefined;
const press = () => tree!.root.findByType(WorkspaceButton).props.onPress();
const render = async (extra: Partial<typeof props> = {}) => {
  await act(async () => {
    tree = TestRenderer.create(<ChatMessageItem {...props} {...extra} />);
  });
};
beforeEach(() => jest.resetAllMocks());
afterEach(() => {
  act(() => tree?.unmount());
  tree = undefined;
});

test.each([
  { senderType: 'user' },
  { senderType: 'system' },
  { recalledAt: '2026-10-13T00:00:00Z' },
  { deletedAt: '2026-10-13T00:00:00Z' },
  { localStatus: 'failed' },
  { metadata: undefined },
  { metadata: { agentWorkspace: { id: '../another-task' } } },
  { metadata: { agentWorkspace: { id: 123 } } },
  { metadata: { agentWorkspace: [{ id: workspaceId }] } },
  { metadata: { agentWorkspace: null } },
])('rejects invalid or non-agent task metadata: %o', changes => {
  expect(
    messageWorkspaceId(
      { ...message, ...changes } as ChatMessage,
      'miaoxun-butler',
    ),
  ).toBeNull();
});
test('only a Butler agent reply with a UUID exposes a workspace reference', () => {
  expect(messageWorkspaceId(message, 'miaoxun-butler')).toBe(workspaceId);
  expect(messageWorkspaceId(message, 'site-builder')).toBeNull();
  expect(messageWorkspaceId(message)).toBeNull();
});

const professionalMessage: ChatMessage = {
  ...message,
  threadId: 'professional-thread',
  metadata: {
    agentDispatch: { version: 1, kind: 'workspace' },
    agentWorkspace: { id: workspaceId },
  },
};
const professionalThread = {
  ...thread,
  id: professionalMessage.threadId,
  agentId: 'site-builder',
  messages: [professionalMessage],
};
const directWorkspace = () =>
  agentWorkspace({
    id: workspaceId,
    executionMode: 'direct',
    origin: {
      kind: 'agent_conversation',
      threadId: professionalThread.id,
      inputMessageId: 'input',
      agentId: 'site-builder',
      agentVersion: '1',
      capability: 'site.compose',
    },
    steps: [
      workspaceStep({
        agentId: 'site-builder',
        agentVersion: '1',
        capability: 'site.compose',
      }),
    ],
  });
test('professional dispatch links need matching message thread and a fresh authenticated task origin', async () => {
  expect(
    messageWorkspaceId(
      professionalMessage,
      'site-builder',
      professionalThread.id,
    ),
  ).toBe(workspaceId);
  expect(
    messageWorkspaceId(professionalMessage, 'site-builder', 'different-thread'),
  ).toBeNull();
  expect(
    messageWorkspaceId(
      {
        ...professionalMessage,
        metadata: {
          ...professionalMessage.metadata,
          agentDispatch: { version: 1, kind: 'reply' },
        },
      },
      'site-builder',
    ),
  ).toBeNull();
  const workspace = directWorkspace();
  api.get.mockResolvedValue(workspace);
  await render({ item: professionalMessage, thread: professionalThread });
  await act(async () => press());
  expect(api.get).toHaveBeenCalledWith('token-a', workspaceId);
  expect(props.onOpenWorkspace).toHaveBeenCalledWith(workspace);
});
test.each(['thread', 'agent', 'coordinated'])(
  'professional links reject a fetched task with a mismatching %s origin',
  async mismatch => {
    const workspace = directWorkspace();
    api.get.mockResolvedValue(
      mismatch === 'coordinated'
        ? agentWorkspace({ id: workspaceId })
        : {
            ...workspace,
            origin: {
              ...workspace.origin!,
              ...(mismatch === 'thread'
                ? { threadId: 'private-other-thread' }
                : { agentId: 'comic-diary' }),
            },
          },
    );
    await render({ item: professionalMessage, thread: professionalThread });
    await act(async () => press());
    expect(props.onOpenWorkspace).not.toHaveBeenCalled();
    expect(tree!.root.findByType(WorkspaceState).props.title).toContain(
      '来源与当前专业 Agent 会话不一致',
    );
  },
);
test('the task button reads with the current session and opens only the server result', async () => {
  const workspace = agentWorkspace({ id: workspaceId });
  api.get.mockResolvedValueOnce(workspace);
  await render();
  expect(api.get).not.toHaveBeenCalled();
  await act(async () => press());
  expect(api.get).toHaveBeenCalledWith('token-a', workspaceId);
  expect(props.onOpenWorkspace).toHaveBeenCalledWith(workspace);
});
test('failed or revoked access stays explicit and can be retried', async () => {
  api.get.mockRejectedValueOnce(new Error('任务不存在或无权访问。'));
  api.get.mockResolvedValueOnce(agentWorkspace({ id: workspaceId }));
  await render();
  await act(async () => press());
  expect(props.onOpenWorkspace).not.toHaveBeenCalled();
  expect(tree!.root.findByType(WorkspaceState).props.title).toContain(
    '无权访问',
  );
  await act(async () => press());
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(props.onOpenWorkspace).toHaveBeenCalledTimes(1);
});
test.each(['owner', 'token', 'thread', 'unmount'] as const)(
  '%s changes isolate a late task read and repeated presses',
  async change => {
    let resolve!: (value: ReturnType<typeof agentWorkspace>) => void;
    api.get.mockReturnValueOnce(
      new Promise(done => {
        resolve = done;
      }),
    );
    await render();
    act(() => {
      press();
      press();
    });
    expect(api.get).toHaveBeenCalledTimes(1);
    const updated = {
      ...props,
      ...(change === 'owner' ? { currentUserId: 'user-b' } : {}),
      ...(change === 'token' ? { token: 'token-b' } : {}),
      ...(change === 'thread'
        ? { thread: { ...thread, id: 'another-thread' } }
        : {}),
    };
    act(() => {
      if (change === 'unmount') tree!.unmount();
      else tree!.update(<ChatMessageItem {...updated} />);
    });
    await act(async () => resolve(agentWorkspace({ id: workspaceId })));
    expect(props.onOpenWorkspace).not.toHaveBeenCalled();
  },
);
