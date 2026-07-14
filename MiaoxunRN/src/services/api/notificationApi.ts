import { NotificationListDTO } from '../../models/api';
import { request } from './http';

export const notificationApi = {
  notifications(token: string) {
    return request<NotificationListDTO>('/api/notifications', { token });
  },

  markNotificationsRead(token: string) {
    return request<{ ok: boolean }>('/api/notifications/read', {
      method: 'POST',
      token,
    });
  },

  markNotificationRead(notificationId: string, token: string) {
    return request<{ ok: boolean }>(
      `/api/notifications/${notificationId}/read`,
      {
        method: 'POST',
        token,
      },
    );
  },
};
