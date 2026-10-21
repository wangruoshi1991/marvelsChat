import React from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { AppState, AppStateStatus } from 'react-native';
import { WorkspaceSubmissionRecovery } from '../src/features/workspaces/WorkspaceSubmission';
import { WorkspaceButton } from '../src/shared/workspaceUi';
import { palettes } from '../src/shared/theme';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { workspaceAttemptStore } from '../src/services/workspaceAttemptStore';
import { setAIContractSession } from '../src/services/aiContract';
import { agentWorkspace } from '../__fixtures__/agentWorkspace';
import { MiaoxunApiError } from '../src/services/api/http';
jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { create: jest.fn() },
}));
jest.mock('../src/services/workspaceAttemptStore', () => ({
  workspaceAttemptStore: { read: jest.fn(), save: jest.fn(), clear: jest.fn() },
}));
const api = jest.mocked(agentWorkspaceApi);
const store = jest.mocked(workspaceAttemptStore);
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
let tree: TestRenderer.ReactTestRenderer;
let appState: (state: AppStateStatus) => void;
const created = jest.fn();
const props = {
  token: 'token',
  userId: 'user',
  palette: palettes.light,
  language: 'zh' as const,
  onCreated: created,
};
const savedAttempt = {
  goal: '原来的旅行页面',
  source: { page: 'miao.feed', module: 'task-feed' },
  contextRefs: [],
  idempotencyKey: 'original-pending-key',
};
const render = async (extra = {}) => {
  await act(async () => {
    tree = TestRenderer.create(
      <WorkspaceSubmissionRecovery {...props} {...extra} />,
    );
  });
};
const press = () => tree.root.findByType(WorkspaceButton).props.onPress();
beforeEach(() => {
  jest.clearAllMocks();
  store.read.mockResolvedValue(savedAttempt);
  store.save.mockResolvedValue();
  store.clear.mockResolvedValue();
  setAIContractSession('token', { aiTasks: 1, agentWorkspaces: 6 });
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      appState = listener;
      return { remove: jest.fn() };
    });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.restoreAllMocks();
});
test('without an old attempt the recovery UI stays absent and cannot start a new task', async () => {
  store.read.mockResolvedValue(null);
  await render();
  expect(tree.toJSON()).toBeNull();
  expect(api.create).not.toHaveBeenCalled();
  expect(store.save).not.toHaveBeenCalled();
});
test('recovery never submits until pressed and reuses the stored request exactly', async () => {
  api.create.mockResolvedValue(agentWorkspace());
  await render();
  expect(api.create).not.toHaveBeenCalled();
  await act(async () => press());
  expect(api.create).toHaveBeenCalledWith('token', savedAttempt);
  expect(store.save).not.toHaveBeenCalled();
  expect(created).toHaveBeenCalledWith(agentWorkspace());
  expect(tree.toJSON()).toBeNull();
});
test('unknown HTTP response retries the original saved goal/key across rerenders', async () => {
  api.create.mockRejectedValueOnce(new Error('连接中断'));
  api.create.mockResolvedValueOnce(agentWorkspace());
  await render();
  await act(async () => press());
  const first = api.create.mock.calls[0][1];
  await act(async () =>
    tree.update(<WorkspaceSubmissionRecovery {...props} />),
  );
  await act(async () => press());
  expect(api.create.mock.calls[1][1]).toEqual(first);
  expect(store.clear).toHaveBeenCalledWith('user', first.idempotencyKey);
});
test('reopening loads the existing scoped attempt, never creates another key', async () => {
  const saved = { ...savedAttempt, idempotencyKey: 'previous-key' };
  store.read.mockResolvedValue(saved);
  api.create.mockResolvedValue(agentWorkspace());
  await render();
  await act(async () => press());
  expect(api.create).toHaveBeenCalledWith('token', saved);
});
test('failed recovery storage reads are explicit and can be retried without HTTP', async () => {
  store.read.mockRejectedValueOnce(new Error('无法读取上次提交'));
  await render();
  expect(tree.root.findByType(WorkspaceButton).props.label).toBe(
    '重试读取上次提交',
  );
  expect(api.create).not.toHaveBeenCalled();
  await act(async () => press());
  expect(store.read).toHaveBeenCalledTimes(2);
  expect(tree.root.findByType(WorkspaceButton).props.label).toBe(
    '恢复上次协作提交',
  );
  expect(api.create).not.toHaveBeenCalled();
});
test('account changes discard the old UI completion but clean only original attempt', async () => {
  const call = deferred<ReturnType<typeof agentWorkspace>>();
  api.create.mockReturnValue(call.promise);
  await render();
  act(() => {
    press();
  });
  await act(async () => {});
  const submission = api.create.mock.calls[0][1];
  await act(async () =>
    tree.update(
      <WorkspaceSubmissionRecovery
        {...props}
        token="new-token"
        userId="new-user"
      />,
    ),
  );
  await act(async () => call.resolve(agentWorkspace()));
  expect(created).not.toHaveBeenCalled();
  expect(store.clear).toHaveBeenCalledWith('user', submission.idempotencyKey);
});
test('background never submits and foreground preserves an accepted result', async () => {
  const call = deferred<ReturnType<typeof agentWorkspace>>();
  api.create.mockReturnValue(call.promise);
  await render();
  act(() => {
    press();
  });
  await act(async () => {});
  await act(async () => appState('background'));
  await act(async () => call.resolve(agentWorkspace()));
  expect(created).not.toHaveBeenCalled();
  await act(async () => appState('active'));
  expect(created).toHaveBeenCalledTimes(1);
});
test('a pending legacy request remains visible but cannot run with an unsupported service contract', async () => {
  setAIContractSession('token', { aiTasks: 1, agentWorkspaces: 1 });
  await render();
  expect(tree.root.findByType(WorkspaceButton).props.disabled).toBe(true);
  await act(async () => press());
  expect(api.create).not.toHaveBeenCalled();
  expect(store.clear).not.toHaveBeenCalled();
});

