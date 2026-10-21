jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { get: jest.fn(), decide: jest.fn(), create: jest.fn() },
}));
jest.mock('../src/services/api/http', () => ({
  ...jest.requireActual('../src/services/api/http'),
  request: jest.fn(),
}));
import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { WorkspaceContextCard } from '../src/features/messages/WorkspaceContextCard';
import { WorkspaceButton, WorkspaceState } from '../src/shared/workspaceUi';
import { palettes } from '../src/shared/theme';
import { agentWorkspace } from '../__fixtures__/agentWorkspace';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { messageApi } from '../src/services/api/messageApi';
import { request } from '../src/services/api/http';
import {
  setAIContractSession,
  clearAIContractSession,
} from '../src/services/aiContract';
import {
  isWorkspaceDiscussionContext,
  workspaceContextSelector,
  workspaceDiscussionContext,
} from '../src/models/workspaceContext';

const workspace = agentWorkspace({
  id: '45267cd7-549c-4f8f-8576-49d061cc335a',
  revision: 8,
});
const context = workspaceDiscussionContext(workspace);
const api = jest.mocked(agentWorkspaceApi);
const http = jest.mocked(request);
const props = {
  token: 'token',
  context,
  palette: palettes.light,
  language: 'zh' as const,
  draft: '保留原内容，只精简开头',
  onChangeContext: jest.fn(),
  onRemove: jest.fn(),
  onOpenWorkspace: jest.fn(),
};
let tree: TestRenderer.ReactTestRenderer | undefined;
let appState: (value: AppStateStatus) => void;
const button = (label: string) =>
  tree!.root
    .findAllByType(WorkspaceButton)
    .find(node => node.props.label === label)!;
const mount = async (
  extra: Partial<React.ComponentProps<typeof WorkspaceContextCard>> = {},
) => {
  await act(async () => {
    tree = TestRenderer.create(<WorkspaceContextCard {...props} {...extra} />);
  });
};
beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockReset();
  api.get.mockResolvedValue(workspace);
  http.mockReset();
  http.mockResolvedValue({ messages: [] });
  setAIContractSession('token', { aiTasks: 1, agentWorkspaces: 6 });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      appState = listener;
      return { remove: jest.fn() };
    });
});
afterEach(async () => {
  await act(async () => tree?.unmount());
  tree = undefined;
  clearAIContractSession();
  jest.restoreAllMocks();
});

test('a discussion sends only the exact workspace selector, with the message key and no client goal snapshot', async () => {
  await messageApi.sendMessage(
    'thread',
    '请解释这一步',
    'token',
    undefined,
    null,
    'c4bc737f-19b9-43a2-a8a9-b7cd47777e07',
    45000,
    [],
    undefined,
    context,
  );
  expect(http).toHaveBeenCalledWith(
    '/api/threads/thread/messages',
    expect.objectContaining({
      body: {
        content: '请解释这一步',
        contextRefs: [],
        clientMessageId: 'c4bc737f-19b9-43a2-a8a9-b7cd47777e07',
        workspaceContext: workspaceContextSelector(context),
      },
    }),
  );
  expect(api.decide).not.toHaveBeenCalled();
  expect(api.create).not.toHaveBeenCalled();
});

test('professional selection reset uses its own field and rejects Butler or task-context mixing before HTTP', async () => {
  await messageApi.sendMessage(
    'professional-thread',
    '新的需求',
    'token',
    null,
    null,
    'c4bc737f-19b9-43a2-a8a9-b7cd47777e07',
    45000,
    [],
    undefined,
    undefined,
    true,
  );
  expect(http).toHaveBeenCalledWith(
    '/api/threads/professional-thread/messages',
    expect.objectContaining({
      body: {
        content: '新的需求',
        contextRefs: [],
        clientMessageId: 'c4bc737f-19b9-43a2-a8a9-b7cd47777e07',
        agentContextReset: true,
      },
      headers: {
        'X-Miaoxun-AI-Contract': '1',
        'X-Miaoxun-Agent-Workspace': '6',
      },
    }),
  );
  http.mockClear();
  for (const [butlerReset, workspaceContext] of [
    [true, undefined],
    [undefined, context],
  ] as const) {
    expect(() =>
      messageApi.sendMessage(
        'professional-thread',
        '混合',
        'token',
        null,
        null,
        'c4bc737f-19b9-43a2-a8a9-b7cd47777e07',
        45000,
        [],
        butlerReset,
        workspaceContext,
        true,
      ),
    ).toThrow('不能混用');
  }
  expect(http).not.toHaveBeenCalled();
});

