import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useWorkspaceContributions } from '../src/features/messages/useWorkspaceContributions';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';

jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { contributions: jest.fn(), contribution: jest.fn() },
}));
const api = jest.mocked(agentWorkspaceApi);
let tree: TestRenderer.ReactTestRenderer;
let value: ReturnType<typeof useWorkspaceContributions>;
function Harness({
  token,
  selected,
}: {
  token: string;
  selected?: { id: string; nodeId: string };
}) {
  value = useWorkspaceContributions(token, 'album-manager', selected);
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
  api.contribution.mockReset();
});

test('navigation to an older contribution uses its dedicated authorization gate rather than the task snapshot', async () => {
  const old = contribution('old-node', 'succeeded');
  old.step.capability = 'media.select';
  const workspace = { ...old.workspace, steps: [old.step] };
  api.contributions.mockResolvedValue({
    contributions: [],
    hasMore: true,
    nextCursor: 'cursor',
    scannedIds: ['cursor'],
    unavailable: 0,
  });
  api.contribution.mockResolvedValue({ workspace, step: old.step });
  await act(async () => {
    tree = TestRenderer.create(
      <Harness
        token="owner"
        selected={{ id: workspace.id, nodeId: old.step.id }}
      />,
    );
  });
  expect(api.contribution).toHaveBeenCalledWith(
    'owner',
    'album-manager',
    old.step.id,
  );
  expect(value.contributions).toEqual([{ workspace, step: old.step }]);
  api.contribution.mockRejectedValueOnce(new Error('来源已撤回'));
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(value.contributions).toEqual([]);
  expect(value.error).toContain('来源已撤回');
});

test('a navigation request cannot reintroduce an internal coordinator node as Agent contribution', async () => {
  const item = contribution('coord', 'succeeded');
  api.contributions.mockResolvedValue({
    contributions: [],
    hasMore: false,
    nextCursor: null,
    scannedIds: [],
    unavailable: 0,
  });
  api.contribution.mockResolvedValue(null);
  await act(async () => {
    tree = TestRenderer.create(
      <Harness
        token="owner"
        selected={{ id: item.workspace.id, nodeId: item.step.id }}
      />,
    );
  });
  expect(value.contributions).toEqual([]);
  expect(value.error).toContain('重新选择');
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
    nextCursor: null,
    scannedIds: ['one', 'two'],
  });
  await act(async () => {
    tree = TestRenderer.create(<Harness token="a" />);
  });
  expect(value.contributions).toHaveLength(2);
  api.contributions.mockResolvedValueOnce({
    contributions: [contribution('one', 'succeeded')],
    unavailable: 1,
    hasMore: false,
    nextCursor: null,
    scannedIds: ['one', 'two'],
  });
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  expect(value.contributions[0].step.status).toBe('succeeded');
  expect(value.unavailable).toBe(1);
  api.contributions.mockRejectedValueOnce(new Error('授权已撤回'));
  await act(async () => {
    jest.advanceTimersByTime(10000);
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
    nextCursor: null,
    scannedIds: ['new'],
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
      nextCursor: null,
      scannedIds: ['old'],
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
      nextCursor: null,
      scannedIds: ['old'],
    });
  });
  expect(value.contributions).toEqual([]);
  api.contributions.mockResolvedValueOnce({
    contributions: [contribution('fresh', 'succeeded')],
    unavailable: 0,
    hasMore: false,
    nextCursor: null,
    scannedIds: ['fresh'],
  });
  await act(async () => {
    changed('active');
  });
  expect(value.contributions.map(item => item.workspace.id)).toEqual(['fresh']);
  jest.restoreAllMocks();
});

test('inactive and active in one batch reload contributions and ignore old requests', async () => {
  let changed!: (state: AppStateStatus) => void;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      changed = listener;
      return { remove: jest.fn() };
    });
  let resolve!: (result: Awaited<ReturnType<typeof api.contributions>>) => void;
  api.contributions.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    tree = TestRenderer.create(<Harness token="a" />);
  });
  api.contributions.mockResolvedValueOnce({
    contributions: [contribution('fresh', 'succeeded')],
    unavailable: 0,
    hasMore: false,
    nextCursor: null,
    scannedIds: ['fresh'],
  });
  await act(async () => {
    changed('inactive');
    changed('active');
  });
  await act(async () => {
    resolve({
      contributions: [contribution('old', 'succeeded')],
      unavailable: 0,
      hasMore: false,
      nextCursor: null,
      scannedIds: ['old'],
    });
  });
  expect(value.contributions.map(item => item.workspace.id)).toEqual(['fresh']);
  jest.restoreAllMocks();
});