const rejectedReceipt = (key: string) =>
  new MiaoxunApiError('引用内容已变化，请重新选择后发送。', {
    status: 409,
    code: 'AI_CONTEXT_CHANGED',
    details: { submissionOutcome: 'rejected', idempotencyKey: key },
  });
test('a committed rejection clears recovery without exposing a second new-submit path', async () => {
  api.create.mockRejectedValueOnce(
    rejectedReceipt(savedAttempt.idempotencyKey),
  );
  await render();
  await act(async () => press());
  expect(store.clear).toHaveBeenCalledWith('user', savedAttempt.idempotencyKey);
  expect(created).not.toHaveBeenCalled();
  expect(tree.root.findAllByType(WorkspaceButton)).toHaveLength(0);
  expect(api.create).toHaveBeenCalledTimes(1);
});
test('a rejection recovered after a lost response clears only the restored original key', async () => {
  const saved = { ...savedAttempt, idempotencyKey: 'lost-rejection-key' };
  store.read.mockResolvedValue(saved);
  api.create.mockRejectedValueOnce(rejectedReceipt(saved.idempotencyKey));
  await render();
  await act(async () => press());
  expect(api.create).toHaveBeenCalledWith('token', saved);
  expect(store.clear).toHaveBeenCalledWith('user', saved.idempotencyKey);
  expect(tree.root.findAllByType(WorkspaceButton)).toHaveLength(0);
});
test('failed rejection cleanup retries local persistence without sending the rejected request again', async () => {
  api.create.mockImplementationOnce(async (_token, input) => {
    throw rejectedReceipt(input.idempotencyKey);
  });
  store.clear.mockRejectedValueOnce(new Error('Keychain unavailable'));
  await render();
  await act(async () => press());
  expect(tree.root.findByType(WorkspaceButton).props.label).toBe(
    '清理已拒绝的提交',
  );
  expect(api.create).toHaveBeenCalledTimes(1);
  await act(async () => press());
  expect(store.clear).toHaveBeenCalledTimes(2);
  expect(api.create).toHaveBeenCalledTimes(1);
  expect(tree.root.findAllByType(WorkspaceButton)).toHaveLength(0);
});
test.each([
  new Error('Malformed successful DTO'),
  new MiaoxunApiError('Unauthorized', { status: 401 }),
  new MiaoxunApiError('Server error', { status: 500 }),
  new MiaoxunApiError('Scope missing without a durable outcome', {
    status: 403,
    code: 'WORKSPACE_ACCESS_REQUIRED',
  }),
  new MiaoxunApiError('Conflict without a durable outcome', {
    status: 409,
    code: 'AI_CONTEXT_CHANGED',
  }),
  new MiaoxunApiError('Wrong receipt', {
    status: 409,
    details: { submissionOutcome: 'rejected', idempotencyKey: 'another-key' },
  }),
  new MiaoxunApiError('Network error', { isNetworkError: true }),
])('unknown acceptance remains bound to the same key: %s', async issue => {
  api.create.mockRejectedValueOnce(issue);
  api.create.mockResolvedValueOnce(agentWorkspace());
  await render();
  await act(async () => press());
  const first = api.create.mock.calls[0][1];
  expect(store.clear).not.toHaveBeenCalled();
  await act(async () =>
    tree.update(<WorkspaceSubmissionRecovery {...props} />),
  );
  await act(async () => press());
  expect(api.create.mock.calls[1][1]).toEqual(first);
});
test('late rejected outcome cleans only its original account and does not replace the new account draft', async () => {
  const call = deferred<ReturnType<typeof agentWorkspace>>();
  api.create.mockReturnValueOnce(call.promise);
  await render();
  act(() => {
    press();
  });
  await act(async () => {});
  const first = api.create.mock.calls[0][1];
  await act(async () =>
    tree.update(
      <WorkspaceSubmissionRecovery
        {...props}
        token="new-token"
        userId="new-user"
      />,
    ),
  );
  await act(async () => call.reject(rejectedReceipt(first.idempotencyKey)));
  expect(store.clear).toHaveBeenCalledWith('user', first.idempotencyKey);
  expect(created).not.toHaveBeenCalled();
});
