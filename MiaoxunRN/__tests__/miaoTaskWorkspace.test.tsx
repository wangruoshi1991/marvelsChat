import React from 'react';
import { AppState, AppStateStatus, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { MiaoTaskWorkspace } from '../src/features/miao/MiaoTaskWorkspace';
import { AITaskDTO } from '../src/models/aiTask';
import { aiTaskApi, AITaskEventPage } from '../src/services/api/aiTaskApi';
import { MiaoxunApiError } from '../src/services/api/http';
import { palettes } from '../src/shared/theme';

jest.mock('../src/services/api/aiTaskApi', () => ({
  aiTaskApi: { get: jest.fn(), events: jest.fn(), decide: jest.fn() },
}));
const get = jest.mocked(aiTaskApi.get);
const events = jest.mocked(aiTaskApi.events);
const decide = jest.mocked(aiTaskApi.decide);
const task = (changes: Partial<AITaskDTO> = {}): AITaskDTO => ({
  id: 'task-1',
  contractVersion: 1,
  kind: 'agent_message',
  agentId: 'album-manager',
  agentVersion: '1',
  goal: '找到上次旅行的照片',
  threadId: 'thread-1',
  inputMessageId: 'message-1',
  status: 'queued',
  revision: 1,
  phase: 'queued',
  contextRefs: [],
  artifacts: [],
  approval: null,
  error: null,
  createdAt: '2026-10-12T00:00:00Z',
  updatedAt: '2026-10-12T00:00:00Z',
  allowedActions: ['cancel'],
  ...changes,
});
const page = (value: AITaskDTO): AITaskEventPage => ({
  task: value,
  events: [
    {
      sequence: value.revision,
      status: value.status,
      phase: value.phase,
      createdAt: value.updatedAt,
    },
  ],
  hasMore: false,
  nextSequence: value.revision,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
let renderer: TestRenderer.ReactTestRenderer | undefined;
const view = (
  options: Partial<React.ComponentProps<typeof MiaoTaskWorkspace>> = {},
) => (
  <MiaoTaskWorkspace
    token="owner-a"
    task={task()}
    agents={[
      {
        key: 'album-manager',
        name: '相册管理',
        version: '1',
        category: 'media-management',
        identity: {
          avatarKind: 'agent-mark',
          mark: '测',
          shape: 'circle',
          colors: {
            background: '#123456',
            foreground: '#ffffff',
            accent: '#abcdef',
          },
        },
        description: '',
        capabilities: [],
        permissions: [],
        status: 'registered',
      },
      {
        key: 'miaoxun-butler',
        name: '未参与的管家',
        version: '1',
        category: 'orchestrator',
        identity: {
          avatarKind: 'agent-mark',
          mark: '测',
          shape: 'circle',
          colors: {
            background: '#123456',
            foreground: '#ffffff',
            accent: '#abcdef',
          },
        },
        description: '',
        capabilities: [],
        permissions: [],
        status: 'registered',
      },
    ]}
    palette={palettes.light}
    language="zh"
    onClose={jest.fn()}
    onOpenSource={jest.fn()}
    {...options}
  />
);
const text = () =>
  renderer!.root
    .findAllByType(Text)
    .map(node => node.props.children)
    .flat(Infinity)
    .join(' ');
const press = (testID: string) =>
  renderer!.root.findByProps({ testID }).props.onPress();

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  get.mockResolvedValue(task());
  events.mockResolvedValue(page(task()));
});
afterEach(() => {
  if (renderer) act(() => renderer!.unmount());
  renderer = undefined;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('shows only the actual agent and persisted task history, and opens its source without model calls', async () => {
  const result = task({
    status: 'succeeded',
    phase: 'completed',
    revision: 4,
    allowedActions: [],
    artifacts: [
      {
        kind: 'message',
        id: 'result-1',
        threadId: 'thread-1',
        title: '相册查询回复',
      },
    ],
    contextRefs: [
      { kind: 'station-album', id: 'album-1', title: '旅行相册', version: '1' },
    ],
  });
  get.mockResolvedValue(result);
  events.mockResolvedValue({
    ...page(result),
    events: [
      {
        sequence: 1,
        status: 'queued',
        phase: 'queued',
        createdAt: result.createdAt,
      },
      {
        sequence: 2,
        status: 'running',
        phase: 'validating',
        createdAt: result.createdAt,
      },
      {
        sequence: 3,
        status: 'running',
        phase: 'searching',
        createdAt: result.createdAt,
      },
      {
        sequence: 4,
        status: 'succeeded',
        phase: 'completed',
        createdAt: result.updatedAt,
      },
    ],
  });
  const open = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(view({ onOpenSource: open }));
  });
  expect(text()).toContain(result.goal);
  expect(text()).toContain('相册管理');
  expect(text()).toContain('旅行相册');
  expect(text()).toContain('查找素材');
  expect(text()).toContain('相册查询回复');
  expect(text()).not.toContain('未参与的管家');
  expect(text()).not.toContain('取消任务');
  expect(text()).not.toMatch(/\d+%|找到\d+张/);
  act(() => press('miao-task-open-source'));
  expect(open).toHaveBeenCalledWith(result);
  expect(decide).not.toHaveBeenCalled();
});

test('uses a neutral name when a task agent is no longer registered', async () => {
  const retiredTask = task({ agentId: 'retired-agent' });
  get.mockResolvedValue(retiredTask);
  events.mockResolvedValue(page(retiredTask));
  await act(async () => {
    renderer = TestRenderer.create(view({ task: retiredTask, agents: [] }));
  });
  expect(text()).toContain('执行 Agent');
  expect(text()).not.toContain('retired-agent');
});

test('never displays the list snapshot before authentication and discards old owner responses on a token change', async () => {
  const initial = deferred<AITaskDTO>();
  get.mockReturnValueOnce(initial.promise);
  await act(async () => {
    renderer = TestRenderer.create(view());
  });
  expect(text()).not.toContain(task().goal);
  expect(text()).toContain('正在读取任务');
  const replacement = deferred<AITaskDTO>();
  get.mockReturnValueOnce(replacement.promise);
  await act(async () => renderer!.update(view({ token: 'owner-b' })));
  await act(async () => initial.resolve(task({ goal: '旧账号私人内容' })));
  expect(text()).not.toContain('旧账号私人内容');
  const fresh = task({ goal: '当前账号目标' });
  events.mockResolvedValueOnce(page(fresh));
  await act(async () => replacement.resolve(fresh));
  expect(text()).toContain('当前账号目标');
  expect(get).toHaveBeenLastCalledWith('owner-b', 'task-1');
  expect(events).toHaveBeenCalledTimes(1);
});

test('changing task IDs clears previous details and late events cannot leak across tasks', async () => {
  const oldHistory = deferred<AITaskEventPage>();
  events.mockReturnValueOnce(oldHistory.promise);
  await act(async () => {
    renderer = TestRenderer.create(view());
  });
  const next = task({ id: 'task-2', goal: '新任务内容' });
  get.mockResolvedValueOnce(next);
  events.mockResolvedValueOnce(page(next));
  await act(async () => renderer!.update(view({ task: next })));
  await act(async () => oldHistory.resolve(page(task({ goal: '旧任务内容' }))));
  expect(text()).toContain('新任务内容');
  expect(text()).not.toContain('旧任务内容');
  expect(text()).not.toContain(task().goal);
});

test('cancellation rechecks permission and refuses when a queued task has started', async () => {
  await act(async () => {
    renderer = TestRenderer.create(view());
  });
  const running = task({
    revision: 2,
    status: 'running',
    phase: 'validating',
    allowedActions: [],
  });
  get.mockResolvedValue(running);
  events.mockResolvedValue(page(running));
  await act(async () => press('miao-task-cancel'));
  expect(decide).not.toHaveBeenCalled();
  expect(text()).toContain('当前不能取消');
  expect(text()).toContain('正在执行');
});

test('duplicate cancel gestures dispatch once and stale reads cannot overwrite the result', async () => {
  await act(async () => {
    renderer = TestRenderer.create(view());
  });
  const oldRead = deferred<AITaskDTO>();
  get.mockReturnValueOnce(oldRead.promise);
  await act(async () => jest.advanceTimersByTime(3000));
  const cancelled = task({
    revision: 2,
    status: 'cancelled',
    phase: 'cancelled',
    allowedActions: [],
  });
  const decision = deferred<AITaskDTO>();
  decide.mockReturnValueOnce(decision.promise);
  let cancellation!: Promise<void>;
  act(() => {
    cancellation = press('miao-task-cancel');
    press('miao-task-cancel');
  });
  await act(async () => Promise.resolve());
  expect(decide).toHaveBeenCalledTimes(1);
  expect(decide).toHaveBeenCalledWith('owner-a', task(), 'cancel');
  get.mockResolvedValue(cancelled);
  events.mockResolvedValue(page(cancelled));
  await act(async () => {
    decision.resolve(cancelled);
    await cancellation;
  });
  await act(async () => oldRead.resolve(task()));
  expect(text()).toContain('已取消');
  expect(
    renderer!.root.findAllByProps({ testID: 'miao-task-cancel' }),
  ).toHaveLength(0);
});

test('cancellation uses the freshly read revision and ignores its completion after account changes', async () => {
  const queued = task({
    kind: 'site_draft',
    agentId: 'site-builder',
    threadId: null,
    inputMessageId: null,
  });
  get.mockResolvedValueOnce(queued);
  events.mockResolvedValueOnce(page(queued));
  await act(async () => {
    renderer = TestRenderer.create(view({ task: queued }));
  });
  const waiting = {
    ...queued,
    revision: 3,
    status: 'awaiting_confirmation' as const,
    phase: 'awaiting_confirmation',
  };
  get.mockResolvedValueOnce(waiting);
  const decision = deferred<AITaskDTO>();
  decide.mockReturnValueOnce(decision.promise);
  let cancellation!: Promise<void>;
  act(() => {
    cancellation = press('miao-task-cancel');
  });
  await act(async () => Promise.resolve());
  expect(decide).toHaveBeenCalledWith('owner-a', waiting, 'cancel');
  const replacement = task({ goal: '另一个账号的任务' });
  get.mockResolvedValueOnce(replacement);
  events.mockResolvedValueOnce(page(replacement));
  await act(async () => renderer!.update(view({ token: 'owner-b' })));
  await act(async () => {
    decision.resolve({
      ...waiting,
      goal: '旧账号的任务',
      revision: 4,
      status: 'cancelled',
      phase: 'cancelled',
      allowedActions: [],
    });
    await cancellation;
  });
  expect(text()).toContain('另一个账号的任务');
  expect(text()).not.toContain('旧账号的任务');
  expect(get).toHaveBeenLastCalledWith('owner-b', 'task-1');
});

test('approval opens the existing preview and never directly confirms or invents a retry action', async () => {
  const waiting = task({
    kind: 'site_draft',
    agentId: 'site-builder',
    threadId: null,
    inputMessageId: null,
    status: 'awaiting_confirmation',
    phase: 'awaiting_confirmation',
    revision: 3,
    allowedActions: ['confirm', 'reject', 'cancel'],
    approval: {
      id: 'approval',
      draftId: 'draft',
      draftHash: 'h',
      profileHash: 'p',
      expiresAt: '2026-12-01T00:00:00Z',
    },
  });
  get.mockResolvedValue(waiting);
  events.mockResolvedValue(page(waiting));
  const open = jest.fn();
  await act(async () => {
    renderer = TestRenderer.create(view({ task: waiting, onOpenSource: open }));
  });
  expect(text()).toContain('打开建站预览');
  expect(text()).not.toContain('确认应用');
  act(() => press('miao-task-open-source'));
  expect(open).toHaveBeenCalledWith(waiting);
  expect(decide).not.toHaveBeenCalled();
  const interrupted = task({
    status: 'interrupted',
    phase: 'interrupted',
    revision: 4,
    allowedActions: [],
  });
  get.mockResolvedValue(interrupted);
  events.mockResolvedValue(page(interrupted));
  await act(async () => renderer!.update(view({ task: interrupted })));
  expect(text()).toContain('不会自动重试');
  expect(text()).not.toContain('取消任务');
});

test('polling pauses in background and on sign-out, clearing private content after a missing task', async () => {
  let changeState!: (state: AppStateStatus) => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, callback) => {
      changeState = callback;
      return { remove: jest.fn() };
    });
  const privateTask = task({
    contextRefs: [
      {
        kind: 'station-album',
        id: 'private-album',
        title: '私人旅行相册',
        version: '1',
      },
    ],
  });
  get.mockResolvedValue(privateTask);
  events.mockResolvedValue(page(privateTask));
  await act(async () => {
    renderer = TestRenderer.create(view({ task: privateTask }));
  });
  await act(async () => changeState('background'));
  expect(text()).not.toContain(privateTask.goal);
  expect(text()).not.toContain('私人旅行相册');
  expect(
    renderer!.root.findByProps({ testID: 'miao-task-workspace-background' }),
  ).toBeTruthy();
  const calls = get.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(9000));
  expect(get).toHaveBeenCalledTimes(calls);
  get.mockRejectedValueOnce(
    new MiaoxunApiError('任务已不可用', { status: 404 }),
  );
  await act(async () => changeState('active'));
  expect(text()).toContain('任务已不可用');
  expect(text()).not.toContain(task().goal);
  await act(async () => renderer!.update(view({ token: '' })));
  const signedOutCalls = get.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(9000));
  expect(get).toHaveBeenCalledTimes(signedOutCalls);
  expect(text()).toContain('登录后查看任务');
  expect(text()).not.toContain(task().goal);
});
