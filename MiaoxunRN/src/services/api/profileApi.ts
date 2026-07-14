import {
  LocationResolveDTO,
  OwnedAgentDTO,
  ProfileDTO,
  ProfileVisibilityDTO,
} from '../../models/api';
import { longRequestTimeoutMs, request } from './http';

export const profileApi = {
  updateStationConfig(
    token: string,
    config: { language?: 'zh' | 'en'; appearance?: 'light' | 'dark' },
  ) {
    return request<ProfileDTO>('/api/me/station-config', {
      method: 'PATCH',
      token,
      body: config,
    });
  },

  updateProfile(
    token: string,
    profile: Pick<
      ProfileDTO,
      | 'nickname'
      | 'avatarText'
      | 'bio'
      | 'community'
      | 'activityArea'
      | 'avatarConfig'
    >,
  ) {
    return request<ProfileDTO>('/api/me/profile', {
      method: 'PATCH',
      token,
      body: profile,
    });
  },

  resolveLocation(
    token: string,
    coordinates: { latitude: number; longitude: number },
  ) {
    return request<LocationResolveDTO>('/api/location/resolve', {
      method: 'POST',
      token,
      body: coordinates,
      timeoutMs: longRequestTimeoutMs,
    });
  },

  updateProfileVisibility(
    token: string,
    visibility: Partial<ProfileVisibilityDTO>,
  ) {
    return request<ProfileVisibilityDTO>('/api/me/profile-visibility', {
      method: 'PATCH',
      token,
      body: visibility,
    });
  },

  setAgentEnabled(token: string, agentId: string, enabled: boolean) {
    return request<OwnedAgentDTO>(`/api/me/agents/${agentId}`, {
      method: 'PATCH',
      token,
      body: { enabled },
    });
  },
};
