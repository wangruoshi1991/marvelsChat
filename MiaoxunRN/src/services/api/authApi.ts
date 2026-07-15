import { AuthResponse, UserConsentPayload } from '../../models/api';
import { request } from './http';

export const authApi = {
  login(identifier: string, password: string) {
    return request<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: { identifier, password },
    });
  },

  register(
    contactType: 'email' | 'phone',
    contact: string,
    password: string,
    displayName: string,
    consent?: UserConsentPayload,
  ) {
    return request<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: {
        contactType,
        ...(contactType === 'email'
          ? { email: contact }
          : { phoneNumber: contact }),
        password,
        displayName,
        ...(consent ? { consent } : {}),
      },
    });
  },

  logout(token: string) {
    return request<{ ok: boolean }>('/api/auth/logout', {
      method: 'POST',
      token,
    });
  },
};
