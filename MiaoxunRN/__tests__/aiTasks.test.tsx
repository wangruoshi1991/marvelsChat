import React from 'react';
import { AppState, AppStateStatus, Text } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { AITaskDTO, assertAITask } from '../src/models/aiTask';
import { mergeTask, useAITasks } from '../src/features/ai/useAITasks';
import { AITaskCard, Confirmation } from '../src/features/ai/AIInteraction';
import { aiTaskApi } from '../src/services/api/aiTaskApi';
import { palettes } from '../src/shared/theme';
import { persistentAssistReference } from '../src/features/ai/assistContext';

jest.mock('../src/services/api/aiTaskApi', () => ({
  aiTaskApi: { list: jest.fn(), decide: jest.fn() },
}));
const list = jest.mocked(aiTaskApi.list);
const decide = jest.mocked(aiTaskApi.decide);
const task = (changes: Partial<AITaskDTO> = {}): AITaskDTO => ({
  id: 'task-1',
  contractVersion: 1,
  kind: 'agent_message',
  agentId: 'album-manager',
  agentVersion: '1',
  goal: '用户的真实请求',
  threadId: 'thread-1',
  inputMessageId: 'message-1',
  status: 'queued',
  revision: 1,
  phase: 'queued',
  contextRefs: [],
  artifacts: [],
  approval: null,
  error: null,
  createdAt: '2026-10-10T00:00:00Z',
  updatedAt: '2026-10-10T00:00:00Z',
  allowedActions: ['cancel'],
  ...changes,
});
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
};
let controller: ReturnType<typeof useAITasks>;
let renderer: TestRenderer.ReactTestRenderer;
function Harness({
  token = 'owner-a',
  threadId = 'thread-1',
  active = true,
  ready = jest.fn(),
}: {
  token?: string;
  threadId?: string;
  active?: boolean;
  ready?: (task: AITaskDTO) => Promise<void> | void;
}) {
  controller = useAITasks({
    token,
    threadId,
    active,
    kind: 'agent_message',
    onTaskReady: ready,
  });
  return null;
}
beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  list.mockResolvedValue([]);
});
afterEach(() => {
  if (renderer) act(() => renderer.unmount());
  jest.restoreAllMocks();
  jest.useRealTimers();
});

test('restores persisted tasks and refreshes results once per terminal revision', async () => {
  const ready = jest.fn();
  list.mockResolvedValueOnce([task()]).mockResolvedValue([
    task({
      status: 'succeeded',
      revision: 3,
      phase: 'completed',
      allowedActions: [],
    }),
  ]);
  await act(async () => {
    renderer = TestRenderer.create(<Harness ready={ready} />);
  });
  expect(controller.tasks[0].status).toBe('queued');
  expect(ready).not.toHaveBeenCalled();
  await act(async () => jest.advanceTimersByTime(3000));
  expect(controller.tasks[0].status).toBe('succeeded');
  expect(ready).toHaveBeenCalledTimes(1);
  await act(async () => jest.advanceTimersByTime(3000));
  expect(ready).toHaveBeenCalledTimes(1);
  expect(list).toHaveBeenCalledWith('owner-a', {
    kind: 'agent_message',
    threadId: 'thread-1',
  });
});

test('account and thread changes discard old requests and clear their tasks immediately', async () => {
  const old = deferred<AITaskDTO[]>();
  list
    .mockReturnValueOnce(old.promise)
    .mockResolvedValue([task({ id: 'new-task', threadId: 'thread-2' })]);
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  await act(async () =>
    renderer.update(<Harness token="owner-b" threadId="thread-2" />),
  );
  await act(async () => old.resolve([task()]));
  expect(controller.tasks.map(item => item.id)).toEqual(['new-task']);
  expect(list).toHaveBeenLastCalledWith('owner-b', {
    kind: 'agent_message',
    threadId: 'thread-2',
  });
});

test('stops polling offscreen and in background, and refreshes on foreground', async () => {
  let appStateChange!: (state: AppStateStatus) => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_type, callback) => {
      appStateChange = callback;
      return { remove: jest.fn() };
    });
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  await act(async () => renderer.update(<Harness active={false} />));
  const pausedCalls = list.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(12000));
  expect(list).toHaveBeenCalledTimes(pausedCalls);
  await act(async () => renderer.update(<Harness />));
  await act(async () => appStateChange('background'));
  const backgroundCalls = list.mock.calls.length;
  await act(async () => jest.advanceTimersByTime(12000));
  expect(list).toHaveBeenCalledTimes(backgroundCalls);
  await act(async () => appStateChange('active'));
  expect(list).toHaveBeenCalledTimes(backgroundCalls + 1);
});

