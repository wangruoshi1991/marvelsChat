import React, { useState } from 'react';
import TestRenderer, { act } from 'react-test-renderer';
import { useMessageActions } from '../src/features/session/useMessageActions';
import { useProfileActions } from '../src/features/session/useProfileActions';
import { defaultProfileVisibility } from '../src/features/session/sessionDefaults';
import { SettingsScreen } from '../src/features/settings/SettingsScreen';
import type { ChatThread } from '../src/features/session/sessionTypes';
import type { ThreadStateDTO } from '../src/models/api';
import { apiClient } from '../src/services/apiClient';
import { SettingsSwitchRow } from '../src/shared/settingsUi';
import { palettes } from '../src/shared/theme';

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const state = (partial: Partial<ThreadStateDTO> = {}) => ({
  unreadSequence: 3,
  readSequence: 0,
  muted: false,
  preferencesRevision: 0,
  ...partial,
});

let renderer: TestRenderer.ReactTestRenderer;

afterEach(async () => {
  await act(async () => renderer?.unmount());
  jest.restoreAllMocks();
});

test('a failed read merges server state after another delivery and retries on later entry', async () => {
  const thread: ChatThread = {
    id: 'thread',
    title: 'Chat',
    kind: 'direct',
    pinned: false,
    avatarText: 'C',
    lastContent: '',
    unreadCount: 3,
    ...state(),
    messages: [],
  };
  const write = jest
    .spyOn(apiClient, 'markThreadRead')
    .mockRejectedValueOnce(new Error('Read interrupted'))
    .mockResolvedValueOnce({
      ok: true,
      ...state({ unreadSequence: 4, readSequence: 4 }),
    });
  const read = jest
    .spyOn(apiClient, 'threadState')
    .mockResolvedValueOnce(state({ unreadSequence: 4 }));
  const report = jest.fn();
  let actions!: ReturnType<typeof useMessageActions>;
  let threads!: ChatThread[];
  function Harness() {
    const [current, setThreads] = useState([thread]);
    threads = current;
    actions = useMessageActions({
      token: 'account',
      threads,
      setThreads,
      setErrorMessage: report,
      makeButlerContext: jest.fn(),
    });
    return null;
  }
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  await act(async () => actions.markThreadRead('thread', 3, () => false));
  expect(read).toHaveBeenCalledWith('thread', 'account');
  expect(threads[0].unreadCount).toBe(4);
  expect(report).not.toHaveBeenCalled();
  await act(async () => actions.markThreadRead('thread', 4, () => true));
  expect(write).toHaveBeenLastCalledWith('thread', 'account', 4);
  expect(threads[0].unreadCount).toBe(0);
});

test('a slow mute receipt cannot overwrite a newer switch intent', async () => {
  const first = deferred<{ muted: boolean; preferencesRevision: number }>();
  const write = jest
    .spyOn(apiClient, 'updateThreadPreferences')
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ muted: false, preferencesRevision: 2 });
  jest
    .spyOn(apiClient, 'threadState')
    .mockResolvedValueOnce(state())
    .mockResolvedValueOnce(state({ muted: true, preferencesRevision: 1 }));
  let threads!: ChatThread[];
  let actions!: ReturnType<typeof useMessageActions>;
  function Harness() {
    const [current, setThreads] = useState<ChatThread[]>([
      {
        id: 'thread',
        title: 'Chat',
        kind: 'direct',
        pinned: false,
        avatarText: 'C',
        lastContent: '',
        unreadCount: 3,
        ...state(),
        messages: [],
      },
    ]);
    threads = current;
    actions = useMessageActions({
      token: 'account',
      threads,
      setThreads,
      setErrorMessage: jest.fn(),
      makeButlerContext: jest.fn(),
    });
    return null;
  }
  await act(async () => {
    renderer = TestRenderer.create(<Harness />);
  });
  let turnOn!: Promise<void>;
  let turnOff!: Promise<void>;
  await act(async () => {
    turnOn = actions.setThreadMuted('thread', true);
  });
  await act(async () => {
    turnOff = actions.setThreadMuted('thread', false);
  });
  expect(write).toHaveBeenCalledTimes(1);
  expect(threads[0].pendingMuted).toBe(false);
  await act(async () => {
    first.resolve({ muted: true, preferencesRevision: 1 });
    await Promise.all([turnOn, turnOff]);
  });
  expect(write.mock.calls).toEqual([
    ['thread', { muted: true, baseRevision: 0 }, 'account'],
    ['thread', { muted: false, baseRevision: 1 }, 'account'],
  ]);
  expect(threads[0]).toMatchObject({ muted: false, preferencesRevision: 2 });
  expect(threads[0].pendingMuted).toBeUndefined();
});

test('privacy switches serialize, recover via GET on failure and discard an old account receipt', async () => {
  const original = { ...defaultProfileVisibility };
  const first = deferred<typeof original>();
  const oldAccount = deferred<typeof original>();
  const update = jest
    .spyOn(apiClient, 'updateProfileVisibility')
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ ...original, showPosts: false })
    .mockReturnValueOnce(oldAccount.promise);
  const read = jest
    .spyOn(apiClient, 'profileVisibility')
    .mockResolvedValue(original);
  const report = jest.fn();
  function Account({ token, active }: { token: string; active: boolean }) {
    const [visibility, setVisibility] = useState(original);
    const { updateProfileVisibility } = useProfileActions({
      token,
      setProfileVisibility: setVisibility,
      applySavedProfile: jest.fn(),
      setUser: jest.fn(),
    });
    return (
      <SettingsScreen
        active={active}
        appearance="light"
        language="en"
        onActionError={report}
        onBack={jest.fn()}
        onDeleteAccount={jest.fn()}
        onSetAppearance={jest.fn()}
        onSetLanguage={jest.fn()}
        onSignOut={jest.fn()}
        onUpdateProfileVisibility={updateProfileVisibility}
        palette={palettes.light}
        profileVisibility={visibility}
        userName="Test"
        userRole="user"
      />
    );
  }
  const view = (token: string, active = true) => (
    <Account key={token} token={token} active={active} />
  );
  const row = (title: string) =>
    renderer.root
      .findAllByType(SettingsSwitchRow)
      .find(item => item.props.title === title)!;
  await act(async () => {
    renderer = TestRenderer.create(view('first'));
  });
  await act(async () => {
    row('Show albums').props.onChange(false);
    row('Show posts').props.onChange(false);
  });
  expect(update.mock.calls).toEqual([['first', { showAlbum: false }]]);
  await act(async () => renderer.update(view('first', false)));
  await act(async () => renderer.update(view('first')));
  await act(async () => first.reject(new Error('Album write failed')));
  expect(read).toHaveBeenCalledWith('first');
  expect(update.mock.calls[1]).toEqual(['first', { showPosts: false }]);
  expect(row('Show albums').props.value).toBe(true);
  expect(row('Show posts').props.value).toBe(false);
  expect(report).not.toHaveBeenCalled();
  await act(async () => row('Show albums').props.onChange(false));
  await act(async () => renderer.update(view('second')));
  await act(async () => oldAccount.resolve({ ...original, showAlbum: false }));
  expect(row('Show albums').props.value).toBe(true);
  expect(row('Show posts').props.value).toBe(true);
});
