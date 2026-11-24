import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { Alert, TextInput } from 'react-native';
import { SearchScreen } from '../src/features/search/SearchScreen';
import { palettes } from '../src/shared/theme';
import { apiClient } from '../src/services/apiClient';
import { useMessageActions } from '../src/features/session/useMessageActions';
import { useSocialActions } from '../src/features/session/useSocialActions';

type Pending<T> = { promise: Promise<T>; resolve: (value: T) => void };
function pending<T>(): Pending<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}

test('after an account switch the previous friend and history actions cannot update or dispatch', async () => {
  const setThreads = jest.fn(),
    setSearchHistory = jest.fn();
  let actions!: ReturnType<typeof useSocialActions> &
    ReturnType<typeof useMessageActions>;
  function Harness({ token }: { token: string }) {
    actions = {
      ...useSocialActions({
        token,
        setSearchHistory,
        setRelationships: jest.fn(),
      }),
      ...useMessageActions({
        token,
        threads: [],
        setThreads,
        setErrorMessage: jest.fn(),
        makeButlerContext: jest.fn(),
      }),
    };
    return null;
  }
  const friend = pending<Awaited<ReturnType<typeof apiClient.friendThread>>>();
  const history =
    pending<Awaited<ReturnType<typeof apiClient.saveSearchHistory>>>();
  const profile = pending<Awaited<ReturnType<typeof apiClient.searchUsers>>>();
  const fetchFriend = jest
    .spyOn(apiClient, 'friendThread')
    .mockReturnValue(friend.promise);
  const fetchUsers = jest
    .spyOn(apiClient, 'searchUsers')
    .mockReturnValue(profile.promise);
  jest.spyOn(apiClient, 'saveSearchHistory').mockReturnValue(history.promise);
  const clear = jest
    .spyOn(apiClient, 'clearSearchHistory')
    .mockReturnValue(history.promise);
  jest
    .spyOn(apiClient, 'deleteSearchHistoryItem')
    .mockReturnValue(history.promise);
  let tree!: Renderer.ReactTestRenderer;
  try {
    await act(async () => {
      tree = Renderer.create(<Harness token="A" />);
    });
    const old = actions;
    const open = old.openFriendThread('friend');
    const search = old.searchUsers('query');
    const saved = old.saveSearchQuery('query');
    const removed = old.deleteSearchHistoryItem('entry');
    const cleared = old.clearSearchHistory();
    await act(async () => tree.update(<Harness token="B" />));
    // Returning to the same token still starts a distinct ownership lifetime.
    await act(async () => tree.update(<Harness token="A" />));
    friend.resolve({} as Awaited<ReturnType<typeof apiClient.friendThread>>);
    profile.resolve([
      {
        user: { id: 'A', aiId: 'private-A', displayName: 'Account A' },
        profile: {
          userId: 'A',
          nickname: 'Account A',
          avatarText: 'A',
          avatarConfig: {},
          headline: '',
          publicLocation: '',
          experienceYears: null,
          languages: [],
          bio: '',
          community: '',
          activityArea: '',
          miaoPoints: 0,
          followingCount: 0,
          followersCount: 0,
          likesCount: 0,
          collectionsCount: 0,
        },
        relation: { isSelf: false, isFollowing: false, isFriend: true },
      },
    ]);
    history.resolve([
      { id: 'history-A', query: 'private-A', scope: 'contacts' },
    ]);
    await expect(open).rejects.toThrow('登录账号已切换');
    await expect(search).resolves.toEqual([]);
    await expect(saved).resolves.toEqual([]);
    await Promise.all([removed, cleared]);
    expect(setThreads).not.toHaveBeenCalled();
    expect(setSearchHistory).not.toHaveBeenCalled();
    await expect(old.openFriendThread('friend')).rejects.toThrow();
    await expect(old.clearSearchHistory()).rejects.toThrow();
    await expect(old.searchUsers('query')).rejects.toThrow();
    expect(fetchFriend).toHaveBeenCalledTimes(1);
    expect(fetchUsers).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    await actions.saveSearchQuery('new query');
    expect(setSearchHistory).toHaveBeenCalledTimes(1);
  } finally {
    if (tree) await act(async () => tree.unmount());
    jest.restoreAllMocks();
  }
});

test('a search error and a confirmation from the previous account leave the new search screen alone', async () => {
  let fail!: (reason: Error) => void;
  const saveA = jest.fn(
    () =>
      new Promise<void>((_resolve, reject) => {
        fail = reject;
      }),
  );
  const saveB = jest.fn(async () => {});
  const clear = jest.fn(async () => {});
  const onError = jest.fn();
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const render = (save: (query: string) => Promise<void>) => (
    <SearchScreen
      language="zh"
      palette={palettes.light}
      query="query"
      friends={[]}
      agents={[]}
      threads={[]}
      searchHistory={[{ id: 'item', query: 'query', scope: 'contacts' }]}
      onBack={jest.fn()}
      renderUserAvatar={() => null}
      onChangeQuery={jest.fn()}
      onOpenThread={jest.fn()}
      onOpenFriend={jest.fn()}
      onSaveSearch={save}
      onClearSearchHistory={clear}
      onDeleteSearchHistory={jest.fn()}
      onError={onError}
      onComposeAssistant={jest.fn()}
      onOpenAssistant={jest.fn()}
      onOpenTasks={jest.fn()}
      onAssistantExpandedChange={jest.fn()}
    />
  );
  let tree!: Renderer.ReactTestRenderer;
  try {
    await act(async () => {
      tree = Renderer.create(render(saveA));
    });
    tree.root
      .findByProps({ title: '搜索记录', action: '清除' })
      .props.onAction();
    const confirm = alert.mock.calls[0][2]?.find(
      button => button.style === 'destructive',
    );
    expect(confirm?.onPress).toBeDefined();
    let oldRequest!: Promise<void>;
    act(() => {
      oldRequest = tree.root.findByType(TextInput).props.onSubmitEditing();
    });
    await act(async () => tree.update(render(saveB)));
    await act(async () => {
      confirm?.onPress?.();
      fail(new Error('previous account error'));
      await oldRequest;
    });
    expect(clear).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    await act(async () =>
      tree.root.findByType(TextInput).props.onSubmitEditing(),
    );
    expect(saveB).toHaveBeenCalledWith('query');
  } finally {
    if (tree) await act(async () => tree.unmount());
    jest.restoreAllMocks();
  }
});