test('a stale list cannot replace a newer decision and duplicate clicks submit once', async () => {
  list.mockResolvedValueOnce([task()]);
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  const oldList = deferred<AITaskDTO[]>();
  list.mockReturnValueOnce(oldList.promise);
  let listRequest!: Promise<void>;
  act(() => {
    listRequest = controller.refresh();
  });
  const decision = deferred<AITaskDTO>();
  decide.mockReturnValueOnce(decision.promise);
  let decisionRequest!: Promise<void>;
  act(() => {
    decisionRequest = controller.decide(task(), 'cancel');
    controller.decide(task(), 'cancel');
  });
  await act(async () => {
    decision.resolve(
      task({ status: 'cancelled', revision: 2, allowedActions: [] }),
    );
    await decisionRequest;
  });
  await act(async () => {
    oldList.resolve([task()]);
    await listRequest;
  });
  expect(decide).toHaveBeenCalledTimes(1);
  expect(controller.tasks[0].status).toBe('cancelled');
});

test('running and interrupted tasks never offer a fabricated cancellation or retry', () => {
  act(() => {
    renderer = TestRenderer.create(
      <AITaskCard
        task={task({ status: 'running', allowedActions: [] })}
        palette={palettes.light}
        language="zh"
        onDecision={jest.fn()}
      />,
    );
  });
  const text = () =>
    renderer.root
      .findAllByType(Text)
      .map(node => node.props.children)
      .join(' ');
  expect(text()).not.toContain('取消任务');
  act(() =>
    renderer.update(
      <AITaskCard
        task={task({ status: 'interrupted', allowedActions: [] })}
        palette={palettes.light}
        language="zh"
        onDecision={jest.fn()}
      />,
    ),
  );
  expect(text()).toContain('不会自动重试');
});

test('confirmation expires locally and only enables a previewed, server-allowed decision', () => {
  const waiting = task({
    status: 'awaiting_confirmation',
    allowedActions: ['confirm', 'reject'],
    approval: {
      id: 'approval',
      draftId: 'draft',
      draftHash: 'h',
      profileHash: 'p',
      expiresAt: new Date(Date.now() + 1000).toISOString(),
    },
  });
  act(() => {
    renderer = TestRenderer.create(
      <Confirmation
        task={waiting}
        palette={palettes.light}
        language="zh"
        canConfirm={false}
        busy={false}
        onDecision={jest.fn()}
      />,
    );
  });
  const confirm = () =>
    renderer.root
      .findAll(node => typeof node.props.onPress === 'function')
      .find(node =>
        node
          .findAllByType(Text)
          .some(label => label.props.children === '确认保存'),
      )!;
  expect(confirm().props.disabled).toBe(true);
  act(() =>
    renderer.update(
      <Confirmation
        task={waiting}
        palette={palettes.light}
        language="zh"
        canConfirm
        busy={false}
        onDecision={jest.fn()}
      />,
    ),
  );
  expect(confirm().props.disabled).toBe(false);
  act(() => jest.advanceTimersByTime(1001));
  expect(confirm().props.disabled).toBe(true);
});

test('unsupported task contracts fail explicitly, and local drafts never become resource refs', () => {
  expect(() => assertAITask({ ...task(), contractVersion: 2 })).toThrow(
    '不受支持',
  );
  expect(() => assertAITask({ ...task(), status: 'unknown' })).toThrow(
    '不受支持',
  );
  expect(
    persistentAssistReference({
      kind: 'chat-draft',
      id: 'thread-1',
      title: 'Draft',
    }),
  ).toBeNull();
  expect(
    persistentAssistReference({
      kind: 'avatar-3d',
      id: 'model-1',
      title: 'Avatar',
    }),
  ).toBeNull();
  expect(
    persistentAssistReference({
      kind: 'chat-message',
      id: 'local-123',
      title: 'Pending',
    }),
  ).toBeNull();
  expect(
    persistentAssistReference({
      kind: 'station-album',
      id: 'album-1',
      title: 'My album',
    }),
  ).toEqual({ kind: 'station-album', id: 'album-1', title: 'My album' });
});

test('active tasks remain visible when newer terminal history exceeds the list limit', () => {
  const history = Array.from({ length: 30 }, (_, index) =>
    task({
      id: `done-${index}`,
      status: 'succeeded',
      createdAt: '2026-10-11T00:00:00Z',
      allowedActions: [],
    }),
  );
  const merged = mergeTask(history, task());
  expect(merged).toHaveLength(30);
  expect(merged[0].id).toBe('task-1');
});

test('restoring multiple completed tasks refreshes their shared result source once', async () => {
  const ready = jest.fn();
  list.mockResolvedValue(
    Array.from({ length: 5 }, (_, index) =>
      task({ id: `done-${index}`, status: 'succeeded', allowedActions: [] }),
    ),
  );
  await act(async () => {
    renderer = TestRenderer.create(<Harness ready={ready} />);
  });
  expect(ready).toHaveBeenCalledTimes(1);
});
