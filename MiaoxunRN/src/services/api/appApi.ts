import { AppSyncDTO, AuthResponse, BootstrapDTO, PresenceMode } from '../../models/api';
import { request } from './http';

export const appApi = {
  updatePresence(token: string, presenceMode: PresenceMode) {
    return request<AuthResponse['user']>('/api/me/presence', {
      method: 'PATCH',
      token,
      body: { presenceMode },
    });
  },

  bootstrap(token: string) {
    return request<BootstrapDTO>('/api/app/bootstrap', { token });
  },

  sync(updatedAfter: string | null, token: string) {
    const query = updatedAfter
      ? `?updatedAfter=${encodeURIComponent(updatedAfter)}`
      : '';
    return request<AppSyncDTO>(`/api/app/sync${query}`, { token });
  },
};