test.each([undefined, 'not-a-uuid'])(
  'a discussion requires a UUID clientMessageId: %s',
  id => {
    expect(() =>
      messageApi.sendMessage(
        'thread',
        '请解释这一步',
        'token',
        undefined,
        null,
        id,
        45000,
        [],
        undefined,
        context,
      ),
    ).toThrow('需要有效的消息标识');
    expect(http).not.toHaveBeenCalled();
  },
);

test.each(['reference', 'reply', 'reset-true', 'reset-false'] as const)(
  'discussion rejects mixed %s before HTTP',
  kind => {
    expect(() =>
      messageApi.sendMessage(
        'thread',
        '讨论',
        'token',
        undefined,
        kind === 'reply' ? 'message' : null,
        'c4bc737f-19b9-43a2-a8a9-b7cd47777e07',
        45000,
        kind === 'reference' ? [{ kind: 'station-album', id: 'album' }] : [],
        kind === 'reset-true'
          ? true
          : kind === 'reset-false'
          ? false
          : undefined,
        context,
      ),
    ).toThrow('不能同时附加');
    expect(http).not.toHaveBeenCalled();
  },
);

test.each([
  { id: '../task' },
  { revision: 0 },
  { currentRound: 0 },
  { currentRound: 1.5 },
  { goal: '' },
])('invalid task context is not a usable navigation reference: %o', changes => {
  expect(isWorkspaceDiscussionContext({ ...context, ...changes })).toBe(false);
});

test('preparing revisions reads the real task and opens an editable original-base draft without executing', async () => {
  const current = { ...workspace, revision: 10, currentRound: 2 };
  api.get.mockResolvedValue(current);
  await mount();
  expect(api.get).not.toHaveBeenCalled();
  await act(async () => button('继续修改此任务').props.onPress());
  expect(api.get).toHaveBeenCalledWith('token', workspace.id);
  expect(props.onOpenWorkspace).toHaveBeenCalledWith(
    current,
    expect.objectContaining({
      ...workspaceContextSelector(context),
      text: props.draft,
      draftId: expect.any(String),
    }),
  );
  expect(api.decide).not.toHaveBeenCalled();
  expect(api.create).not.toHaveBeenCalled();
});

test('historical discussion restores only the authenticated context and requires a separate explicit choice after the task changes', async () => {
  const current = { ...workspace, revision: 10, currentRound: 2 };
  api.get.mockResolvedValue(current);
  await mount({ historical: true });
  await act(async () => button('继续讨论此任务').props.onPress());
  expect(props.onChangeContext).not.toHaveBeenCalled();
  expect(button('使用当前任务版本讨论')).toBeDefined();
  await act(async () => button('使用当前任务版本讨论').props.onPress());
  expect(props.onChangeContext).toHaveBeenCalledWith(
    workspaceDiscussionContext(current),
  );
  expect(props.onOpenWorkspace).not.toHaveBeenCalled();
  expect(api.decide).not.toHaveBeenCalled();
});

test('a revoked read is explicit and neither rebinds discussion nor opens execution', async () => {
  api.get.mockRejectedValue(new Error('任务不存在或无权访问。'));
  await mount();
  await act(async () => button('继续修改此任务').props.onPress());
  expect(tree!.root.findByType(WorkspaceState).props.title).toContain(
    '无权访问',
  );
  expect(props.onChangeContext).not.toHaveBeenCalled();
  expect(props.onOpenWorkspace).not.toHaveBeenCalled();
  expect(api.decide).not.toHaveBeenCalled();
});

test.each(['token', 'task', 'background', 'unmount'] as const)(
  '%s changes invalidate a pending task read',
  async change => {
    let resolve!: (value: typeof workspace) => void;
    api.get.mockReturnValue(
      new Promise(done => {
        resolve = done;
      }),
    );
    await mount();
    let reading!: Promise<void>;
    act(() => {
      reading = button('继续修改此任务').props.onPress();
    });
    await act(async () => {
      if (change === 'unmount') tree!.unmount();
      else if (change === 'background') appState('background');
      else
        tree!.update(
          <WorkspaceContextCard
            {...props}
            token={change === 'token' ? 'other' : props.token}
            context={
              change === 'task'
                ? { ...context, id: 'c4bc737f-19b9-43a2-a8a9-b7cd47777e07' }
                : context
            }
          />,
        );
    });
    await act(async () => {
      resolve(workspace);
      await reading;
    });
    expect(props.onOpenWorkspace).not.toHaveBeenCalled();
    expect(props.onChangeContext).not.toHaveBeenCalled();
  },
);
