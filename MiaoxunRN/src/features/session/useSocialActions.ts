import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { PublicProfileDTO, SearchHistoryDTO } from '../../models/api';
import { apiClient } from '../../services/apiClient';
import { RelationshipsState } from './sessionTypes';

export function useSocialActions({
  token,
  setRelationships,
  setSearchHistory,
}: {
  token: string;
  setRelationships: Dispatch<SetStateAction<RelationshipsState>>;
  setSearchHistory: Dispatch<SetStateAction<SearchHistoryDTO[]>>;
}) {
  const currentTokenRef = useRef(token);
  currentTokenRef.current = token;
  const relationshipRefreshRef = useRef(0);
  const resolveScanPayload = useCallback(
    async (payload: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.resolveScan(payload, token);
    },
    [token],
  );

  const followUser = useCallback(
    async (targetUserId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.followUser(targetUserId, token);
    },
    [token],
  );

  const unfollowUser = useCallback(
    async (targetUserId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.unfollowUser(targetUserId, token);
    },
    [token],
  );

  const requestFriend = useCallback(
    async (targetUserId: string, message = '') => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.requestFriend(targetUserId, token, message);
    },
    [token],
  );

  const acceptFriendRequest = useCallback(
    async (requestId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.acceptFriendRequest(requestId, token);
    },
    [token],
  );

  const rejectFriendRequest = useCallback(
    async (requestId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.rejectFriendRequest(requestId, token);
    },
    [token],
  );

  const cancelFriendRequest = useCallback(
    async (requestId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.cancelFriendRequest(requestId, token);
    },
    [token],
  );

  const refreshRelationships = useCallback(async () => {
    if (!token) {
      return;
    }
    const pageSize = 100;
    const refreshId = ++relationshipRefreshRef.current;
    const loadAll = async (type: 'following' | 'followers' | 'friends') => {
      const profiles: RelationshipsState[typeof type] = [];
      let before: { createdAt: string; relationId: string } | undefined;
      while (true) {
        const page = await apiClient.relationships(type, token, {
          limit: pageSize,
          before,
        });
        profiles.push(...page);
        if (page.length < pageSize) {
          return profiles;
        }
        before = page.at(-1)?.cursor;
        if (!before) {
          throw new Error('关系列表分页信息缺失，请重试。');
        }
      }
    };
    const [following, followers, friends] = await Promise.all([
      loadAll('following'),
      loadAll('followers'),
      loadAll('friends'),
    ]);
    if (
      currentTokenRef.current === token &&
      relationshipRefreshRef.current === refreshId
    ) {
      setRelationships({ following, followers, friends });
    }
  }, [setRelationships, token]);

  const searchUsers = useCallback(
    async (query: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const trimmed = query.trim();
      if (!trimmed) {
        return [] as PublicProfileDTO[];
      }
      const [profiles, history] = await Promise.all([
        apiClient.searchUsers(trimmed, token),
        apiClient.saveSearchHistory(trimmed, token),
      ]);
      setSearchHistory(history);
      return profiles;
    },
    [setSearchHistory, token],
  );

  const saveSearchQuery = useCallback(
    async (query: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const trimmed = query.trim();
      if (!trimmed) {
        return [] as SearchHistoryDTO[];
      }
      const history = await apiClient.saveSearchHistory(
        trimmed,
        token,
        'contacts',
      );
      setSearchHistory(history);
      return history;
    },
    [setSearchHistory, token],
  );

  const clearSearchHistory = useCallback(async () => {
    if (!token) {
      throw new Error('请先登录。');
    }
    const history = await apiClient.clearSearchHistory(token);
    setSearchHistory(history);
  }, [setSearchHistory, token]);

  const deleteSearchHistoryItem = useCallback(
    async (historyId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const history = await apiClient.deleteSearchHistoryItem(historyId, token);
      setSearchHistory(history);
    },
    [setSearchHistory, token],
  );

  const loadPublicProfileByAiId = useCallback(
    async (aiId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      return apiClient.profileByAiId(aiId, token);
    },
    [token],
  );

  return {
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
  };
}
