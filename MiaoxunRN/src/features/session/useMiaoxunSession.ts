import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentReadinessDTO,
  AgentDTO,
  BootstrapDTO,
  ButlerClientContextPayload,
  ModuleDTO,
  NoticeDTO,
  OwnedAgentDTO,
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
  const [isBusy, setIsBusy] = useState(false);
  const [isRestoring, setIsRestoring] = useState(true);
  const [restoreStatus, setRestoreStatus] = useState<RestoreStatus>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [realtimeNotificationNotice, setRealtimeNotificationNotice] =
    useState<RealtimeNotificationNotice | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const tokenRef = useRef('');
  const sessionVersionRef = useRef(0);
  const profileRevisionRef = useRef(0);
  const lastSyncAtRef = useRef<string | null>(null);
  const bootstrapPromiseRef = useRef<{
    token: string;
    promise: Promise<void>;
  } | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);
  const sessionExpiryPromiseRef = useRef<Promise<void> | null>(null);
  const expiredTokenRef = useRef('');

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

  const applySavedProfile = useCallback(
    (savedProfile: ProfileDTO) => {
      if (!token || tokenRef.current !== token) return;
      profileRevisionRef.current += 1;
      setSessionProfile(savedProfile);
      setSessionUser(current =>
        current ? { ...current, displayName: savedProfile.nickname } : current,
      );
    },
    [setSessionProfile, setSessionUser, token],
  );

  const updateToken = useCallback((nextToken: string) => {
    sessionVersionRef.current += 1;
    profileRevisionRef.current = 0;
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
    setNotices([]);
    setUnreadNoticeCount(0);
    setProfileVisibility(defaultProfileVisibility);
    setSearchHistory([]);
    setRelationships(emptyRelationships);
    setStationContent(emptyStationContent);
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
    ) => {
      // A bootstrap started before a confirmed save must not restore its older profile snapshot.
      const profileChanged =
        requestedProfileRevision !== profileRevisionRef.current;
      setUser(current =>
        profileChanged && current
          ? { ...bootstrap.user, displayName: current.displayName }
          : bootstrap.user,
      );
      if (!profileChanged) {
        setProfile(bootstrap.profile);
        setLanguage(bootstrap.profile.stationConfig.language || 'zh');
        setAppearance(bootstrap.profile.stationConfig.appearance || 'light');
      }
      setThreads(buildThreads(bootstrap));
      setModules(bootstrap.modules);
      setAgents(bootstrap.agents.registered);
      setAgentReadiness(bootstrap.agentReadiness);
      setOwnedAgents(bootstrap.agents.owned);
      setNotices(bootstrap.notices);
      setUnreadNoticeCount(bootstrap.unreadNoticeCount);
      setProfileVisibility(bootstrap.profileVisibility);
      setSearchHistory(bootstrap.searchHistory);
      setRelationships(bootstrap.relationships);
      setStationContent(bootstrap.stationContent);
      lastSyncAtRef.current = bootstrap.serverTime;
    },
    [],
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
      const request = (async () => {
        try {
          const bootstrap = await apiClient.bootstrap(nextToken);
          if (sessionVersionRef.current === sessionVersion) {
            applyBootstrap(bootstrap, requestedProfileRevision);
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
        setSessionProfile(current => ({
          ...current,
          stationConfig: updatedProfile.stationConfig,
        }));
      } catch (error) {
        setSessionError(
          error instanceof Error ? error.message : '设置同步失败。',
        );
      }
    },
    [setSessionError, setSessionProfile, token],
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
    async (agentId: string, enabled: boolean) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const updated = await apiClient.setAgentEnabled(token, agentId, enabled);
      setSessionOwnedAgents(current => {
        const remaining = current.filter(agent => agent.id !== updated.id);
        return updated.enabled ? [...remaining, updated] : remaining;
      });
      await refreshBootstrap(token, false);
      return updated;
    },
    [refreshBootstrap, setSessionOwnedAgents, token],
  );

  const {
    sendMessage,
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
    const currentToken = token;
    if (currentToken) {
      await apiClient.logout(currentToken).catch(() => undefined);
    }
    await clearLocalSession({ requireTokenClear: true });
    updateToken('');
    resetAuthenticatedState();
    setErrorMessage(null);
    setRestoreStatus('signedOut');
  }, [resetAuthenticatedState, token, updateToken]);

  const deleteAccount = useCallback(
    async (password: string) => {
      const currentToken = tokenRef.current;
      if (!currentToken) {
        throw new Error('请先登录。');
      }

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
    applyStationSiteDraft,
    createStationFileAsset,
    preprocessStationFileAsset,
    listStationAlbumSuggestions,
    applyStationAlbumSuggestion,
    createStationComicDiary,
    deleteStationComicDiary,
    createStationVideoDraft,
    resolveLocation,
  } = useStationActions({
    token,
    avatarConfig: profile.avatarConfig,
    setStationContent: setSessionStationContent,
    setProfile: setSessionProfile,
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
    notices,
    unreadNoticeCount,
    profileVisibility,
    searchHistory,
    relationships,
    stationContent,
    language,
    appearance,
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
    applyStationSiteDraft,
    createStationFileAsset,
    preprocessStationFileAsset,
    listStationAlbumSuggestions,
    applyStationAlbumSuggestion,
    createStationComicDiary,
    deleteStationComicDiary,
    createStationVideoDraft,
    resolveLocation,
    updateProfileVisibility,
    updatePresence,
  };
}
