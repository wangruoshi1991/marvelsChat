import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentReadinessDTO,
  AgentDTO,
  BootstrapDTO,
  ButlerClientContextPayload,
  ModuleDTO,
  NoticeDTO,
  OwnedAgentDTO,
  ProductCatalogProductDTO,
  ProductEntitlementDTO,
  PresenceMode,
  ProfileDTO,
  ProfileVisibilityDTO,
  SearchHistoryDTO,
  StationContentDTO,
  UserDTO,
} from '../../models/api';
import {
  apiClient,
  isAuthSessionError,
  setAuthSessionExpiredHandler,
} from '../../services/apiClient';
import { avatar3dAttemptStore } from '../../services/avatar3dAttemptStore';
import { tokenStore } from '../../services/tokenStore';
import {
  clearAIContractSession,
  setAIContractSession,
} from '../../services/aiContract';
import { Appearance } from '../../shared/theme';
import {
  defaultProfileVisibility,
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
} from './sessionDefaults';
import {
  buildThreads,
  buildThreadsFromSync,
  mergeThreads,
} from './sessionMappers';
import { ChatThread, Language, RestoreStatus } from './sessionTypes';
import { useMessageActions } from './useMessageActions';
import { useNotificationActions } from './useNotificationActions';
import { useProfileActions } from './useProfileActions';
import {
  RealtimeNotificationNotice,
  useRealtimeChannel,
} from './useRealtimeChannel';
import { useSocialActions } from './useSocialActions';
import { useSessionSetter } from './useSessionSetter';
import { useStationActions } from './useStationActions';
import {
  AlbumAIConsentVersion,
  albumAssistantConsent,
} from '../station/albumAssistantAuthorization';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { agentAccessSnapshot } from '../agents/agentAccess';
import { assertAgentDirectoryIdentity } from '../messages/agentIdentity';
import { defaultUIPreferences } from '../ui/uiPreferences';
import type { UIPreferences } from '../ui/uiPreferenceTypes';

export type { ChatMessage, ChatThread, Language } from './sessionTypes';

async function clearLocalSession({ requireTokenClear = false } = {}) {
  const [tokenResult, avatarAttemptResult] = await Promise.allSettled([
    tokenStore.clear(),
    avatar3dAttemptStore.clear(),
  ]);

  if (avatarAttemptResult.status === 'rejected') {
    console.warn(
      '[MiaoxunSession] Failed to clear pending 3D submission state.',
    );
  }
  if (tokenResult.status === 'rejected') {
    if (requireTokenClear) {
      throw new Error('无法清除本机登录凭证，请重试退出登录。');
    }
    console.warn('[MiaoxunSession] Failed to clear the local auth credential.');
  }
}

