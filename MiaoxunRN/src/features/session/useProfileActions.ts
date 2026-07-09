import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  AvatarConfigDTO,
  PresenceMode,
  ProfileDTO,
  ProfileVisibilityDTO,
  UserDTO,
} from '../../models/api';
import { apiClient } from '../../services/apiClient';

type RefreshBootstrap = (
  nextToken?: string,
  showError?: boolean,
) => Promise<void>;

export function useProfileActions({
  token,
  refreshBootstrap,
  setProfile,
  setProfileVisibility,
  setUser,
}: {
  token: string;
  refreshBootstrap: RefreshBootstrap;
  setProfile: Dispatch<SetStateAction<ProfileDTO>>;
  setProfileVisibility: Dispatch<SetStateAction<ProfileVisibilityDTO>>;
  setUser: Dispatch<SetStateAction<UserDTO | null>>;
}) {
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
      const updated = await apiClient.updateProfileVisibility(
        token,
        visibility,
      );
      setProfileVisibility(updated);
      return updated;
    },
    [setProfileVisibility, token],
  );

  const updateProfile = useCallback(
    async (nextProfile: {
      nickname: string;
      avatarText: string;
      bio: string;
      community: string;
      activityArea: string;
      avatarConfig: AvatarConfigDTO;
    }) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const updated = await apiClient.updateProfile(token, nextProfile);
      setProfile(updated);
      setUser(current =>
        current ? { ...current, displayName: updated.nickname } : current,
      );
      await refreshBootstrap(undefined, false);
      return updated;
    },
    [refreshBootstrap, setProfile, setUser, token],
  );

  return {
    updatePresence,
    updateProfileVisibility,
    updateProfile,
  };
}
