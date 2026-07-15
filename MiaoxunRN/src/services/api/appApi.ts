import {
  AccountDeletionDTO,
  AppSyncDTO,
  AuthResponse,
  BootstrapDTO,
  LegalPoliciesDTO,
  PresenceMode,
  UserConsentDTO,
  UserConsentPayload,
} from '../../models/api';
import { request } from './http';

export const appApi = {
  legalPolicies() {
    return request<LegalPoliciesDTO>('/api/legal/policies');
  },

  recordConsents(token: string, payload: UserConsentPayload) {
    return request<UserConsentDTO>('/api/me/consents', {
      method: 'POST',
      token,
      body: payload,
    });
  },

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
