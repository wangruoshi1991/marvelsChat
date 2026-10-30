import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import type {
  AgentDTO,
  AppSyncDTO,
  BootstrapDTO,
  OwnedAgentDTO,
  ProfileDTO,
  ProductCatalogProductDTO,
  ProductEntitlementDTO,
} from '../src/models/api';
import { avatar3dAttemptStore } from '../src/services/avatar3dAttemptStore';
import { apiClient } from '../src/services/apiClient';
import { tokenStore } from '../src/services/tokenStore';
import { useMiaoxunSession } from '../src/features/session/useMiaoxunSession';
import { albumAssistantConsent } from '../src/features/station/albumAssistantAuthorization';
import {
  assertAIContract,
  clearAIContractSession,
} from '../src/services/aiContract';

jest.mock('../src/services/apiClient', () => ({
  apiClient: {
    bootstrap: jest.fn(),
    sync: jest.fn(),
    notifications: jest.fn(),
    markThreadRead: jest.fn(),
    logout: jest.fn(),
    login: jest.fn(),
    register: jest.fn(),
    relationships: jest.fn(),
    deleteAccount: jest.fn(),
    stationContent: jest.fn(),
    createStationPost: jest.fn(),
    updateProfile: jest.fn(),
    updateStationConfig: jest.fn(),
    setAgentEnabled: jest.fn(),
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

jest.mock('../src/features/station/albumAssistantAuthorization', () => ({
  albumAssistantConsent: jest.fn(),
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
const mockedAlbumConsent = jest.mocked(albumAssistantConsent);
let currentSession: ReturnType<typeof useMiaoxunSession> | null = null;
let currentWorkspaceAccess:
  | ReturnType<typeof useMiaoxunSession>['setAgentEnabled']
  | null = null;

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

  emit(payload: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(payload) });
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
  products: [],
  entitlements: [],
  catalogRevision: 'catalog-empty',
  catalogStatus: 'ready',
  agentReadiness: {},
  modules: {},
};

function AuthorizationWorkspace({
  setAgentEnabled,
}: {
  setAgentEnabled: ReturnType<typeof useMiaoxunSession>['setAgentEnabled'];
}) {
  currentWorkspaceAccess = setAgentEnabled;
  return null;
}

function SessionHarness({ workspaceKey }: { workspaceKey?: string } = {}) {
  currentSession = useMiaoxunSession();
  return workspaceKey ? (
    <AuthorizationWorkspace
      key={workspaceKey}
      setAgentEnabled={currentSession.setAgentEnabled}
    />
  ) : null;
}

// Authorization fixtures are isolated from the existing empty-registry tests.
function authorizationBootstrap(): BootstrapDTO {
  const registered: AgentDTO[] = [
    {
      key: 'album-manager',
      name: '相册管理',
      version: '0.2.3',
      category: 'media-management',
      identity: {
        avatarKind: 'agent-mark' as const,
        mark: '测',
        shape: 'circle' as const,
        colors: {
          background: '#123456',
          foreground: '#ffffff',
          accent: '#abcdef',
        },
      },
      description: '相册管理',
      capabilities: [],
      permissions: ['album:read'],
      status: 'registered',
    },
    {
      key: 'site-builder',
      name: '建站',
      version: '0.1.0',
      category: 'station-builder',
      identity: {
        avatarKind: 'agent-mark' as const,
        mark: '测',
        shape: 'circle' as const,
        colors: {
          background: '#123456',
          foreground: '#ffffff',
          accent: '#abcdef',
        },
      },
      description: '建站',
      capabilities: [],
      permissions: ['station:read'],
      status: 'registered',
    },
  ];
  return { ...bootstrap, agents: { registered, owned: [] } };
}

function accessGrant(
  agent: AgentDTO,
  grantedScopes = agent.permissions,
): OwnedAgentDTO {
  return {
    id: agent.key,
    name: agent.name,
    description: agent.description,
    category: agent.category,
    identity: {
      avatarKind: 'agent-mark' as const,
      mark: '测',
      shape: 'circle' as const,
      colors: {
        background: '#123456',
        foreground: '#ffffff',
        accent: '#abcdef',
      },
    },
    enabled: true,
    grantedScopes: [...grantedScopes],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(finish => {
    resolve = finish;
  });
  return { promise, resolve };
}

async function flushEffects() {
  for (let index = 0; index < 4; index += 1) {
    await new Promise<void>(resolve => setImmediate(resolve));
  }
}

describe('session synchronization', () => {
  beforeEach(() => {
    clearAIContractSession();
    jest.restoreAllMocks();
    jest.clearAllMocks();
    currentSession = null;
    currentWorkspaceAccess = null;
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
    mockedApiClient.setAgentEnabled.mockReset();
    mockedAlbumConsent.mockReset().mockResolvedValue(undefined);
    mockedApiClient.logout.mockResolvedValue({ ok: true });
    mockedApiClient.login.mockResolvedValue({
      user: bootstrap.user,
      session: { token: 'new-token', expiresAt: '2026-10-01T00:00:00.000Z' },
    });
    mockedApiClient.register.mockResolvedValue({
      user: bootstrap.user,
      session: {
        token: 'registered-token',
        expiresAt: '2026-10-01T00:00:00.000Z',
      },
    });
    mockedApiClient.relationships.mockResolvedValue([]);
    mockedApiClient.deleteAccount.mockResolvedValue({ deleted: true });
    mockedApiClient.sync.mockResolvedValue({
      threads: [],
      messagesByThread: {},
      notices: [],
      unreadNoticeCount: 0,
      products: [],
      entitlements: [],
      catalogRevision: 'catalog-empty',
      catalogStatus: 'ready',
      serverTime: '2026-07-10T06:00:01.000Z',
    });
  });

  test('old bootstrap keeps login available while AI contract follows refresh and account changes', async () => {
    let renderer: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    expect(currentSession?.user?.id).toBe(bootstrap.user.id);
    expect(() => assertAIContract('saved-token')).toThrow('当前服务器不支持');
    mockedApiClient.bootstrap.mockResolvedValue({
      ...bootstrap,
      contracts: { aiTasks: 1 },
    });
    await ReactTestRenderer.act(async () => {
      await currentSession?.refreshBootstrap();
    });
    expect(() => assertAIContract('saved-token')).not.toThrow();
    mockedApiClient.bootstrap.mockResolvedValue(bootstrap);
    await ReactTestRenderer.act(async () => {
      await currentSession?.signIn('fixed-user', 'test-only-password');
    });
    expect(currentSession?.token).toBe('new-token');
    expect(() => assertAIContract('saved-token')).toThrow();
    expect(() => assertAIContract('new-token')).toThrow();
    await ReactTestRenderer.act(async () => renderer!.unmount());
  });

  test('a bootstrap started before a station mutation cannot erase the newer content', async () => {
    const pendingBootstrap = deferred<BootstrapDTO>();
    const localPost = {
      id: 'local-post',
      userId: 'user-1',
      body: 'Local post',
      locationLabel: '',
      visibility: 'public' as const,
      agentCapabilities: [],
      media: [],
      commentCount: 0,
      likeCount: 0,
      favoriteCount: 0,
      likedByMe: false,
      favoritedByMe: false,
      createdAt: '2026-07-10T06:00:02.000Z',
    };
    mockedApiClient.createStationPost.mockResolvedValueOnce(localPost);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    mockedApiClient.bootstrap.mockReturnValueOnce(pendingBootstrap.promise);

    let refreshing!: Promise<void>;
    ReactTestRenderer.act(() => {
      refreshing = currentSession!.refreshBootstrap();
    });
    await ReactTestRenderer.act(async () => {
      await currentSession!.createStationPost({ body: localPost.body });
    });
    expect(currentSession?.stationContent.posts.map(post => post.id)).toEqual([
      localPost.id,
    ]);

    await ReactTestRenderer.act(async () => {
      pendingBootstrap.resolve({
        ...bootstrap,
        serverTime: '2026-07-10T06:00:03.000Z',
        stationContent: { ...bootstrap.stationContent, posts: [] },
      });
      await refreshing;
    });
    expect(currentSession?.stationContent.posts.map(post => post.id)).toEqual([
      localPost.id,
    ]);
    await ReactTestRenderer.act(() => renderer?.unmount());
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

  test('incremental sync refreshes the Agent catalogue without expanding ownership', async () => {
    const initialAgent: AgentDTO = {
      key: 'site-builder',
      name: '建站',
      version: '0.1.0',
      category: 'station-builder',
      identity: {
        avatarKind: 'agent-mark' as const,
        mark: '测',
        shape: 'circle' as const,
        colors: {
          background: '#123456',
          foreground: '#ffffff',
          accent: '#abcdef',
        },
      },
      description: '旧描述',
      capabilities: [],
      permissions: ['station:read'],
      published: true,
      status: 'registered',
    };
    const newlyPublished: AgentDTO = {
      key: 'comic-diary',
      name: '漫画日记',
      version: '0.1.0',
      category: 'creative',
      identity: {
        avatarKind: 'agent-mark' as const,
        mark: '测',
        shape: 'circle' as const,
        colors: {
          background: '#123456',
          foreground: '#ffffff',
          accent: '#abcdef',
        },
      },
      description: '后台刚刚上架',
      capabilities: [],
      permissions: ['station:read'],
      published: true,
      status: 'registered',
    };
    const owned: OwnedAgentDTO = {
      id: initialAgent.key,
      name: initialAgent.name,
      description: initialAgent.description,
      category: initialAgent.category,
      identity: {
        avatarKind: 'agent-mark' as const,
        mark: '测',
        shape: 'circle' as const,
        colors: {
          background: '#123456',
          foreground: '#ffffff',
          accent: '#abcdef',
        },
      },
      enabled: true,
      grantedScopes: initialAgent.permissions,
      published: true,
    };
    mockedApiClient.bootstrap.mockResolvedValueOnce({
      ...bootstrap,
      agents: { registered: [initialAgent], owned: [owned] },
    });
    mockedApiClient.sync.mockResolvedValueOnce({
      threads: [],
      messagesByThread: {},
      notices: [],
      unreadNoticeCount: 0,
      products: [],
      entitlements: [],
      catalogRevision: 'catalog-empty',
      catalogStatus: 'ready',
      agents: {
        registered: [initialAgent, newlyPublished],
        owned: [{ ...owned, name: '后台更新后的名称' }],
      },
      serverTime: '2026-07-10T06:00:04.000Z',
    });
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    expect(currentSession?.agents.map(agent => agent.key)).toEqual([
      initialAgent.key,
    ]);
    expect(currentSession?.ownedAgents[0]?.name).toBe(initialAgent.name);

    await ReactTestRenderer.act(async () => {
      await currentSession?.incrementalSync();
    });
    expect(currentSession?.agents.map(agent => agent.key)).toEqual([
      initialAgent.key,
      newlyPublished.key,
    ]);
    expect(currentSession?.ownedAgents[0]?.name).toBe('后台更新后的名称');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('bootstrap and incremental sync expose the published product catalog and entitlement state', async () => {
    const product: ProductCatalogProductDTO = {
      id: 'product-1',
      productKey: 'site-builder',
      version: '1.0.0',
      displayName: '建站 Agent',
      description: '已发布能力',
      supportedPlatforms: ['ios'],
      status: 'published',
      productVersionId: 'product-version-1',
      contractHash: 'contract-1',
      dependencies: [],
    };
    const entitlement: ProductEntitlementDTO = {
      id: 'entitlement-1',
      productId: product.id,
      productVersionId: product.productVersionId!,
      productKey: product.productKey,
      version: product.version!,
      status: 'enabled',
      grantedScopes: ['station:read'],
      contractHash: product.contractHash,
      consentVersion: 'consent-1',
      unavailableReason: null,
    };
    mockedApiClient.bootstrap.mockResolvedValueOnce({
      ...bootstrap,
      products: [product],
      entitlements: [entitlement],
      catalogRevision: 'catalog-1',
    });
    mockedApiClient.sync.mockResolvedValueOnce({
      threads: [],
      messagesByThread: {},
      notices: [],
      unreadNoticeCount: 0,
      products: [],
      entitlements: [{ ...entitlement, status: 'disabled' }],
      catalogRevision: 'catalog-2',
      catalogStatus: 'ready',
      serverTime: '2026-07-10T06:00:05.000Z',
    });
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    expect(currentSession?.products).toEqual([product]);
    expect(currentSession?.entitlements).toEqual([entitlement]);
    expect(currentSession?.catalogRevision).toBe('catalog-1');

    await ReactTestRenderer.act(async () => {
      await currentSession?.incrementalSync();
    });
    expect(currentSession?.products).toEqual([]);
    expect(currentSession?.entitlements[0]?.status).toBe('disabled');
    expect(currentSession?.catalogRevision).toBe('catalog-2');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('an authorization already in flight stays deduplicated after its workspace remounts', async () => {
    const initial = authorizationBootstrap();
    const grant = accessGrant(initial.agents.registered[1]);
    const patch = deferred<OwnedAgentDTO>();
    mockedApiClient.bootstrap.mockResolvedValue(initial);
    mockedApiClient.setAgentEnabled.mockReturnValueOnce(patch.promise);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(
        <SessionHarness workspaceKey="first" />,
      );
      await flushEffects();
    });
    let first!: Promise<OwnedAgentDTO>;
    ReactTestRenderer.act(() => {
      first = currentWorkspaceAccess!('site-builder', true, ['station:read']);
    });
    await ReactTestRenderer.act(async () => {
      renderer?.update(<SessionHarness workspaceKey="remounted" />);
      await flushEffects();
    });
    await ReactTestRenderer.act(async () => {
      await expect(
        currentWorkspaceAccess!('site-builder', true, ['station:read']),
      ).rejects.toThrow('授权正在更新');
    });
    expect(mockedApiClient.setAgentEnabled).toHaveBeenCalledTimes(1);
    mockedApiClient.bootstrap.mockResolvedValue({
      ...initial,
      agents: { ...initial.agents, owned: [grant] },
    });
    await ReactTestRenderer.act(async () => {
      patch.resolve(grant);
      await first;
    });
    expect(currentSession?.ownedAgents).toEqual([grant]);
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('enabling without explicitly confirmed scopes is rejected before any network consent or PATCH', async () => {
    mockedApiClient.bootstrap.mockResolvedValue(authorizationBootstrap());
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    await ReactTestRenderer.act(async () => {
      await expect(
        currentSession!.setAgentEnabled('album-manager', true),
      ).rejects.toThrow('查看并确认');
    });
    expect(mockedAlbumConsent).not.toHaveBeenCalled();
    expect(mockedApiClient.setAgentEnabled).not.toHaveBeenCalled();
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('confirmed scopes are copied before cloud consent and never expanded by a caller mutation', async () => {
    const initial = authorizationBootstrap();
    const grant = accessGrant(initial.agents.registered[0]);
    const consent = deferred<'media-retrieval-consent-v1'>();
    mockedApiClient.bootstrap.mockResolvedValue(initial);
    mockedAlbumConsent.mockReturnValueOnce(consent.promise);
    mockedApiClient.setAgentEnabled.mockResolvedValueOnce(grant);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    const approved = ['album:read'];
    let authorization!: Promise<OwnedAgentDTO>;
    ReactTestRenderer.act(() => {
      authorization = currentSession!.setAgentEnabled(
        'album-manager',
        true,
        approved,
        'media-retrieval-consent-v1',
      );
    });
    approved.push('files:read');
    expect(mockedAlbumConsent).toHaveBeenCalledWith(
      'saved-token',
      'zh',
      expect.any(Function),
      'media-retrieval-consent-v1',
    );
    await ReactTestRenderer.act(async () => {
      consent.resolve('media-retrieval-consent-v1');
      await authorization;
    });
    expect(mockedApiClient.setAgentEnabled).toHaveBeenCalledWith(
      'saved-token',
      'album-manager',
      true,
      'media-retrieval-consent-v1',
      expect.any(String),
      ['album:read'],
    );
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('registry or ownership changes during cloud consent invalidate the authorization', async () => {
    const initial = authorizationBootstrap();
    const grant = accessGrant(initial.agents.registered[0]);
    const consent = deferred<'media-retrieval-consent-v1'>();
    mockedApiClient.bootstrap.mockResolvedValue(initial);
    mockedAlbumConsent.mockReturnValueOnce(consent.promise);
    mockedApiClient.setAgentEnabled.mockResolvedValueOnce(grant);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    const approvedScopes = ['album:read'];
    let authorization!: Promise<OwnedAgentDTO>;
    ReactTestRenderer.act(() => {
      authorization = currentSession!.setAgentEnabled(
        'album-manager',
        true,
        approvedScopes,
      );
    });
    approvedScopes.push('files:read');
    const newer = {
      ...initial,
      agents: {
        registered: initial.agents.registered.map(agent =>
          agent.key === 'album-manager'
            ? {
                ...agent,
                version: '0.2.4',
                permissions: ['album:read', 'files:read'],
              }
            : agent,
        ),
        owned: [grant],
      },
    };
    mockedApiClient.bootstrap.mockResolvedValue(newer);
    await ReactTestRenderer.act(async () => {
      await currentSession!.refreshBootstrap();
    });
    expect(
      currentSession?.agents.find(agent => agent.key === 'album-manager')
        ?.permissions,
    ).toContain('files:read');
    expect(mockedApiClient.setAgentEnabled).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      consent.resolve('media-retrieval-consent-v1');
      await expect(authorization).rejects.toThrow('重新查看范围后确认');
    });
    expect(mockedApiClient.setAgentEnabled).not.toHaveBeenCalled();
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('logout invalidates pending album consent before the server logout completes', async () => {
    const consent = deferred<'media-retrieval-consent-v1'>();
    const logout = deferred<{ ok: boolean }>();
    mockedApiClient.bootstrap.mockResolvedValue(authorizationBootstrap());
    mockedAlbumConsent.mockReturnValueOnce(consent.promise);
    mockedApiClient.logout.mockReturnValueOnce(logout.promise);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    let authorization!: Promise<unknown>;
    ReactTestRenderer.act(() => {
      authorization = currentSession!
        .setAgentEnabled('album-manager', true, ['album:read'])
        .catch(cause => cause);
    });
    const isCurrent = mockedAlbumConsent.mock.calls[0][2];
    expect(isCurrent()).toBe(true);
    let signOut!: Promise<void>;
    ReactTestRenderer.act(() => {
      signOut = currentSession!.signOut();
    });
    expect(currentSession?.token).toBe('saved-token');
    expect(mockedTokenStore.clear).not.toHaveBeenCalled();
    expect(isCurrent()).toBe(false);
    let result: unknown;
    await ReactTestRenderer.act(async () => {
      consent.resolve('media-retrieval-consent-v1');
      result = await authorization;
    });
    expect(result).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('账号状态已变化'),
      }),
    );
    expect(mockedApiClient.setAgentEnabled).not.toHaveBeenCalled();
    await ReactTestRenderer.act(async () => {
      logout.resolve({ ok: true });
      await signOut;
    });
    expect(currentSession?.token).toBe('');
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('a late authorization PATCH cannot refresh or overwrite the next account', async () => {
    const initial = authorizationBootstrap();
    const oldGrant = accessGrant(initial.agents.registered[1]);
    const patch = deferred<OwnedAgentDTO>();
    mockedApiClient.bootstrap.mockResolvedValue(initial);
    mockedApiClient.setAgentEnabled.mockReturnValueOnce(patch.promise);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;
    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    let authorization!: Promise<unknown>;
    ReactTestRenderer.act(() => {
      authorization = currentSession!
        .setAgentEnabled('site-builder', true, ['station:read'])
        .catch(cause => cause);
    });
    expect(mockedApiClient.setAgentEnabled).toHaveBeenCalledTimes(1);
    await ReactTestRenderer.act(async () => {
      await currentSession!.signOut();
    });
    const nextGrant = {
      ...oldGrant,
      name: '下一账号的建站助手',
      grantedScopes: [],
    };
    const next = {
      ...initial,
      user: { ...initial.user, id: 'user-2', displayName: 'Next User' },
      profile: { ...initial.profile, userId: 'user-2', nickname: 'Next User' },
      agents: { ...initial.agents, owned: [nextGrant] },
    };
    mockedApiClient.bootstrap.mockResolvedValue(next);
    await ReactTestRenderer.act(async () => {
      await currentSession!.signIn('next@example.com', 'password');
    });
    const bootstrapCount = mockedApiClient.bootstrap.mock.calls.length;
    let result: unknown;
    await ReactTestRenderer.act(async () => {
      patch.resolve(oldGrant);
      result = await authorization;
    });
    expect(result).toEqual(
      expect.objectContaining({
        message: expect.stringContaining('账号状态已变化'),
      }),
    );
    expect(mockedApiClient.bootstrap).toHaveBeenCalledTimes(bootstrapCount);
    expect(currentSession?.token).toBe('new-token');
    expect(currentSession?.user?.id).toBe('user-2');
    expect(currentSession?.ownedAgents).toEqual([nextGrant]);
    await ReactTestRenderer.act(() => renderer?.unmount());
  });

  test('registration keeps the issued session when bootstrap fails and can retry', async () => {
    mockedTokenStore.read.mockResolvedValue('');
    mockedApiClient.bootstrap
      .mockRejectedValueOnce(new Error('网络中断'))
      .mockResolvedValue(bootstrap);
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });

    await ReactTestRenderer.act(async () => {
      await expect(
        currentSession!.signUp(
          'email',
          'tester@example.com',
          'Password1',
          'Tester',
        ),
      ).rejects.toThrow('网络中断');
    });

    expect(mockedTokenStore.save).toHaveBeenCalledWith('registered-token');
    expect(currentSession?.restoreStatus).toBe('networkError');
    expect(currentSession?.errorMessage).toContain('账号已创建');

    mockedTokenStore.read.mockResolvedValue('registered-token');
    await ReactTestRenderer.act(async () => {
      await currentSession!.retryRestoreSession();
    });

    expect(mockedApiClient.register).toHaveBeenCalledTimes(1);
    expect(mockedApiClient.bootstrap).toHaveBeenLastCalledWith(
      'registered-token',
    );
    expect(currentSession?.restoreStatus).toBe('authenticated');

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });

  test('relationship refresh loads pages beyond the bootstrap limit', async () => {
    const friendAt = (index: number) => ({
      user: { id: `friend-${index}`, displayName: `Friend ${index}`, aiId: '' },
      profile: { ...bootstrap.profile, userId: `friend-${index}` },
      relationType: 'friend',
      cursor: {
        createdAt: '2026-09-29T06:00:00.000000Z',
        relationId: `00000000-0000-4000-8000-${String(index).padStart(
          12,
          '0',
        )}`,
      },
    });
    mockedApiClient.relationships.mockImplementation(
      async (type, _token, page) => {
        if (type !== 'friends') return [];
        return page?.before
          ? [friendAt(101)]
          : Array.from({ length: 100 }, (_, index) => friendAt(index + 1));
      },
    );
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    await ReactTestRenderer.act(async () => {
      await currentSession!.refreshRelationships();
    });

    expect(currentSession?.relationships.friends).toHaveLength(101);
    expect(mockedApiClient.relationships).toHaveBeenCalledWith(
      'friends',
      'saved-token',
      { limit: 100, before: undefined },
    );
    expect(mockedApiClient.relationships).toHaveBeenLastCalledWith(
      'friends',
      'saved-token',
      { limit: 100, before: friendAt(100).cursor },
    );

    await ReactTestRenderer.act(() => {
      renderer?.unmount();
    });
  });

  test('relationship realtime events refresh the relation state', async () => {
    mockedApiClient.relationships.mockImplementation(async type =>
      type === 'followers'
        ? [
            {
              user: { id: 'new-follower', displayName: 'New', aiId: '' },
              profile: bootstrap.profile,
              relationType: 'follow',
            },
          ]
        : [],
    );
    let renderer: ReactTestRenderer.ReactTestRenderer | null = null;

    await ReactTestRenderer.act(async () => {
      renderer = ReactTestRenderer.create(<SessionHarness />);
      await flushEffects();
    });
    await ReactTestRenderer.act(async () => {
      MockWebSocket.instances[0].emit({ type: 'relationships.changed' });
      await flushEffects();
    });

    expect(currentSession?.relationships.followers).toHaveLength(1);
    expect(currentSession?.relationships.followers[0].user.id).toBe(
      'new-follower',
    );

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
      finishBootstrap({ ...bootstrap, contracts: { aiTasks: 1 } });
      await pendingRefresh;
    });

    expect(currentSession?.token).toBe('');
    expect(currentSession?.user).toBeNull();
    expect(currentSession?.profile.nickname).toBe('未登录');
    expect(() => assertAIContract('saved-token')).toThrow();
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
        products: [],
        entitlements: [],
        catalogRevision: 'catalog-empty',
        catalogStatus: 'ready',
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
