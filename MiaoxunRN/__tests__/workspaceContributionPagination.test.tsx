import React from 'react';
import { AppState } from 'react-native';
import TestRenderer, { act } from 'react-test-renderer';
import { useWorkspaceContributions } from '../src/features/messages/useWorkspaceContributions';
import { agentWorkspaceApi } from '../src/services/api/agentWorkspaceApi';
import { agentWorkspace, workspaceStep } from '../__fixtures__/agentWorkspace';

jest.mock('../src/services/api/agentWorkspaceApi', () => ({
  agentWorkspaceApi: { contributions: jest.fn(), contribution: jest.fn() },
}));
const api = jest.mocked(agentWorkspaceApi);
const item = (id: string) => ({
  workspace: agentWorkspace({ id }),
  step: workspaceStep({ id, agentId: 'album-manager', status: 'succeeded' }),
});
const page = (ids: string[], nextCursor: string | null) => ({
  contributions: ids.map(item),
  unavailable: 0,
  unavailableReasons: {
    authorization: 0,
    source: 0,
    version: 0,
    unavailable: 0,
  },
  hasMore: nextCursor !== null,
  nextCursor,
  scannedIds: ids,
});
let current: ReturnType<typeof useWorkspaceContributions>;
let tree: TestRenderer.ReactTestRenderer;
function Harness({
  token,
  selected,
}: {
  token: string;
  selected?: { id: string; nodeId: string };
}) {
  current = useWorkspaceContributions(token, 'album-manager', selected);
  return null;
}
beforeEach(() => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  api.contributions.mockReset();
  api.contribution.mockReset();
});
afterEach(() => {
  if (tree) act(() => tree.unmount());
  jest.useRealTimers();
});

test('loads older contributions and revalidates all pages before showing refreshed content', async () => {
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockResolvedValueOnce(page(['old'], null));
  await act(async () => {
    await current.loadMore();
  });
  expect(current.contributions.map(c => c.step.id)).toEqual(['new', 'old']);
  expect(api.contributions).toHaveBeenLastCalledWith(
    'owner',
    'album-manager',
    'cursor',
  );
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockRejectedValueOnce(new Error('授权已撤回'));
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(current.contributions).toEqual([]);
  expect(current.error).toContain('授权已撤回');
});

test('revalidates unavailable reasons across history pages and retry clears recovered reasons', async () => {
  const latest = {
    ...page(['visible', 'hidden-source'], 'hidden-source'),
    contributions: [item('visible')],
    unavailable: 1,
    unavailableReasons: {
      authorization: 0,
      source: 1,
      version: 0,
      unavailable: 0,
    },
  };
  api.contributions.mockResolvedValueOnce(latest);
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  expect(current.unavailableReasons.source).toBe(1);
  api.contributions.mockResolvedValueOnce(latest);
  api.contributions.mockResolvedValueOnce({
    ...page(['hidden-auth', 'hidden-version'], null),
    contributions: [],
    unavailable: 2,
    unavailableReasons: {
      authorization: 1,
      source: 0,
      version: 1,
      unavailable: 0,
    },
  });
  await act(async () => {
    await current.loadMore();
  });
  expect(current.unavailable).toBe(3);
  expect(current.unavailableReasons).toEqual({
    authorization: 1,
    source: 1,
    version: 1,
    unavailable: 0,
  });
  api.contributions.mockResolvedValueOnce(
    page(['visible', 'hidden-source', 'hidden-auth', 'hidden-version'], null),
  );
  await act(async () => {
    await current.retry();
  });
  expect(current.unavailable).toBe(0);
  expect(current.unavailableReasons).toEqual({
    authorization: 0,
    source: 0,
    version: 0,
    unavailable: 0,
  });
  api.contributions.mockRejectedValueOnce(new Error('网络不可用'));
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(current.error).toBe('网络不可用');
  expect(current.unavailableReasons).toEqual({
    authorization: 0,
    source: 0,
    version: 0,
    unavailable: 0,
  });
});

test('manual retry reports a pending check while scheduled polling remains quiet', async () => {
  api.contributions.mockResolvedValueOnce(page(['visible'], null));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  let resolveRetry!: (result: ReturnType<typeof page>) => void;
  api.contributions.mockReturnValueOnce(
    new Promise(done => {
      resolveRetry = done;
    }),
  );
  let retry!: Promise<void>;
  act(() => {
    retry = current.retry();
  });
  expect(current.loading).toBe(true);
  expect(current.contributions.map(c => c.step.id)).toEqual(['visible']);
  await act(async () => {
    resolveRetry(page(['visible'], null));
    await retry;
  });
  expect(current.loading).toBe(false);
  let resolvePoll!: (result: ReturnType<typeof page>) => void;
  api.contributions.mockReturnValueOnce(
    new Promise(done => {
      resolvePoll = done;
    }),
  );
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(current.loading).toBe(false);
  act(() => {
    current.retry();
  });
  expect(current.loading).toBe(true);
  expect(api.contributions).toHaveBeenCalledTimes(3);
  await act(async () => {
    resolvePoll(page(['visible'], null));
  });
  expect(current.loading).toBe(false);
});

