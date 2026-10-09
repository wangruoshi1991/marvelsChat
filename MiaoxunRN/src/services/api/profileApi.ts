import {
  LocationResolveDTO,
  OwnedAgentDTO,
  ProfileDTO,
  ProfileUpdateInput,
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

  async updateProfile(token: string, profile: ProfileUpdateInput) {
    const updated = await request<ProfileDTO>('/api/me/profile', {
      method: 'PATCH',
      token,
      body: profile,
    });
    for (const key of [
      'headline',
      'publicLocation',
      'experienceYears',
      'languages',
    ] as const) {
      if (
        profile[key] !== undefined &&
        JSON.stringify(updated[key]) !== JSON.stringify(profile[key])
      ) {
        throw new Error(
          '资料接口返回的保存结果与提交内容不一致，请刷新后重试。',
        );
      }
    }
    return updated;
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

  setAgentEnabled(
    token: string,
    agentId: string,
    enabled: boolean,
    albumAIConsentVersion?: string,
    idempotencyKey?: string,
  ) {
    return request<OwnedAgentDTO>(`/api/me/agents/${agentId}`, {
      method: 'PATCH',
      token,
      body: {
        enabled,
        ...(albumAIConsentVersion ? { albumAIConsentVersion } : {}),
      },
      ...(idempotencyKey
        ? { headers: { 'Idempotency-Key': idempotencyKey } }
        : {}),
    });
  },
};
