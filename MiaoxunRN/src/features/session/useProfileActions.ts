import { useCallback, useRef } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  PresenceMode,
  ProfileDTO,
  ProfileUpdateInput,
  ProfileVisibilityDTO,
  UserDTO,
} from '../../models/api';
import { apiClient } from '../../services/apiClient';
import { useCurrentScope } from '../../shared/useCurrentScope';

export function useProfileActions({
  token,
  applySavedProfile,
  setProfileVisibility,
  setUser,
}: {
  token: string;
  applySavedProfile: (profile: ProfileDTO) => void;
  setProfileVisibility: (visibility: ProfileVisibilityDTO) => void;
  setUser: Dispatch<SetStateAction<UserDTO | null>>;
}) {
  const isCurrentSession = useCurrentScope(token);
  const visibilityWrites = useRef(
    new Map<string, Promise<ProfileVisibilityDTO>>(),
  );
  const updatePresence = useCallback(
    async (presenceMode: PresenceMode) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const updatedUser = await apiClient.updatePresence(token, presenceMode);
      setUser(updatedUser);
      return updatedUser;
    },
    [setUser, token],
  );

  const updateProfileVisibility = useCallback(
    async (visibility: Partial<ProfileVisibilityDTO>) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const patch = { ...visibility };
      const previous = visibilityWrites.current.get(token);
      const write = (async () => {
        if (previous) await previous.catch(() => undefined);
        if (!isCurrentSession()) throw new Error('登录账号已切换。');
        try {
          const updated = await apiClient.updateProfileVisibility(token, patch);
          if (isCurrentSession()) setProfileVisibility(updated);
          return updated;
        } catch (error) {
          if (isCurrentSession()) {
            try {
              const current = await apiClient.profileVisibility(token);
              if (isCurrentSession()) setProfileVisibility(current);
            } catch {
              throw new Error(
                '隐私设置同步失败，暂时无法读取服务器状态，请重试。',
              );
            }
          }
          throw error;
        }
      })();
      visibilityWrites.current.set(token, write);
      try {
        return await write;
      } finally {
        if (visibilityWrites.current.get(token) === write)
          visibilityWrites.current.delete(token);
      }
    },
    [isCurrentSession, setProfileVisibility, token],
  );

  const updateProfile = useCallback(
    async (nextProfile: ProfileUpdateInput) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const updated = await apiClient.updateProfile(token, nextProfile);
      applySavedProfile(updated);
      return updated;
    },
    [applySavedProfile, token],
  );

  return {
    updatePresence,
    updateProfileVisibility,
    updateProfile,
  };
}
