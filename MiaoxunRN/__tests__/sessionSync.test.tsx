import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type { BootstrapDTO } from '../src/models/api';
import { apiClient } from '../src/services/apiClient';
import { homepageDraftStore } from '../src/services/homepageDraftStore';
import { tokenStore } from '../src/services/tokenStore';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';

jest.mock('../src/services/apiClient', () => ({
  apiClient: {
    bootstrap: jest.fn(),
    deleteAccount: jest.fn(),
    legalPolicies: jest.fn(),
    sync: jest.fn(),
    notifications: jest.fn(),
    markThreadRead: jest.fn(),
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

jest.mock('../src/services/homepageDraftStore', () => ({
  homepageDraftStore: {
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
const mockedHomepageDraftStore = homepageDraftStore as jest.Mocked<
  typeof homepageDraftStore
>;
const mockedTokenStore = tokenStore as jest.Mocked<typeof tokenStore>;

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
    collectionsCount: 0,
    stationConfig: {},
  },
  threads: [],
  messagesByThread: {},
  agents: { registered: [], owned: [] },
  modules: {},
};

let latestSession: ReturnType<typeof useMiaoxunSession> | null = null;

function SessionHarness() {
  latestSession = useMiaoxunSession();
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
    MockWebSocket.instances = [];
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      writable: true,
      value: MockWebSocket,
    });
    mockedTokenStore.read.mockResolvedValue('saved-token');
    mockedTokenStore.clear.mockResolvedValue(undefined);
    mockedTokenStore.save.mockResolvedValue(undefined);
    mockedApiClient.legalPolicies.mockResolvedValue({
      privacy: { version: '2026-07-15', url: '/legal/privacy' },
      terms: { version: '2026-07-15', url: '/legal/terms' },
    });
    mockedApiClient.bootstrap.mockResolvedValue(bootstrap);
    mockedApiClient.sync.mockResolvedValue({
      threads: [],
      messagesByThread: {},
      serverTime: '2026-07-10T06:00:01.000Z',
    });
    mockedApiClient.deleteAccount.mockResolvedValue({ deleted: true });
    mockedHomepageDraftStore.clear.mockResolvedValue(undefined);
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
    expect(MockWebSocket.instances[0].close).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(async () => {
      MockWebSocket.instances[0].emitReady();
      await flushEffects();
    });

    expect(mockedApiClient.sync).toHaveBeenCalledTimes(1);
    expect(mockedTokenStore.clear).toHaveBeenCalledTimes(1);

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });

  test('account deletion clears local state only after the server succeeds', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    expect(latestSession?.token).toBe('saved-token');

    mockedApiClient.deleteAccount.mockRejectedValueOnce(
      Object.assign(new Error('Invalid password.'), { status: 401 }),
    );
    await ReactTestRenderer.act(async () => {
      await expect(
        latestSession?.deleteAccount('wrong-password'),
      ).rejects.toMatchObject({ status: 401 });
    });
    expect(latestSession?.token).toBe('saved-token');
    expect(mockedTokenStore.clear).not.toHaveBeenCalled();
    expect(mockedHomepageDraftStore.clear).not.toHaveBeenCalled();

    await ReactTestRenderer.act(async () => {
      await latestSession?.deleteAccount('correct-password');
      await flushEffects();
    });
    expect(mockedTokenStore.clear).toHaveBeenCalledTimes(1);
    expect(mockedHomepageDraftStore.clear).toHaveBeenCalledTimes(1);
    expect(latestSession?.token).toBe('');

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });
});
