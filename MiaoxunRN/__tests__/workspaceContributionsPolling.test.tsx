import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useWorkspaceContributions } from '../src/features/messages/useWorkspaceContributions';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';

jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { contributions: jest.fn() },
}));
const api = jest.mocked(agentWorkspaceApi);
let tree: TestRenderer.ReactTestRenderer;
let value: ReturnType<typeof useWorkspaceContributions>;
function Harness({ token }: { token: string }) {
  value = useWorkspaceContributions(token, 'album-manager');
  return null;
}
const contribution = (id: string, status: 'running' | 'succeeded') => ({
  workspace: agentWorkspace({ id }),
  step: workspaceStep({ id, agentId: 'album-manager', status }),
});
beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  api.contributions.mockReset();
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.useRealTimers();
});
test('polling updates multiple contributions and clears them on access failure', async () => {
  api.contributions.mockResolvedValueOnce({
    contributions: [
      contribution('one', 'running'),
      contribution('two', 'succeeded'),
    ],
    unavailable: 0,
    hasMore: false,
  });
  await act(async () => {
    tree = TestRenderer.create(<Harness token="a" />);
  });
  expect(value.contributions).toHaveLength(2);
  api.contributions.mockResolvedValueOnce({
    contributions: [contribution('one', 'succeeded')],
    unavailable: 1,
    hasMore: false,
  });
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(value.contributions[0].step.status).toBe('succeeded');
  expect(value.unavailable).toBe(1);
  api.contributions.mockRejectedValueOnce(new Error('授权已撤回'));
  await act(async () => {
    jest.advanceTimersByTime(15000);
  });
  expect(value.contributions).toEqual([]);
  expect(value.error).toBe('授权已撤回');
});
test('account change ignores an in-flight response for the previous account', async () => {
  let resolve!: (value: Awaited<ReturnType<typeof api.contributions>>) => void;
  api.contributions.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  api.contributions.mockResolvedValueOnce({
    contributions: [contribution('new', 'running')],
    unavailable: 0,
    hasMore: false,
  });
  await act(async () => {
    tree = TestRenderer.create(<Harness token="old" />);
  });
  await act(async () => {
    tree.update(<Harness token="new" />);
  });
  await act(async () => {
    resolve({
      contributions: [contribution('old', 'running')],
      unavailable: 0,
      hasMore: false,
    });
  });
  expect(value.contributions.map(item => item.workspace.id)).toEqual(['new']);
});

test('background clears cached content and ignores the in-flight response', async () => {
  let changed!: (state: AppStateStatus) => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      changed = listener;
      return { remove: jest.fn() };
    });
  let resolve!: (value: Awaited<ReturnType<typeof api.contributions>>) => void;
  api.contributions.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    tree = TestRenderer.create(<Harness token="a" />);
  });
  await act(async () => {
    changed('background');
  });
  await act(async () => {
    resolve({
      contributions: [contribution('old', 'running')],
      unavailable: 0,
      hasMore: false,
    });
  });
  expect(value.contributions).toEqual([]);
  api.contributions.mockResolvedValueOnce({
    contributions: [contribution('fresh', 'succeeded')],
    unavailable: 0,
    hasMore: false,
  });
  await act(async () => {
    changed('active');
  });
  expect(value.contributions.map(item => item.workspace.id)).toEqual(['fresh']);
  jest.restoreAllMocks();
});
