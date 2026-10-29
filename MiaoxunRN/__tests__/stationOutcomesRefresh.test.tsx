import React, { useRef, useState } from 'react';
import { AppState, AppStateStatus, Text } from 'react-native';
import Renderer, { act } from 'react-test-renderer';
import { StationOutcomesPanel } from '../src/features/station/StationOutcomesPanel';
import { useStationActions } from '../src/features/session/useStationActions';
import { useSessionSetter } from '../src/features/session/useSessionSetter';
import { emptyStationContent } from '../src/features/session/sessionDefaults';
import { StationContentDTO } from '../src/models/api';
import { apiClient } from '../src/services/apiClient';
import { palettes } from '../src/shared/theme';
import { WorkspaceButton } from '../src/shared/workspaceUi';

jest.mock('../src/services/apiClient', () => ({
  apiClient: {
    stationContent: jest.fn(),
    createStationPost: jest.fn(),
    deleteStationPost: jest.fn(),
  },
}));
jest.mock('../src/features/workspaces/useAgentWorkspaces', () => ({
  useAgentWorkspaces: () => ({
    workspaces: [],
    loaded: true,
    error: '',
    refresh: mockWorkspaceRefresh,
  }),
}));
jest.mock('../src/features/site-document/SiteDocumentPreview', () => ({
  SiteDocumentPreview: () => null,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: require('react-native').View,
}));

const mockWorkspaceRefresh = jest.fn(async () => {});
const load = jest.mocked(apiClient.stationContent);
const content = (id: string): StationContentDTO => ({
  ...emptyStationContent,
  siteDrafts: [
    {
      id,
      title: id,
      status: 'applied',
      source: 'model',
      createdAt: '2026-10-15T00:00:00Z',
      updatedAt: null,
    },
  ],
});
const pending = () => {
  let resolve!: (value: StationContentDTO) => void;
  let reject!: (issue: Error) => void;
  const promise = new Promise<StationContentDTO>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
let current: {
  content: StationContentDTO;
  refresh: ReturnType<typeof useStationActions>['refreshStationContent'];
  actions: ReturnType<typeof useStationActions>;
};
function Harness({
  token = 'account-a',
  active = true,
}: {
  token?: string;
  active?: boolean;
}) {
  const [data, setData] = useState(emptyStationContent);
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const setter = useSessionSetter(token, tokenRef, setData);
  const actions = useStationActions({
    token,
    avatarConfig: {},
    setStationContent: setter,
  });
  current = { content: data, refresh: actions.refreshStationContent, actions };
  return (
    <StationOutcomesPanel
      active={active}
      token={token}
      language="zh"
      palette={palettes.light}
      stationContent={data}
      onRefreshStationContent={actions.refreshStationContent}
      onOpenWorkspace={() => {}}
    />
  );
}
let renderer: Renderer.ReactTestRenderer;
let listeners: Set<(state: AppStateStatus) => void>;
const text = () =>
  renderer.root.findAllByType(Text).map(node => node.props.children);
beforeEach(() => {
  load.mockReset();
  jest.mocked(apiClient.createStationPost).mockReset();
  jest.mocked(apiClient.deleteStationPost).mockReset();
  mockWorkspaceRefresh.mockClear();
  AppState.currentState = 'active';
  listeners = new Set();
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((_event, listener) => {
      listeners.add(listener);
      return {
        remove: () => {
          listeners.delete(listener);
        },
      };
    });
});
afterEach(async () => {
  await act(async () => renderer?.unmount());
  jest.restoreAllMocks();
});

test('entering outcomes loads real station content once and stable rerenders do not loop', async () => {
  load.mockResolvedValue(content('saved-page'));
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  expect(load).toHaveBeenCalledWith('account-a');
  expect(current.content.siteDrafts[0].id).toBe('saved-page');
  expect(text()).toContain('已保存页面');
  await act(async () => renderer.update(<Harness />));
  expect(load).toHaveBeenCalledTimes(1);
});

test('a station content failure stays explicit and retry reloads both content sources', async () => {
  load
    .mockRejectedValueOnce(new Error('Network'))
    .mockResolvedValueOnce(content('recovered-page'));
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  expect(text()).toContain('无法读取创作成果，请重试。');
  expect(text()).not.toContain('暂无成果');
  await act(async () =>
    renderer.root.findByType(WorkspaceButton).props.onPress(),
  );
  expect(load).toHaveBeenCalledTimes(2);
  expect(mockWorkspaceRefresh).toHaveBeenCalledTimes(1);
  expect(current.content.siteDrafts[0].id).toBe('recovered-page');
  expect(text()).not.toContain('无法读取创作成果，请重试。');
});

test('leaving aborts the session write and reentering loads fresh data before the older response arrives', async () => {
  const old = pending();
  load
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(content('fresh-page'));
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  await act(async () => renderer.update(<Harness active={false} />));
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => renderer.update(<Harness />));
  expect(current.content.siteDrafts[0].id).toBe('fresh-page');
  await act(async () => old.resolve(content('stale-page')));
  expect(load).toHaveBeenCalledTimes(2);
  expect(current.content.siteDrafts[0].id).toBe('fresh-page');
});