export function useMiaoxunSession() {
  const [token, setToken] = useState('');
  const [user, setUser] = useState<UserDTO | null>(null);
  const [profile, setProfile] = useState<ProfileDTO>(emptyProfile);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [modules, setModules] = useState<Record<string, ModuleDTO>>({});
  const [agents, setAgents] = useState<AgentDTO[]>([]);
  const [agentReadiness, setAgentReadiness] = useState<
    Record<string, AgentReadinessDTO>
  >({});
  const [ownedAgents, setOwnedAgents] = useState<OwnedAgentDTO[]>([]);
  // Keep the published product snapshot alongside Agent access. Product
  // entry points and consent screens must consume the server release result
  // instead of reconstructing it from the user_agents projection.
  const [products, setProducts] = useState<ProductCatalogProductDTO[]>([]);
  const [entitlements, setEntitlements] = useState<ProductEntitlementDTO[]>([]);
  const [catalogRevision, setCatalogRevision] = useState<string | null>(null);
  const [notices, setNotices] = useState<NoticeDTO[]>([]);
  const [unreadNoticeCount, setUnreadNoticeCount] = useState(0);
  const [profileVisibility, setProfileVisibility] =
    useState<ProfileVisibilityDTO>(defaultProfileVisibility);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryDTO[]>([]);
  const [relationships, setRelationships] = useState(emptyRelationships);
  const [stationContent, setStationContent] =
    useState<StationContentDTO>(emptyStationContent);
  const [language, setLanguage] = useState<Language>('zh');
  const [appearance, setAppearance] = useState<Appearance>('light');
  const [uiPreferences, setUIPreferences] =
    useState<UIPreferences>(defaultUIPreferences);
  const uiPreferencesRef = useRef<UIPreferences>(uiPreferences);
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [realtimeNotificationNotice, setRealtimeNotificationNotice] =
    useState<RealtimeNotificationNotice | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const tokenRef = useRef('');
  const sessionVersionRef = useRef(0);
  const agentAccessGenerationRef = useRef(0);
  const agentAccessBlockedRef = useRef(false);
  const agentAccessPendingRef = useRef(new Set<string>());
  const agentAccessAliveRef = useRef(true);
  const agentAccessStateRef = useRef({
    agents,
    ownedAgents,
    products,
    catalogRevision,
  });
  agentAccessStateRef.current = {
    agents,
    ownedAgents,
    products,
    catalogRevision,
  };
  const accessStateSnapshot = agentAccessSnapshot(agents, ownedAgents, {
    products,
    catalogRevision,
  });
  const accessStateRevisionRef = useRef({
    snapshot: accessStateSnapshot,
    value: 0,
  });
  if (accessStateRevisionRef.current.snapshot !== accessStateSnapshot) {
    accessStateRevisionRef.current = {
      snapshot: accessStateSnapshot,
      value: accessStateRevisionRef.current.value + 1,
    };
  }
  const profileRevisionRef = useRef(0);
  // Local station mutations (for example a just-saved post) must win over a
  // bootstrap request that started before the mutation completed. The
  // revision is captured when a bootstrap starts and checked before its
  // station content snapshot is applied.
  const stationContentMutationRevisionRef = useRef(0);
  const lastSyncAtRef = useRef<string | null>(null);
  const bootstrapPromiseRef = useRef<{
    token: string;
    promise: Promise<void>;
  } | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const sessionExpiryPromiseRef = useRef<Promise<void> | null>(null);
  const expiredTokenRef = useRef('');

  useEffect(() => {
    agentAccessAliveRef.current = true;
    return () => {
      agentAccessAliveRef.current = false;
    };
  }, []);

  const setSessionUser = useSessionSetter(token, tokenRef, setUser);
  const setSessionProfile = useSessionSetter(token, tokenRef, setProfile);
  const setSessionThreads = useSessionSetter(token, tokenRef, setThreads);
  const setSessionNotices = useSessionSetter(token, tokenRef, setNotices);
  const setSessionUnreadNoticeCount = useSessionSetter(
    token,
    tokenRef,
    setUnreadNoticeCount,
  );
  const setSessionProfileVisibility = useSessionSetter(
    token,
    tokenRef,
    setProfileVisibility,
  );
  const setSessionSearchHistory = useSessionSetter(
    token,
    tokenRef,
    setSearchHistory,
  );
  const setSessionRelationships = useSessionSetter(
    token,
    tokenRef,
    setRelationships,
  );
  const setSessionStationContent = useSessionSetter(
    token,
    tokenRef,
    setStationContent,
  );
  const setSessionOwnedAgents = useSessionSetter(
    token,
    tokenRef,
    setOwnedAgents,
  );
  const setSessionError = useSessionSetter(token, tokenRef, setErrorMessage);
  const setSessionNotificationNotice = useSessionSetter(
    token,
    tokenRef,
    setRealtimeNotificationNotice,
  );

  const applyProfileUIPreferences = useCallback((savedProfile: ProfileDTO) => {
    const incoming =
      savedProfile.stationConfig.uiPreferences || defaultUIPreferences();
    // Profile and appearance responses contain snapshots too. A delayed one
    // must not replace a newer server-confirmed UI preference revision.
    if (incoming.revision < uiPreferencesRef.current.revision) {
      return {
        ...savedProfile,
        stationConfig: {
          ...savedProfile.stationConfig,
          uiPreferences: uiPreferencesRef.current,
        },
      };
    }
    uiPreferencesRef.current = incoming;
    setUIPreferences(incoming);
    return savedProfile;
  }, []);

  const applySavedProfile = useCallback(
    (savedProfile: ProfileDTO) => {
      if (!token || tokenRef.current !== token) return;
      profileRevisionRef.current += 1;
      setSessionProfile(applyProfileUIPreferences(savedProfile));
      setSessionUser(current =>
        current ? { ...current, displayName: savedProfile.nickname } : current,
      );
    },
    [applyProfileUIPreferences, setSessionProfile, setSessionUser, token],
  );

  const updateToken = useCallback((nextToken: string) => {
    clearAIContractSession();
    sessionVersionRef.current += 1;
    profileRevisionRef.current = 0;
    uiPreferencesRef.current = defaultUIPreferences();
    bootstrapPromiseRef.current = null;
    syncPromiseRef.current = null;
    if (nextToken) {
      expiredTokenRef.current = '';
    }
    tokenRef.current = nextToken;
    setToken(nextToken);
  }, []);

  const resetAuthenticatedState = useCallback(() => {
    setUser(null);
    setProfile(emptyProfile);
    setThreads([]);
    setModules({});
    setAgents([]);
    setAgentReadiness({});
    setOwnedAgents([]);
    setProducts([]);
    setEntitlements([]);
    setCatalogRevision(null);
    setNotices([]);
    setUnreadNoticeCount(0);
    setProfileVisibility(defaultProfileVisibility);
    setSearchHistory([]);
    setRelationships(emptyRelationships);
    stationContentMutationRevisionRef.current += 1;
    setStationContent(emptyStationContent);
    setUIPreferences(defaultUIPreferences());
    setRealtimeNotificationNotice(null);
    lastSyncAtRef.current = null;
    activeThreadIdRef.current = null;
  }, []);

  const expireSession = useCallback(
    (expiredToken: string) => {
      if (
        expiredTokenRef.current === expiredToken &&
        sessionExpiryPromiseRef.current
      ) {
        return sessionExpiryPromiseRef.current;
      }
      if (!expiredToken || tokenRef.current !== expiredToken) {
        return Promise.resolve();
      }

      expiredTokenRef.current = expiredToken;
      updateToken('');
      resetAuthenticatedState();
      setErrorMessage('登录状态已失效，请重新登录。');
      setRestoreStatus('signedOut');
      const expiry = (async () => {
        await clearLocalSession();
      })();
      sessionExpiryPromiseRef.current = expiry;
      expiry.finally(() => {
        if (sessionExpiryPromiseRef.current === expiry) {
          sessionExpiryPromiseRef.current = null;
        }
      });
      return expiry;
    },
    [resetAuthenticatedState, updateToken],
  );

  useEffect(
    () =>
      setAuthSessionExpiredHandler(({ token: expiredToken }) =>
        expireSession(expiredToken),
      ),
    [expireSession],
  );

  const butlerThread = useMemo(
    () => threads.find(thread => thread.agentId === 'miaoxun-butler') || null,
    [threads],
  );

  const applyBootstrap = useCallback(
    (
      bootstrap: BootstrapDTO,
      requestedProfileRevision = profileRevisionRef.current,
      requestedStationContentRevision = stationContentMutationRevisionRef.current,
    ) => {
      setAIContractSession(tokenRef.current, bootstrap.contracts);
      assertAgentDirectoryIdentity(
        bootstrap.agents.registered,
        bootstrap.agents.owned,
      );
      // A bootstrap started before a confirmed save must not restore its older profile snapshot.
      const profileChanged =
        requestedProfileRevision !== profileRevisionRef.current;
      setUser(current =>
        profileChanged && current
          ? { ...bootstrap.user, displayName: current.displayName }
          : bootstrap.user,
      );
      // UI preferences have their own server CAS revision. A newer UI
      // revision remains valid even if a local identity save superseded
      // the rest of this bootstrap's profile snapshot.
      const previousUIRevision = uiPreferencesRef.current.revision;
      const preferenceProfile = applyProfileUIPreferences(bootstrap.profile);
      if (!profileChanged) {
        setProfile(preferenceProfile);
        setLanguage(bootstrap.profile.stationConfig.language || 'zh');
        setAppearance(bootstrap.profile.stationConfig.appearance || 'light');
      } else if (uiPreferencesRef.current.revision > previousUIRevision) {
        const preferences = uiPreferencesRef.current;
        setProfile(current => ({
          ...current,
          stationConfig: {
            ...current.stationConfig,
            uiPreferences: preferences,
          },
        }));
      }
      setThreads(buildThreads(bootstrap));
      setModules(bootstrap.modules);
      setAgents(bootstrap.agents.registered);
      setAgentReadiness(bootstrap.agentReadiness);
      setOwnedAgents(bootstrap.agents.owned);
      setProducts(bootstrap.products);
      setEntitlements(bootstrap.entitlements);
      setCatalogRevision(bootstrap.catalogRevision);
      setNotices(bootstrap.notices);
      setUnreadNoticeCount(bootstrap.unreadNoticeCount);
      setProfileVisibility(bootstrap.profileVisibility);
      setSearchHistory(bootstrap.searchHistory);
      setRelationships(bootstrap.relationships);
      if (
        requestedStationContentRevision ===
        stationContentMutationRevisionRef.current
      ) {
        setStationContent(bootstrap.stationContent);
      }
      lastSyncAtRef.current = bootstrap.serverTime;
    },
    [applyProfileUIPreferences],
  );

  const refreshBootstrap = useCallback(
    (nextToken = tokenRef.current, showError = true) => {
      if (!nextToken || nextToken !== tokenRef.current) {
        return Promise.resolve();
      }

      if (bootstrapPromiseRef.current?.token === nextToken) {
        return bootstrapPromiseRef.current.promise;
      }

      const sessionVersion = sessionVersionRef.current;
      const requestedProfileRevision = profileRevisionRef.current;
      const requestedStationContentRevision =
        stationContentMutationRevisionRef.current;
      const request = (async () => {
        try {
          const bootstrap = await apiClient.bootstrap(nextToken);
          if (sessionVersionRef.current === sessionVersion) {
            applyBootstrap(
              bootstrap,
              requestedProfileRevision,
              requestedStationContentRevision,
            );
          }
        } catch (error) {
          if (showError && sessionVersionRef.current === sessionVersion) {
            setErrorMessage(
              error instanceof Error ? error.message : '同步失败。',
            );
          }
          throw error;
        }
      })();

      bootstrapPromiseRef.current = { token: nextToken, promise: request };
      request.then(
        () => {
          if (bootstrapPromiseRef.current?.promise === request) {
            bootstrapPromiseRef.current = null;
          }
        },
        () => {
          if (bootstrapPromiseRef.current?.promise === request) {
            bootstrapPromiseRef.current = null;
          }
        },
      );
      return request;
    },
    [applyBootstrap],
  );

  const restoreSession = useCallback(async () => {
    try {
      const savedToken = await tokenStore.read();
      if (!savedToken) {
        setRestoreStatus('signedOut');
        return;
      }
      const bootstrap = await apiClient.bootstrap(savedToken);
      updateToken(savedToken);
      applyBootstrap(bootstrap);
      setRestoreStatus('authenticated');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '登录状态恢复失败。',
      );
      if (isAuthSessionError(error)) {
        await clearLocalSession();
        updateToken('');
        setRestoreStatus('signedOut');
      } else {
        setRestoreStatus('networkError');
      }
    } finally {
      setIsRestoring(false);
    }
  }, [applyBootstrap, updateToken]);

  useEffect(() => {
    restoreSession().catch(() => undefined);
  }, [restoreSession]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      setIsBusy(true);
      setErrorMessage(null);
      try {
        await sessionExpiryPromiseRef.current;
        const response = await apiClient.login(identifier, password);
        const bootstrap = await apiClient.bootstrap(response.session.token);
        await tokenStore.save(response.session.token);
        updateToken(response.session.token);
        applyBootstrap(bootstrap);
        setRestoreStatus('authenticated');
      } catch (error) {
        if (isAuthSessionError(error)) {
          await clearLocalSession();
          updateToken('');
          setRestoreStatus('signedOut');
        }
        setErrorMessage(error instanceof Error ? error.message : '登录失败。');
      } finally {
        setIsBusy(false);
      }
    },
    [applyBootstrap, updateToken],
  );

  const signUp = useCallback(
    async (
      contactType: 'email' | 'phone',
      contact: string,
      password: string,
      displayName: string,
    ) => {
      setIsBusy(true);
      setErrorMessage(null);
      let registeredToken = '';
      let tokenSaved = false;
      try {
        await sessionExpiryPromiseRef.current;
        const response = await apiClient.register(
          contactType,
          contact,
          password,
          displayName,
        );
        registeredToken = response.session.token;
        await tokenStore.save(registeredToken);
        tokenSaved = true;
        const bootstrap = await apiClient.bootstrap(response.session.token);
        updateToken(registeredToken);
        applyBootstrap(bootstrap);
        setRestoreStatus('authenticated');
        return response.user;
      } catch (error) {
        if (registeredToken) {
          if (isAuthSessionError(error)) {
            await clearLocalSession();
            setRestoreStatus('signedOut');
            setErrorMessage('账号已创建，但登录状态已失效。请切换到登录。');
          } else if (tokenSaved) {
            setRestoreStatus('networkError');
            setErrorMessage('账号已创建，但资料同步失败。请重试加载。');
          } else {
            setRestoreStatus('signedOut');
            setErrorMessage('账号已创建，但无法保存登录状态。请切换到登录。');
          }
        } else {
          setErrorMessage(
            error instanceof Error ? error.message : '注册失败。',
          );
        }
        throw error;
      } finally {
        setIsBusy(false);
      }
    },
    [applyBootstrap, updateToken],
  );

  const incrementalSync = useCallback(
    (showError = false) => {
      const currentToken = tokenRef.current;
      if (!currentToken) {
        return Promise.resolve();
      }

      if (syncPromiseRef.current) {
        return syncPromiseRef.current;
      }

      const request = (async () => {
        try {
          const sync = await apiClient.sync(
            lastSyncAtRef.current,
            currentToken,
          );
          if (tokenRef.current !== currentToken) {
            return;
          }
          setThreads(current =>
            mergeThreads(
              current,
              buildThreadsFromSync(sync.threads, sync.messagesByThread),
            ),
          );
          setNotices(sync.notices);
          setUnreadNoticeCount(sync.unreadNoticeCount);
          if (sync.agents) {
            assertAgentDirectoryIdentity(
              sync.agents.registered,
              sync.agents.owned,
            );
            setAgents(sync.agents.registered);
            setOwnedAgents(sync.agents.owned);
          }
          setProducts(sync.products);
          setEntitlements(sync.entitlements);
          setCatalogRevision(sync.catalogRevision);
          lastSyncAtRef.current = sync.serverTime;
        } catch (error) {
          if (tokenRef.current !== currentToken) {
            return;
          }
          if (isAuthSessionError(error)) {
            await expireSession(currentToken);
            return;
          }
          if (showError) {
            setErrorMessage(
              error instanceof Error ? error.message : '增量同步失败。',
            );
          }
        }
      })();

      syncPromiseRef.current = request;
      request.then(
        () => {
          if (syncPromiseRef.current === request) {
            syncPromiseRef.current = null;
          }
        },
        () => {
          if (syncPromiseRef.current === request) {
            syncPromiseRef.current = null;
          }
        },
      );
      return request;
    },
    [expireSession],
  );

  const { refreshNotifications, markNotificationsRead, markNotificationRead } =
    useNotificationActions({
      token,
      setNotices: setSessionNotices,
      setUnreadNoticeCount: setSessionUnreadNoticeCount,
    });

  const setActiveThreadId = useCallback((threadId: string | null) => {
    activeThreadIdRef.current = threadId;
  }, []);

  const setUserPresenceMode = useCallback(
    (presenceMode: PresenceMode) => {
      setSessionUser(current =>
        current ? { ...current, presenceMode } : current,
      );
    },
    [setSessionUser],
  );

  const setStationContentFromMutation = useCallback(
    (value: Parameters<typeof setSessionStationContent>[0]) => {
      stationContentMutationRevisionRef.current += 1;
      setSessionStationContent(value);
    },
    [setSessionStationContent],
  );

  const {
    resolveScanPayload,
    followUser,
    unfollowUser,
    requestFriend,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    refreshRelationships,
    searchUsers,
    saveSearchQuery,
    clearSearchHistory,
    deleteSearchHistoryItem,
    loadPublicProfileByAiId,
  } = useSocialActions({
    token,
    setRelationships: setSessionRelationships,
    setSearchHistory: setSessionSearchHistory,
  });

  const realtimeStatus = useRealtimeChannel({
    token,
    userId: user?.id,
    activeThreadIdRef,
    refreshNotifications,
    refreshRelationships,
    incrementalSync,
    setThreads: setSessionThreads,
    setRelationships: setSessionRelationships,
    setUserPresenceMode,
    setRealtimeNotificationNotice: setSessionNotificationNotice,
  });

  const makeButlerContext = useCallback(
    (currentPage: string): ButlerClientContextPayload => ({
      currentPage,
      language,
      appearance,
      profileSnapshot: {
        nickname: profile.nickname,
        followersCount: profile.followersCount,
        followingCount: profile.followingCount,
        collectionsCount: profile.collectionsCount,
        miaoPoints: profile.miaoPoints,
      },
      enabledAgentIds: ownedAgents.map(agent => agent.id),
    }),
    [appearance, language, ownedAgents, profile],
  );

  const syncStationConfig = useCallback(
    async (nextLanguage: Language, nextAppearance: Appearance) => {
      if (!token) {
        return;
      }
      try {
        const updatedProfile = await apiClient.updateStationConfig(token, {
          language: nextLanguage,
          appearance: nextAppearance,
        });
        if (tokenRef.current !== token) return;
        profileRevisionRef.current += 1;
        const updated = applyProfileUIPreferences(updatedProfile);
        setSessionProfile(current => ({
          ...current,
          stationConfig: updated.stationConfig,
        }));
      } catch (error) {
        setSessionError(
          error instanceof Error ? error.message : '设置同步失败。',
        );
      }
    },
    [applyProfileUIPreferences, setSessionError, setSessionProfile, token],
  );

  const setLanguageAndSync = useCallback(
    (nextLanguage: Language) => {
      setLanguage(nextLanguage);
      syncStationConfig(nextLanguage, appearance).catch(() => undefined);
    },
    [appearance, syncStationConfig],
  );

  const setAppearanceAndSync = useCallback(
    (nextAppearance: Appearance) => {
      setAppearance(nextAppearance);
      syncStationConfig(language, nextAppearance).catch(() => undefined);
    },
    [language, syncStationConfig],
  );

  const setAgentEnabled = useCallback(
    async (
      agentId: string,
      enabled: boolean,
      grantedScopes?: string[],
      confirmedAlbumConsent?: AlbumAIConsentVersion,
      confirmedProductVersionId?: string,
    ) => {
      if (!token || tokenRef.current !== token) {
        throw new Error('请先登录。');
      }
      if (agentAccessBlockedRef.current)
        throw new Error('账号正在退出或注销，请稍后重试。');
      const agent = agents.find(item => item.key === agentId);
      if (!agent) throw new Error('Agent 已不可用，请刷新后重试。');
      // Capture the scopes shown by this client. Server registry additions must
      // never expand an already confirmed grant while the request is in flight.
      if (enabled && !Array.isArray(grantedScopes))
        throw new Error('请先查看并确认 Agent 的授权范围。');
      const scopes = enabled ? [...grantedScopes!] : [];
      const matchingProducts = products.filter(product =>
        product.dependencies.some(
          dependency => dependency.agentKey === agentId,
        ),
      );
      const product =
        matchingProducts.length === 1 ? matchingProducts[0] : null;
      if (
        enabled &&
        (!confirmedProductVersionId ||
          !catalogRevision ||
          product?.status !== 'published' ||
          product.productVersionId !== confirmedProductVersionId)
      )
        throw new Error('请先查看并确认当前产品版本。');
      const confirmedState = agentAccessSnapshot(agents, ownedAgents, {
        products,
        catalogRevision,
      });
      const confirmedRevision = accessStateRevisionRef.current.value;
      const isAccessCurrent = () =>
        confirmedRevision === accessStateRevisionRef.current.value &&
        confirmedState ===
          agentAccessSnapshot(
            agentAccessStateRef.current.agents,
            agentAccessStateRef.current.ownedAgents,
            {
              products: agentAccessStateRef.current.products,
              catalogRevision: agentAccessStateRef.current.catalogRevision,
            },
          );
      const version = sessionVersionRef.current;
      const generation = agentAccessGenerationRef.current;
      const isCurrent = () =>
        agentAccessAliveRef.current &&
        !agentAccessBlockedRef.current &&
        tokenRef.current === token &&
        sessionVersionRef.current === version &&
        agentAccessGenerationRef.current === generation;
      const assertCurrent = () => {
        if (!isCurrent())
          throw new Error('账号状态已变化，已取消 Agent 授权操作。');
      };
      const key = `${token}:${agentId}`;
      if (agentAccessPendingRef.current.has(key))
        throw new Error('此 Agent 授权正在更新，请稍后查看。');
      agentAccessPendingRef.current.add(key);
      try {
        assertCurrent();
        const consentVersion =
          agentId === 'album-manager' && enabled
            ? await albumAssistantConsent(
                token,
                language,
                () => isCurrent() && isAccessCurrent(),
                confirmedAlbumConsent,
              )
            : undefined;
        assertCurrent();
        if (!isAccessCurrent())
          throw new Error('Agent 信息或授权已更新，请重新查看范围后确认。');
        const updated = await apiClient.setAgentEnabled(
          token,
          agentId,
          enabled,
          consentVersion,
          createIdempotencyKey(),
          scopes,
          enabled ? confirmedProductVersionId : undefined,
        );
        assertCurrent();
        setSessionOwnedAgents(current => {
          const remaining = current.filter(item => item.id !== updated.id);
          return updated.enabled ? [...remaining, updated] : remaining;
        });
        await refreshBootstrap(token, false);
        assertCurrent();
        return updated;
      } finally {
        agentAccessPendingRef.current.delete(key);
      }
    },
    [
      agents,
      ownedAgents,
      products,
      catalogRevision,
      language,
      refreshBootstrap,
      setSessionOwnedAgents,
      token,
    ],
  );

  const {
    sendMessage,
    refreshThreadMessages,
    deleteMessage,
    recallMessage,
    markThreadRead,
    setThreadMuted,
    openFriendThread,
  } = useMessageActions({
    token,
    threads,
    currentUserName: user?.displayName,
    makeButlerContext,
    setThreads: setSessionThreads,
    setErrorMessage: setSessionError,
  });

  const signOut = useCallback(async () => {
    agentAccessGenerationRef.current += 1;
    agentAccessBlockedRef.current = true;
    const currentToken = token;
    try {
      if (currentToken) {
        await apiClient.logout(currentToken).catch(() => undefined);
      }
      await clearLocalSession({ requireTokenClear: true });
      updateToken('');
      resetAuthenticatedState();
      setErrorMessage(null);
      setRestoreStatus('signedOut');
    } finally {
      agentAccessBlockedRef.current = false;
    }
  }, [resetAuthenticatedState, token, updateToken]);

  const deleteAccount = useCallback(
    async (password: string) => {
      const currentToken = tokenRef.current;
      if (!currentToken) {
        throw new Error('请先登录。');
      }

      agentAccessGenerationRef.current += 1;
      agentAccessBlockedRef.current = true;
      setIsBusy(true);
      setErrorMessage(null);
      try {
        await apiClient.deleteAccount(currentToken, password);
        await clearLocalSession();
        updateToken('');
        resetAuthenticatedState();
        setRestoreStatus('signedOut');
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '账号注销失败。',
        );
        throw error;
      } finally {
        agentAccessBlockedRef.current = false;
        setIsBusy(false);
      }
    },
    [resetAuthenticatedState, updateToken],
  );

  const retryRestoreSession = useCallback(async () => {
    const savedToken = await tokenStore.read();
    if (!savedToken) {
      setRestoreStatus('signedOut');
      setErrorMessage(null);
      return;
    }
    setIsBusy(true);
    setErrorMessage(null);
    try {
      const bootstrap = await apiClient.bootstrap(savedToken);
      updateToken(savedToken);
      applyBootstrap(bootstrap);
      setRestoreStatus('authenticated');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '登录状态恢复失败。',
      );
      if (isAuthSessionError(error)) {
        await clearLocalSession();
        updateToken('');
        setRestoreStatus('signedOut');
      } else {
        setRestoreStatus('networkError');
      }
    } finally {
      setIsBusy(false);
    }
  }, [applyBootstrap, updateToken]);

  const { updatePresence, updateProfileVisibility, updateProfile } =
    useProfileActions({
      token,
      applySavedProfile,
      setProfileVisibility: setSessionProfileVisibility,
      setUser: setSessionUser,
    });

  const applyConfirmedUIPreferences = useCallback(
    (saved: UIPreferences) => {
      // An older bootstrap in flight must not undo a successful mutation.
      // Conversely, a newer bootstrap can beat this mutation's HTTP receipt.
      if (saved.revision < uiPreferencesRef.current.revision) return;
      profileRevisionRef.current += 1;
      uiPreferencesRef.current = saved;
      setUIPreferences(saved);
      setSessionProfile(current => ({
        ...current,
        stationConfig: {
          ...current.stationConfig,
          uiPreferences: saved,
        },
      }));
    },
    [setSessionProfile],
  );

  const previewUIPreferences = useCallback(
    (instruction: string, surface?: 'messages' | 'miao' | 'secondFloor') =>
      apiClient.previewUIPreferences(token, instruction, surface),
    [token],
  );
  const confirmUIPreferences = useCallback(
    async (previewId: string, baseRevision: number) => {
      const result = await apiClient.confirmUIPreferences(
        token,
        previewId,
        baseRevision,
      );
      if (tokenRef.current !== token)
        throw new Error('登录状态已变更，请重新操作');
      applyConfirmedUIPreferences(result.preferences);
      return result;
    },
    [applyConfirmedUIPreferences, token],
  );
  const resetUIPreferences = useCallback(
    async (baseRevision: number) => {
      const result = await apiClient.resetUIPreferences(token, baseRevision);
      if (tokenRef.current !== token)
        throw new Error('登录状态已变更，请重新操作');
      applyConfirmedUIPreferences(result.preferences);
      return result;
    },
    [applyConfirmedUIPreferences, token],
  );
  const undoUIPreferences = useCallback(
    async (baseRevision: number) => {
      const result = await apiClient.undoUIPreferences(token, baseRevision);
      if (tokenRef.current !== token)
        throw new Error('登录状态已变更，请重新操作');
      applyConfirmedUIPreferences(result.preferences);
      return result;
    },
    [applyConfirmedUIPreferences, token],
  );

  const {
    refreshStationContent,
    listMiaoPointLedger,
    createStationPost,
    deleteStationPost,
    setStationPostInteraction,
    createStationDiary,
    updateStationDiary,
    deleteStationDiary,
    createStationAlbum,
    updateStationAlbum,
    deleteStationAlbum,
    createStationMediaAsset,
    updateStationMediaAsset,
    deleteStationMediaAsset,
    createStationOutfit,
    createStationSiteDraft,
    createStationFileAsset,
    uploadStationFileAsset,
    stationFileAsset,
    deleteStationFileAsset,
    createStationComicDiary,
    deleteStationComicDiary,
    resolveLocation,
  } = useStationActions({
    token,
    avatarConfig: profile.avatarConfig,
    setStationContent: setStationContentFromMutation,
  });

  return {
    token,
    user,
    profile,
    threads,
    modules,
    agents,
    agentReadiness,
    ownedAgents,
    products,
    entitlements,
    catalogRevision,
    notices,
    unreadNoticeCount,
    profileVisibility,
    searchHistory,
    relationships,
    stationContent,
    language,
    appearance,
    uiPreferences,
    previewUIPreferences,
    confirmUIPreferences,
    resetUIPreferences,
    undoUIPreferences,
    isBusy,
    isRestoring,
    restoreStatus,
    errorMessage,
    realtimeStatus,
    realtimeNotificationNotice,
    butlerThread,
    signIn,
    signUp,
    signOut,
    deleteAccount,
    retryRestoreSession,
    refreshBootstrap,
    incrementalSync,
    sendMessage,
    refreshThreadMessages,
    deleteMessage,
    recallMessage,
    markThreadRead,
    setThreadMuted,
    setActiveThreadId,
    setLanguage: setLanguageAndSync,
    setAppearance: setAppearanceAndSync,
    setAgentEnabled,
    clearError: () => setErrorMessage(null),
    resolveScanPayload,
    followUser,
    unfollowUser,
    requestFriend,
    acceptFriendRequest,
    rejectFriendRequest,
    cancelFriendRequest,
    openFriendThread,
    markNotificationsRead,
    markNotificationRead,
    refreshNotifications,
    refreshRelationships,
    searchUsers,
    saveSearchQuery,
    clearSearchHistory,
    deleteSearchHistoryItem,
    loadPublicProfileByAiId,
    updateProfile,
    refreshStationContent,
    listMiaoPointLedger,
    createStationPost,
    deleteStationPost,
    setStationPostInteraction,
    createStationDiary,
    updateStationDiary,
    deleteStationDiary,
    createStationAlbum,
    updateStationAlbum,
    deleteStationAlbum,
    createStationMediaAsset,
    updateStationMediaAsset,
    deleteStationMediaAsset,
    createStationOutfit,
    createStationSiteDraft,
    createStationFileAsset,
    uploadStationFileAsset,
    stationFileAsset,
    deleteStationFileAsset,
    createStationComicDiary,
    deleteStationComicDiary,
    resolveLocation,
    updateProfileVisibility,
    updatePresence,
  };
}