test('refresh retains the loaded history boundary when newer contributions arrive', async () => {
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockResolvedValueOnce(page(['old'], 'cursor2'));
  await act(async () => {
    await current.loadMore();
  });
  api.contributions.mockResolvedValueOnce(page(['newer'], 'cursor0'));
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockResolvedValueOnce(page(['old'], 'cursor2'));
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(current.contributions.map(c => c.step.id)).toEqual([
    'newer',
    'new',
    'old',
  ]);
});

test('a deleted history boundary clears content and requires a fresh retry', async () => {
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockResolvedValueOnce(page(['old'], null));
  await act(async () => {
    await current.loadMore();
  });
  api.contributions.mockResolvedValueOnce(page(['new'], null));
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(current.contributions).toEqual([]);
  expect(current.error).toContain('历史已变化');
  api.contributions.mockResolvedValueOnce(page(['new'], null));
  await act(async () => {
    await current.retry();
  });
  expect(current.contributions.map(c => c.step.id)).toEqual(['new']);
});

test('load more pressed during a refresh runs after that refresh', async () => {
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  let resolve!: (result: ReturnType<typeof page>) => void;
  api.contributions.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  await act(async () => {
    await current.loadMore();
  });
  expect(current.loading).toBe(true);
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockResolvedValueOnce(page(['old'], null));
  await act(async () => {
    resolve(page(['new'], 'cursor'));
  });
  expect(current.contributions.map(c => c.step.id)).toEqual(['new', 'old']);
  expect(current.loading).toBe(false);
});

test('a missing old boundary cannot cause unbounded history requests', async () => {
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockResolvedValueOnce(page(['old'], 'cursor2'));
  await act(async () => {
    await current.loadMore();
  });
  for (let i = 0; i < 52; i += 1) {
    api.contributions.mockResolvedValueOnce(page([`item${i}`], `cursor${i}`));
  }
  const before = api.contributions.mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(api.contributions.mock.calls.length - before).toBe(52);
  expect(current.contributions).toEqual([]);
  expect(current.error).toContain('变化过多');
});

test('switching accounts discards an in-flight history response', async () => {
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="old" />);
  });
  let resolve!: (result: ReturnType<typeof page>) => void;
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockReturnValueOnce(
    new Promise(done => {
      resolve = done;
    }),
  );
  await act(async () => {
    current.loadMore();
  });
  api.contributions.mockResolvedValueOnce(page(['other'], null));
  await act(async () => {
    tree.update(<Harness token="other" />);
  });
  await act(async () => {
    resolve(page(['secret'], null));
  });
  expect(current.contributions.map(c => c.step.id)).toEqual(['other']);
});

test('rejects a selected node if it belongs to a different workspace', async () => {
  api.contributions.mockResolvedValueOnce(page(['node'], null));
  api.contribution.mockResolvedValueOnce(item('node'));
  await act(async () => {
    tree = TestRenderer.create(
      <Harness token="owner" selected={{ id: 'other', nodeId: 'node' }} />,
    );
  });
  expect(api.contribution).toHaveBeenCalledWith(
    'owner',
    'album-manager',
    'node',
  );
  expect(current.error).toContain('重新选择');
  expect(current.contributions).toEqual([]);
});

test('deleted cursor stops automatic retries and permits a fresh first page', async () => {
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockRejectedValueOnce(
    Object.assign(new Error('分页已失效'), {
      code: 'WORKSPACE_CONTRIBUTION_CURSOR_INVALID',
    }),
  );
  await act(async () => {
    await current.loadMore();
  });
  expect(current.contributions).toEqual([]);
  expect(current.error).toContain('分页已失效');
  const calls = api.contributions.mock.calls.length;
  await act(async () => {
    jest.advanceTimersByTime(60000);
  });
  expect(api.contributions).toHaveBeenCalledTimes(calls);
  api.contributions.mockResolvedValueOnce(page(['fresh'], null));
  await act(async () => {
    await current.retry();
  });
  expect(current.contributions.map(c => c.step.id)).toEqual(['fresh']);
});

test('a stalled page revalidation expires previously displayed contributions', async () => {
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  await act(async () => {
    tree = TestRenderer.create(<Harness token="owner" />);
  });
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockResolvedValueOnce(page(['old'], null));
  await act(async () => {
    await current.loadMore();
  });
  api.contributions.mockResolvedValueOnce(page(['new'], 'cursor'));
  api.contributions.mockReturnValueOnce(new Promise(() => {}));
  await act(async () => {
    jest.advanceTimersByTime(10000);
  });
  expect(current.contributions).toHaveLength(2);
  await act(async () => {
    jest.advanceTimersByTime(5000);
  });
  expect(current.contributions).toEqual([]);
  expect(current.error).toContain('超时');
});
