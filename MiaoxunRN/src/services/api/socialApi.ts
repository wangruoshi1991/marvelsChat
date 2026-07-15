import {
  FriendThreadDTO,
  PublicProfileDTO,
  RelationshipProfileDTO,
  SearchHistoryDTO,
} from '../../models/api';
import { request } from './http';

export const socialApi = {
  resolveScan(payload: string, token: string) {
    return request<PublicProfileDTO>('/api/scan/resolve', {
      method: 'POST',
      token,
      body: { payload },
    });
  },

  followUser(targetUserId: string, token: string) {
    return request<{ ok: boolean }>(`/api/social/follows/${targetUserId}`, {
      method: 'POST',
      token,
    });
  },

  unfollowUser(targetUserId: string, token: string) {
    return request<{ ok: boolean }>(`/api/social/follows/${targetUserId}`, {
      method: 'DELETE',
      token,
    });
  },

  requestFriend(targetUserId: string, token: string, message = '') {
    return request<{ id: string; status: string }>(
      `/api/social/friend-requests/${targetUserId}`,
      {
        method: 'POST',
        token,
        body: { message },
      },
    );
  },

  acceptFriendRequest(requestId: string, token: string) {
    return request<{ id: string; status: string }>(
      `/api/social/friend-requests/${requestId}/accept`,
      {
        method: 'POST',
        token,
      },
    );
  },

  rejectFriendRequest(requestId: string, token: string) {
    return request<{ id: string; status: string }>(
      `/api/social/friend-requests/${requestId}/reject`,
      {
        method: 'POST',
        token,
      },
    );
  },

  cancelFriendRequest(requestId: string, token: string) {
    return request<{ id: string; status: string }>(
      `/api/social/friend-requests/${requestId}/cancel`,
      {
        method: 'POST',
        token,
      },
    );
  },

  relationships(type: 'following' | 'followers' | 'friends', token: string) {
    return request<RelationshipProfileDTO[]>(
      `/api/social/relationships/${type}`,
      { token },
    );
  },

  friendThread(friendUserId: string, token: string) {
    return request<FriendThreadDTO>(
      `/api/social/friends/${friendUserId}/thread`,
      {
        method: 'POST',
        token,
      },
    );
  },

  searchUsers(query: string, token: string) {
    return request<PublicProfileDTO[]>(
      `/api/search/users?query=${encodeURIComponent(query)}`,
      { token },
    );
  },

  profileByAiId(aiId: string, token: string) {
    return request<PublicProfileDTO>(
      `/api/profiles/ai/${encodeURIComponent(aiId)}`,
      { token },
    );
  },

  saveSearchHistory(query: string, token: string, scope = 'all') {
    return request<SearchHistoryDTO[]>('/api/search/history', {
      method: 'POST',
      token,
      body: { query, scope },
    });
  },

  clearSearchHistory(token: string) {
    return request<SearchHistoryDTO[]>('/api/search/history', {
      method: 'DELETE',
      token,
    });
  },
};
