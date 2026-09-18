import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { AppSyncDTO, BootstrapDTO, ProfileDTO } from '../src/models/api';
import { avatar3dAttemptStore } from '../src/services/avatar3dAttemptStore';
import { apiClient } from '../src/services/apiClient';
import { tokenStore } from '../src/services/tokenStore';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';

jest.mock('../src/services/apiClient', () => ({
  apiClient: {
    bootstrap: jest.fn(),
    sync: jest.fn(),
    notifications: jest.fn(),
    markThreadRead: jest.fn(),
    logout: jest.fn(),
    login: jest.fn(),
    deleteAccount: jest.fn(),
    stationContent: jest.fn(),
    updateProfile: jest.fn(),
    updateStationConfig: jest.fn(),
  },
  buildRealtimeUrl: (path: string) => `ws://127.0.0.1:4390${path}`,
  setAuthSessionExpiredHandler: () => () => undefined,
  isAuthSessionError: (error: unknown) =>
    Boolean(
      error &&
        typeof error === 'object' &&
        'status' in error &&
        error.status === 401,
    ),
}));

jest.mock('../src/services/avatar3dAttemptStore', () => ({
  avatar3dAttemptStore: {
    clear: jest.fn(),
  },
}));

jest.mock('../src/services/tokenStore', () => ({
  tokenStore: {
    read: jest.fn(),
    save: jest.fn(),
    clear: jest.fn(),
  },
}));

const mockedApiClient = apiClient as jest.Mocked<typeof apiClient>;
const mockedAvatar3dAttemptStore = avatar3dAttemptStore as jest.Mocked<
  typeof avatar3dAttemptStore
>;
const mockedTokenStore = tokenStore as jest.Mocked<typeof tokenStore>;
let currentSession: ReturnType<typeof useMiaoxunSession> | null = null;

class MockWebSocket {
  static instances: MockWebSocket[] = [];

  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  close = jest.fn();

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  emitReady() {
    this.onopen?.();
    this.onmessage?.({ data: JSON.stringify({ type: 'connection.ready' }) });
  }
}

const bootstrap: BootstrapDTO = {
  serverTime: '2026-07-10T06:00:00.000Z',
  user: {
    id: 'user-1',
    email: 'tester@example.com',
    displayName: 'Tester',
    aiId: '900000000000001',
    role: 'user',
  },
  profile: {
    headline: '',
    publicLocation: '',
    experienceYears: null,
    languages: [],
    userId: 'user-1',
    nickname: 'Tester',
    avatarText: 'T',
    avatarConfig: {},
    bio: '',
    community: '',
    activityArea: '',
    miaoPoints: 0,
    followingCount: 0,
    followersCount: 0,
    likesCount: 0,
    collectionsCount: 0,
    stationConfig: {},
  },
  threads: [],
  messagesByThread: {},
  notices: [],
  unreadNoticeCount: 0,
  profileVisibility: {
    showBio: true,
    showAiId: true,
    showCounts: true,
    showCommunity: true,
    showActivityArea: true,
    showCollections: true,
    showPosts: true,
    showAlbum: true,
    showDiary: true,
    showMusic: true,
    showFiles: false,
    showFollowingList: false,
    showFollowersList: false,
  },
  searchHistory: [],
  relationships: { following: [], followers: [], friends: [] },
  stationContent: {
    posts: [],
    diaryEntries: [],
    albums: [],
    mediaAssets: [],
    outfits: [],
    siteDrafts: [],
    fileAssets: [],
    comicDiaries: [],
    videoDrafts: [],
  },
  agents: { registered: [], owned: [] },
  agentReadiness: {},
  modules: {},
};

function SessionHarness() {
  currentSession = useMiaoxunSession();
  return null;
}

