import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { BootstrapDTO } from '../src/models/api';
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
    deleteAccount: jest.fn(),
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
  agents: { registered: [], owned: [] },
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
    mockedAvatar3dAttemptStore.clear.mockResolvedValue(undefined);
    mockedApiClient.bootstrap.mockResolvedValue(bootstrap);
    mockedApiClient.logout.mockResolvedValue({ ok: true });
    mockedApiClient.deleteAccount.mockResolvedValue({ deleted: true });
    mockedApiClient.sync.mockResolvedValue({
      threads: [],
      messagesByThread: {},
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
});