test('backgrounding drops a late failure and foregrounding performs a fresh read', async () => {
  const old = pending();
  load
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(content('foreground-page'));
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  act(() => listeners.forEach(listener => listener('background')));
  await act(async () => old.reject(new Error('Late failure')));
  expect(text()).not.toContain('无法读取创作成果，请重试。');
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => listeners.forEach(listener => listener('active')));
  expect(load).toHaveBeenCalledTimes(2);
  expect(current.content.siteDrafts[0].id).toBe('foreground-page');
});

test('changing account ignores the old response and uses the new session callback', async () => {
  const old = pending();
  load
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(content('account-b-page'));
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  await act(async () => renderer.update(<Harness token="account-b" />));
  await act(async () => old.resolve(content('account-a-page')));
  expect(load.mock.calls.map(args => args[0])).toEqual([
    'account-a',
    'account-b',
  ]);
  expect(current.content.siteDrafts[0].id).toBe('account-b-page');
});

test('a retained retry callback cannot request content for a hidden screen or previous account', async () => {
  load
    .mockRejectedValueOnce(new Error('Network'))
    .mockResolvedValueOnce(content('account-b-page'));
  await act(async () => {
    renderer = Renderer.create(<Harness />);
  });
  const retry = renderer.root.findByType(WorkspaceButton).props.onPress;
  await act(async () => renderer.update(<Harness active={false} />));
  await act(async () => retry());
  expect(load).toHaveBeenCalledTimes(1);
  await act(async () => renderer.update(<Harness token="account-b" />));
  await act(async () => retry());
  expect(load).toHaveBeenCalledTimes(2);
  expect(mockWorkspaceRefresh).not.toHaveBeenCalled();
});

test('an explicitly aborted session refresh never writes content', async () => {
  const request = pending();
  load.mockReturnValueOnce(request.promise);
  await act(async () => {
    renderer = Renderer.create(<Harness active={false} />);
  });
  const controller = new AbortController();
  const refreshing = current.refresh(controller.signal);
  controller.abort();
  await act(async () => {
    request.resolve(content('aborted-page'));
    await refreshing;
  });
  expect(current.content).toEqual(emptyStationContent);
});

test('overlapping global and visible refreshes cannot replace newer content with an older result', async () => {
  const old = pending();
  load
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(content('newer-page'));
  await act(async () => {
    renderer = Renderer.create(<Harness active={false} />);
  });
  const globalRefresh = current.refresh();
  await act(async () => renderer.update(<Harness />));
  await act(async () => {
    old.resolve(content('older-page'));
    await globalRefresh;
  });
  expect(current.content.siteDrafts[0].id).toBe('newer-page');
});

test('a refresh started before a confirmed post save cannot erase the saved post', async () => {
  const old = pending();
  const post = {
    id: 'saved-post',
    userId: 'account-a',
    body: 'Saved content',
    locationLabel: '',
    visibility: 'public' as const,
    agentCapabilities: [],
    media: [],
    commentCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-10-28T00:00:00Z',
  };
  load.mockReturnValueOnce(old.promise);
  jest.mocked(apiClient.createStationPost).mockResolvedValueOnce(post);
  await act(async () => {
    renderer = Renderer.create(<Harness active={false} />);
  });
  const refreshing = current.refresh();
  await act(async () => {
    await current.actions.createStationPost({ body: post.body });
  });
  expect(current.content.posts.map(item => item.id)).toEqual(['saved-post']);
  await act(async () => {
    old.resolve(emptyStationContent);
    await refreshing;
  });
  expect(current.content.posts.map(item => item.id)).toEqual(['saved-post']);
});

test('a pending refresh cannot restore a deleted post and later refreshes still apply', async () => {
  const old = pending();
  const post = {
    id: 'deleted-post',
    userId: 'account-a',
    body: 'Removed content',
    locationLabel: '',
    visibility: 'public' as const,
    agentCapabilities: [],
    media: [],
    commentCount: 0,
    likeCount: 0,
    favoriteCount: 0,
    likedByMe: false,
    favoritedByMe: false,
    createdAt: '2026-10-28T00:00:00Z',
  };
  const stale = { ...emptyStationContent, posts: [post] };
  load
    .mockResolvedValueOnce(stale)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(content('fresh-after-delete'));
  jest.mocked(apiClient.deleteStationPost).mockResolvedValueOnce(undefined);
  await act(async () => {
    renderer = Renderer.create(<Harness active={false} />);
  });
  await act(async () => {
    await current.refresh();
  });
  const refreshing = current.refresh();
  await act(async () => {
    await current.actions.deleteStationPost(post.id);
  });
  await act(async () => {
    old.resolve(stale);
    await refreshing;
  });
  expect(current.content.posts).toEqual([]);
  await act(async () => {
    await current.refresh();
  });
  expect(current.content.siteDrafts[0].id).toBe('fresh-after-delete');
});