async function flushEffects() {
  for (let index = 0; index < 4; index += 1) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

describe('session synchronization', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
    currentSession = null;
    MockWebSocket.instances = [];
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
    mockedTokenStore.read.mockResolvedValue('saved-token');
    mockedTokenStore.clear.mockResolvedValue(undefined);
    mockedTokenStore.save.mockResolvedValue(undefined);
    mockedAvatar3dAttemptStore.clear.mockResolvedValue(undefined);
    mockedApiClient.bootstrap.mockResolvedValue(bootstrap);
    mockedApiClient.updateProfile.mockResolvedValue(bootstrap.profile);
    mockedApiClient.updateStationConfig.mockResolvedValue(bootstrap.profile);
    mockedApiClient.logout.mockResolvedValue({ ok: true });
    mockedApiClient.login.mockResolvedValue({
      user: bootstrap.user,
      session: { token: 'new-token', expiresAt: '2026-10-01T00:00:00.000Z' },
    });
    mockedApiClient.deleteAccount.mockResolvedValue({ deleted: true });
    mockedApiClient.sync.mockResolvedValue({
      threads: [],
      messagesByThread: {},
      notices: [],
      unreadNoticeCount: 0,
      serverTime: '2026-07-10T06:00:01.000Z',
    });
  });

  test('connection.ready catches up once without rebuilding the socket', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    await ReactTestRenderer.act(async () => {
      MockWebSocket.instances[0].emitReady();
      await flushEffects();
    });

    expect(mockedApiClient.bootstrap).toHaveBeenCalledTimes(1);
    expect(mockedApiClient.sync).toHaveBeenCalledTimes(1);
    expect(mockedApiClient.sync).toHaveBeenCalledWith(
      bootstrap.serverTime,
      'saved-token',
    );
    expect(MockWebSocket.instances).toHaveLength(1);

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });

  test('authenticated sessions do not start a periodic sync timer', async () => {
    const setIntervalSpy = jest.spyOn(globalThis, 'setInterval');
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(mockedApiClient.sync).not.toHaveBeenCalled();

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });

  test('sync 401 clears the stored token once and stops later sync work', async () => {
    mockedApiClient.sync.mockRejectedValueOnce(
      Object.assign(new Error('登录状态已失效。'), { status: 401 }),
    );
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    expect(MockWebSocket.instances).toHaveLength(1);

    await ReactTestRenderer.act(async () => {
      MockWebSocket.instances[0].emitReady();
      await flushEffects();
    });

    expect(mockedApiClient.sync).toHaveBeenCalledTimes(1);
    expect(mockedTokenStore.clear).toHaveBeenCalledTimes(1);
    expect(mockedAvatar3dAttemptStore.clear).toHaveBeenCalledTimes(1);
    expect(MockWebSocket.instances[0].close).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      MockWebSocket.instances[0].emitReady();
      await flushEffects();
    });

    expect(mockedApiClient.sync).toHaveBeenCalledTimes(1);
    expect(mockedTokenStore.clear).toHaveBeenCalledTimes(1);
    expect(mockedAvatar3dAttemptStore.clear).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });

  test('logout clears local credentials even when server logout fails', async () => {
    mockedApiClient.logout.mockRejectedValueOnce(new Error('offline'));
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    await ReactTestRenderer.act(async () => {
      await currentSession?.signOut();
      await flushEffects();
    });

    expect(mockedApiClient.logout).toHaveBeenCalledWith('saved-token');
    expect(mockedTokenStore.clear).toHaveBeenCalledTimes(1);
    expect(mockedAvatar3dAttemptStore.clear).toHaveBeenCalledTimes(1);
    expect(currentSession?.token).toBe('');

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });

  test('account deletion verifies the password and clears all local state', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    await ReactTestRenderer.act(async () => {
      await currentSession?.deleteAccount('correct-password');
      await flushEffects();
    });

    expect(mockedApiClient.deleteAccount).toHaveBeenCalledWith(
      'saved-token',
      'correct-password',
    );
    expect(mockedTokenStore.clear).toHaveBeenCalledTimes(1);
    expect(mockedAvatar3dAttemptStore.clear).toHaveBeenCalledTimes(1);
    expect(currentSession?.token).toBe('');
    expect(currentSession?.user).toBeNull();

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });

  test('a bootstrap response arriving after logout cannot restore old account data', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    let finishBootstrap!: (value: BootstrapDTO) => void;
    mockedApiClient.bootstrap.mockReturnValueOnce(
      new Promise(resolve => {
        finishBootstrap = resolve;
      }),
    );
    const pendingRefresh = currentSession!.refreshBootstrap();

    await ReactTestRenderer.act(async () => {
      await currentSession!.signOut();
      finishBootstrap(bootstrap);
      await pendingRefresh;
    });

    expect(currentSession?.token).toBe('');
    expect(currentSession?.user).toBeNull();
    expect(currentSession?.profile.nickname).toBe('未登录');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('a persisted profile succeeds without another bootstrap request', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    const savedProfile = {
      ...bootstrap.profile,
      nickname: '新名字',
      headline: '独立设计师',
      publicLocation: '杭州',
    };
    mockedApiClient.updateProfile.mockResolvedValueOnce(savedProfile);
    mockedApiClient.bootstrap.mockRejectedValue(
      new Error('unrelated refresh unavailable'),
    );

    await ReactTestRenderer.act(async () => {
      await expect(
        currentSession!.updateProfile(savedProfile),
      ).resolves.toEqual(savedProfile);
    });

    expect(mockedApiClient.bootstrap).toHaveBeenCalledTimes(1);
    expect(currentSession?.profile).toEqual(savedProfile);
    expect(currentSession?.user?.displayName).toBe('新名字');
    expect(currentSession?.errorMessage).toBeNull();
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('bootstrap and incremental sync started before a profile save keep its result and still update other data', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    let finishBootstrap!: (value: BootstrapDTO) => void;
    let finishSync!: (value: AppSyncDTO) => void;
    mockedApiClient.bootstrap.mockReturnValueOnce(
      new Promise(resolve => {
        finishBootstrap = resolve;
      }),
    );
    mockedApiClient.sync.mockReturnValueOnce(
      new Promise(resolve => {
        finishSync = resolve;
      }),
    );
    const pendingRefresh = currentSession!.refreshBootstrap();
    const pendingSync = currentSession!.incrementalSync();
    const savedProfile = {
      ...bootstrap.profile,
      nickname: '已保存',
      headline: '摄影师',
      experienceYears: 0,
    };
    mockedApiClient.updateProfile.mockResolvedValueOnce(savedProfile);
    await ReactTestRenderer.act(async () => {
      await currentSession!.updateProfile(savedProfile);
    });
    await ReactTestRenderer.act(async () => {
      finishBootstrap({
        ...bootstrap,
        unreadNoticeCount: 2,
        user: { ...bootstrap.user, presenceMode: 'hidden' },
      });
      await pendingRefresh;
    });
    expect(currentSession?.profile).toEqual(savedProfile);
    expect(currentSession?.user?.displayName).toBe('已保存');
    expect(currentSession?.user?.presenceMode).toBe('hidden');
    expect(currentSession?.unreadNoticeCount).toBe(2);

    await ReactTestRenderer.act(async () => {
      finishSync({
        threads: [],
        messagesByThread: {},
        notices: [],
        unreadNoticeCount: 3,
        serverTime: '2026-09-16T06:00:00.000Z',
      });
      await pendingSync;
    });
    expect(currentSession?.profile).toEqual(savedProfile);
    expect(currentSession?.user?.displayName).toBe('已保存');
    expect(currentSession?.unreadNoticeCount).toBe(3);

    const newerProfile = { ...savedProfile, headline: '其他设备更新的身份' };
    mockedApiClient.bootstrap.mockResolvedValueOnce({
      ...bootstrap,
      profile: newerProfile,
      user: { ...bootstrap.user, displayName: newerProfile.nickname },
    });
    await ReactTestRenderer.act(async () => {
      await currentSession!.refreshBootstrap();
    });
    expect(currentSession?.profile.headline).toBe('其他设备更新的身份');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('a delayed appearance save updates only station config after identity is saved', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    let finishConfig!: (value: ProfileDTO) => void;
    mockedApiClient.updateStationConfig.mockReturnValueOnce(
      new Promise(resolve => {
        finishConfig = resolve;
      }),
    );
    await ReactTestRenderer.act(async () => {
      currentSession!.setAppearance('dark');
    });
    const savedProfile = { ...bootstrap.profile, headline: '独立设计师' };
    mockedApiClient.updateProfile.mockResolvedValueOnce(savedProfile);
    await ReactTestRenderer.act(async () => {
      await currentSession!.updateProfile(savedProfile);
    });
    await ReactTestRenderer.act(async () => {
      finishConfig({
        ...bootstrap.profile,
        stationConfig: { appearance: 'dark' },
      });
      await flushEffects();
    });
    expect(currentSession?.profile.headline).toBe('独立设计师');
    expect(currentSession?.profile.stationConfig.appearance).toBe('dark');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('a profile save from the old login cannot alter the next account or its bootstrap revision', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    let finishSave!: (value: ProfileDTO) => void;
    mockedApiClient.updateProfile.mockReturnValueOnce(
      new Promise(resolve => {
        finishSave = resolve;
      }),
    );
    const pendingSave = currentSession!.updateProfile({
      ...bootstrap.profile,
      headline: 'Previous identity',
    });
    await ReactTestRenderer.act(async () => {
      await currentSession!.signOut();
    });
    const nextBootstrap = {
      ...bootstrap,
      user: { ...bootstrap.user, id: 'user-2', displayName: 'Next User' },
      profile: {
        ...bootstrap.profile,
        userId: 'user-2',
        nickname: 'Next User',
      },
    };
    mockedApiClient.bootstrap.mockResolvedValueOnce(nextBootstrap);
    await ReactTestRenderer.act(async () => {
      await currentSession!.signIn('next@example.com', 'password');
    });
    let finishNextBootstrap!: (value: BootstrapDTO) => void;
    mockedApiClient.bootstrap.mockReturnValueOnce(
      new Promise(resolve => {
        finishNextBootstrap = resolve;
      }),
    );
    const pendingRefresh = currentSession!.refreshBootstrap();
    await ReactTestRenderer.act(async () => {
      finishSave({ ...bootstrap.profile, headline: 'Previous identity' });
      await pendingSave;
      finishNextBootstrap({
        ...nextBootstrap,
        profile: { ...nextBootstrap.profile, headline: 'Next identity' },
      });
      await pendingRefresh;
    });
    expect(currentSession?.user?.id).toBe('user-2');
    expect(currentSession?.user?.displayName).toBe('Next User');
    expect(currentSession?.profile.headline).toBe('Next identity');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('a new login fetches its own bootstrap while an old refresh is pending', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    let finishOldBootstrap!: (value: BootstrapDTO) => void;
    mockedApiClient.bootstrap.mockReturnValueOnce(
      new Promise(resolve => {
        finishOldBootstrap = resolve;
      }),
    );
    const pendingRefresh = currentSession!.refreshBootstrap();
    await ReactTestRenderer.act(async () => {
      await currentSession!.signOut();
    });

    const nextBootstrap = {
      ...bootstrap,
      user: { ...bootstrap.user, id: 'user-2', displayName: 'Next User' },
      profile: {
        ...bootstrap.profile,
        userId: 'user-2',
        nickname: 'Next User',
      },
    };
    mockedApiClient.bootstrap.mockResolvedValueOnce(nextBootstrap);
    let login: Promise<void> | undefined;
    await ReactTestRenderer.act(async () => {
      login = currentSession!.signIn('next@example.com', 'test-password');
      await flushEffects();
    });
    const calledForNewToken = mockedApiClient.bootstrap.mock.calls.some(
      ([requestedToken]) => requestedToken === 'new-token',
    );
    await ReactTestRenderer.act(async () => {
      finishOldBootstrap(bootstrap);
      await Promise.all([pendingRefresh, login]);
    });

    expect(calledForNewToken).toBe(true);
    expect(currentSession?.token).toBe('new-token');
    expect(currentSession?.user?.id).toBe('user-2');
    expect(currentSession?.profile.nickname).toBe('Next User');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('station refresh started by the previous account cannot update a new login', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    let finishRefresh!: (value: BootstrapDTO['stationContent']) => void;
    mockedApiClient.stationContent.mockReturnValueOnce(
      new Promise(resolve => {
        finishRefresh = resolve;
      }),
    );
    const pendingRefresh = currentSession!.refreshStationContent();
    await ReactTestRenderer.act(async () => {
      await currentSession!.signOut();
    });
    await ReactTestRenderer.act(async () => {
      await currentSession!.signIn('next@example.com', 'test-password');
      finishRefresh({
        ...bootstrap.stationContent,
        diaryEntries: [
          {
            id: 'old-private-diary',
            userId: 'old-user',
            title: 'Private diary',
            body: 'Previous account content',
            mood: '',
            visibility: 'private',
            source: 'manual',
            createdAt: '2026-09-15T00:00:00.000Z',
          },
        ],
      });
      await pendingRefresh;
    });
    expect(currentSession?.stationContent.diaryEntries).toEqual([]);
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('failed credential persistence never publishes bootstrap data as a signed-in session', async () => {
    mockedTokenStore.read.mockResolvedValueOnce('');
    mockedTokenStore.save.mockRejectedValueOnce(
      new Error('keychain unavailable'),
    );
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    await ReactTestRenderer.act(async () => {
      await currentSession!.signIn('next@example.com', 'test-password');
    });
    expect(currentSession?.token).toBe('');
    expect(currentSession?.user).toBeNull();
    expect(currentSession?.errorMessage).toBe('keychain unavailable');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('logout does not report success when the local credential remains', async () => {
    mockedTokenStore.clear.mockRejectedValueOnce(new Error('keychain failed'));
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    await expect(
      ReactTestRenderer.act(async () => {
        await currentSession?.signOut();
      }),
    ).rejects.toThrow('无法清除本机登录凭证');

    expect(mockedApiClient.logout).toHaveBeenCalledWith('saved-token');
    expect(currentSession?.token).toBe('saved-token');

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });
});
