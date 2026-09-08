import {
  AccountDeletionDTO,
  AppSyncDTO,
  AuthResponse,
  BootstrapDTO,
  PresenceMode,
} from '../../models/api';
import { request } from './http';
import { assertStationContentContract } from './stationContentContract';

export const appApi = {
  deleteAccount(token: string, password: string) {
    return request<AccountDeletionDTO>('/api/account', {
      method: 'DELETE',
      token,
      body: { password, confirmation: 'DELETE' },
    });
  },

  updatePresence(token: string, presenceMode: PresenceMode) {
    return request<AuthResponse['user']>('/api/me/presence', {
      method: 'PATCH',
      token,
      body: { presenceMode },
    });
  },

  async bootstrap(token: string) {
    const bootstrap = await request<BootstrapDTO>('/api/app/bootstrap', {
      token,
    });
    assertStationContentContract(
      bootstrap?.stationContent,
      '/api/app/bootstrap.stationContent',
    );
    return bootstrap;
  },

  sync(updatedAfter: string | null, token: string) {
    const query = updatedAfter
      ? `?updatedAfter=${encodeURIComponent(updatedAfter)}`
      : '';
    return request<AppSyncDTO>(`/api/app/sync${query}`, { token });
  },
};
