import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import {
  PresenceMode,
  ProfileDTO,
  ProfileUpdateInput,
  ProfileVisibilityDTO,
  UserDTO,
} from '../../models/api';
import { apiClient } from '../../services/apiClient';

export function useProfileActions({
  token,
  applySavedProfile,
  setProfileVisibility,
  setUser,
}: {
  token: string;
  applySavedProfile: (profile: ProfileDTO) => void;
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
