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
import { apiClient, isAuthSessionError } from '../../services/apiClient';
import { tokenStore } from '../../services/tokenStore';
import { Appearance } from '../../shared/theme';
import {
  defaultProfileVisibility,
  emptyProfile,
  emptyRelationships,
  emptyStationContent,
  syncIntervalMs,
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
import { useStationActions } from './useStationActions';

export type {
  ChatMessage,
  ChatThread,
  Language,
  RealtimeStatus,
  RestoreStatus,
} from './sessionTypes';

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
  const lastSyncAtRef = useRef<string | null>(null);
  const bootstrapPromiseRef = useRef<Promise<void> | null>(null);
  const syncPromiseRef = useRef<Promise<void> | null>(null);

  const updateToken = useCallback((nextToken: string) => {
    tokenRef.current = nextToken;
    setToken(nextToken);
  }, []);

  const butlerThread = useMemo(
    () => threads.find(thread => thread.agentId === 'miaoxun-butler') || null,
    [threads],
  );

  const applyBootstrap = useCallback((bootstrap: BootstrapDTO) => {
    setUser(bootstrap.user);
    setProfile(bootstrap.profile);
    setThreads(buildThreads(bootstrap));
    setModules(bootstrap.modules);
    setAgents(bootstrap.agents.registered);
    setAgentReadiness(bootstrap.agentReadiness || {});
    setOwnedAgents(bootstrap.agents.owned);
    setNotices(bootstrap.notices || []);
    setUnreadNoticeCount(bootstrap.unreadNoticeCount || 0);
    setProfileVisibility(
      bootstrap.profileVisibility || defaultProfileVisibility,
    );
    setSearchHistory(bootstrap.searchHistory || []);
    setRelationships(bootstrap.relationships || emptyRelationships);
    setStationContent(bootstrap.stationContent || emptyStationContent);
    setLanguage(bootstrap.profile.stationConfig.language || 'zh');
    setAppearance(bootstrap.profile.stationConfig.appearance || 'light');
    lastSyncAtRef.current = bootstrap.serverTime || new Date().toISOString();
  }, []);

  const refreshBootstrap = useCallback(
    (nextToken = tokenRef.current, showError = true) => {
      if (!nextToken) {
        return Promise.resolve();
      }

      if (bootstrapPromiseRef.current) {
        return bootstrapPromiseRef.current;
      }

      const request = (async () => {
        try {
          const bootstrap = await apiClient.bootstrap(nextToken);
          applyBootstrap(bootstrap);
        } catch (error) {
          if (showError) {
            setErrorMessage(
              error instanceof Error ? error.message : '同步失败。',
            );
          }
          throw error;
        }
      })();

      bootstrapPromiseRef.current = request;
      request.then(
        () => {
          if (bootstrapPromiseRef.current === request) {
            bootstrapPromiseRef.current = null;
          }
        },
        () => {
          if (bootstrapPromiseRef.current === request) {
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
      await refreshBootstrap(savedToken, false);
      updateToken(savedToken);
      setRestoreStatus('authenticated');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '登录状态恢复失败。',
      );
      if (isAuthSessionError(error)) {
        await tokenStore.clear().catch(() => undefined);
        updateToken('');
        setRestoreStatus('signedOut');
      } else {
        setRestoreStatus('networkError');
      }
    } finally {
      setIsRestoring(false);
    }
  }, [refreshBootstrap, updateToken]);

  useEffect(() => {
    restoreSession().catch(() => undefined);
  }, [restoreSession]);

  const signIn = useCallback(
    async (identifier: string, password: string) => {
      setIsBusy(true);
      setErrorMessage(null);
      try {
        const response = await apiClient.login(identifier, password);
        await refreshBootstrap(response.session.token);
        await tokenStore.save(response.session.token);
        updateToken(response.session.token);
        setRestoreStatus('authenticated');
      } catch (error) {
        if (isAuthSessionError(error)) {
          await tokenStore.clear().catch(() => undefined);
          updateToken('');
          setRestoreStatus('signedOut');
        }
        setErrorMessage(error instanceof Error ? error.message : '登录失败。');
      } finally {
        setIsBusy(false);
      }
    },
    [refreshBootstrap, updateToken],
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
      try {
        const response = await apiClient.register(
          contactType,
          contact,
          password,
          displayName,
        );
        await refreshBootstrap(response.session.token);
        await tokenStore.save(response.session.token);
        updateToken(response.session.token);
        setRestoreStatus('authenticated');
        return response.user;
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : '注册失败。');
        throw error;
      } finally {
        setIsBusy(false);
      }
    },
    [refreshBootstrap, updateToken],
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
          if (sync.notices) {
            setNotices(sync.notices);
          }
          if (typeof sync.unreadNoticeCount === 'number') {
            setUnreadNoticeCount(sync.unreadNoticeCount);
          }
          lastSyncAtRef.current = sync.serverTime;
        } catch (error) {
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
    [],
  );

  const { refreshNotifications, markNotificationsRead, markNotificationRead } =
    useNotificationActions({
      token,
      setNotices,
      setUnreadNoticeCount,
    });

  useEffect(() => {
    if (!token) {
      return undefined;
    }

    const timer = setInterval(() => {
      incrementalSync().catch(() => undefined);
    }, syncIntervalMs);
    return () => clearInterval(timer);
  }, [incrementalSync, token]);

  const setActiveThreadId = useCallback((threadId: string | null) => {
    activeThreadIdRef.current = threadId;
  }, []);

  const setUserPresenceMode = useCallback((presenceMode: PresenceMode) => {
    setUser(current => (current ? { ...current, presenceMode } : current));
  }, []);

  const realtimeStatus = useRealtimeChannel({
    token,
    userId: user?.id,
    activeThreadIdRef,
    refreshNotifications,
    incrementalSync,
    setThreads,
    setRelationships,
    setUserPresenceMode,
    setRealtimeNotificationNotice,
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
        setProfile(updatedProfile);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '设置同步失败。',
        );
      }
    },
    [token],
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
      setOwnedAgents(current => {
        const remaining = current.filter(agent => agent.id !== updated.id);
        return updated.enabled ? [...remaining, updated] : remaining;
      });
      await refreshBootstrap(token, false);
      return updated;
    },
    [refreshBootstrap, token],
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
    setThreads,
    setErrorMessage,
  });

  const signOut = useCallback(async () => {
    const currentToken = token;
    if (currentToken) {
      await apiClient.logout(currentToken);
    }
    await tokenStore.clear().catch(() => undefined);
    updateToken('');
    setUser(null);
    setProfile(emptyProfile);
    setThreads([]);
    setModules({});
    setAgents([]);
    setAgentReadiness({});
    setNotices([]);
    setUnreadNoticeCount(0);
    setProfileVisibility(defaultProfileVisibility);
    setSearchHistory([]);
    setRelationships(emptyRelationships);
    setStationContent(emptyStationContent);
    lastSyncAtRef.current = null;
    activeThreadIdRef.current = null;
    setErrorMessage(null);
    setRestoreStatus('signedOut');
  }, [token, updateToken]);

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
      await refreshBootstrap(savedToken, false);
      updateToken(savedToken);
      setRestoreStatus('authenticated');
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '登录状态恢复失败。',
      );
      if (isAuthSessionError(error)) {
        await tokenStore.clear().catch(() => undefined);
        updateToken('');
        setRestoreStatus('signedOut');
      } else {
        setRestoreStatus('networkError');
      }
    } finally {
      setIsBusy(false);
    }
  }, [refreshBootstrap, updateToken]);

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
    loadPublicProfileByAiId,
  } = useSocialActions({
    token,
    setRelationships,
    setSearchHistory,
  });

  const { updatePresence, updateProfileVisibility, updateProfile } =
    useProfileActions({
      token,
      refreshBootstrap,
      setProfile,
      setProfileVisibility,
      setUser,
    });

  const {
    refreshStationContent,
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
    createStationModelJob,
    syncStationModelJob,
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
    setStationContent,
    setProfile,
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
    loadPublicProfileByAiId,
    updateProfile,
    refreshStationContent,
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
    createStationModelJob,
    syncStationModelJob,
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
