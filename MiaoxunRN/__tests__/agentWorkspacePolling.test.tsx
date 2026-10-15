import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useAgentWorkspaces } from '../src/features/workspaces/useAgentWorkspaces';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { MiaoxunApiError } from '../src/services/api/http';
import { AgentWorkspace } from '../src/models/agentWorkspace';
import { agentWorkspace } from '../__fixtures__/agentWorkspace';
jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { list: jest.fn() },
}));
const api = jest.mocked(agentWorkspaceApi);
const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>(a => {
    resolve = a;
  });
  return { promise, resolve };
};
let tree: TestRenderer.ReactTestRenderer;
let state: (value: AppStateStatus) => void;
let value: ReturnType<typeof useAgentWorkspaces>;
function Harness({ token = 'token', active = true }) {
  value = useAgentWorkspaces({ token, active });
  return null;
}
beforeEach(() => {
  jest.useFakeTimers();
  api.list.mockReset();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      state = listener;
      return { remove: jest.fn() };
    });
});
afterEach(async () => {
  if (tree) await act(async () => tree.unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});
test('switching account clears visible list and ignores the old account response', async () => {
  const old = deferred<AgentWorkspace[]>();
  api.list.mockReturnValueOnce(old.promise);
  api.list.mockResolvedValueOnce([agentWorkspace({ id: 'new' })]);
  await act(async () => {
    tree = TestRenderer.create(<Harness />);
  });
  await act(async () => tree.update(<Harness token="other" />));
  expect(value.workspaces[0].id).toBe('new');
  await act(async () => old.resolve([agentWorkspace({ id: 'old' })]));
  expect(value.workspaces[0].id).toBe('new');
});
test('background invalidates in-flight reply and stops polling', async () => {
  const call = deferred<AgentWorkspace[]>();
  api.list.mockReturnValue(call.promise);
  await act(async () => {
    tree = TestRenderer.create(<Harness />);
  });
  await act(async () => state('background'));
  await act(async () => call.resolve([agentWorkspace()]));
  expect(value.workspaces).toEqual([]);
  await act(async () => {
    jest.advanceTimersByTime(9000);
  });
  expect(api.list).toHaveBeenCalledTimes(1);
  api.list.mockResolvedValue([agentWorkspace({ id: 'fresh' })]);
  await act(async () => state('active'));
  expect(value.workspaces[0].id).toBe('fresh');
});
test('older revision cannot revert current progress and denied ownership removes cached content', async () => {
  api.list.mockResolvedValueOnce([agentWorkspace({ revision: 5 })]);
  await act(async () => {
    tree = TestRenderer.create(<Harness />);
  });
  api.list.mockResolvedValueOnce([agentWorkspace({ revision: 3 })]);
  await act(async () => value.refresh());
  expect(value.workspaces[0].revision).toBe(5);
  api.list.mockRejectedValueOnce(
    new MiaoxunApiError('denied', { status: 403 }),
  );
  await act(async () => value.refresh());
  expect(value.workspaces).toEqual([]);
  expect(value.error).toBe('denied');
});
test('inactive task surface performs no network request', async () => {
  await act(async () => {
    tree = TestRenderer.create(<Harness active={false} />);
  });
  await act(async () => value.refresh());
  expect(api.list).not.toHaveBeenCalled();
});
