import { useCallback } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { NoticeDTO } from '../../models/api';
import { apiClient } from '../../services/apiClient';

export function useNotificationActions({
  token,
  setNotices,
  setUnreadNoticeCount,
}: {
  token: string;
  setNotices: Dispatch<SetStateAction<NoticeDTO[]>>;
  setUnreadNoticeCount: Dispatch<SetStateAction<number>>;
}) {
  const refreshNotifications = useCallback(async () => {
    if (!token) {
      return;
    }
    const nextNotifications = await apiClient.notifications(token);
    setNotices(nextNotifications.items);
    setUnreadNoticeCount(nextNotifications.unreadCount);
  }, [setNotices, setUnreadNoticeCount, token]);

  const markNotificationsRead = useCallback(async () => {
    if (!token) {
      return;
    }
    await apiClient.markNotificationsRead(token);
    setNotices(current =>
      current.map(notice => ({
        ...notice,
        readAt: notice.readAt || new Date().toISOString(),
      })),
    );
    setUnreadNoticeCount(0);
    await refreshNotifications();
  }, [refreshNotifications, setNotices, setUnreadNoticeCount, token]);

  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      if (!token) {
        return;
      }
      await apiClient.markNotificationRead(notificationId, token);
      setNotices(current =>
        current.map(notice =>
          notice.id === notificationId
            ? { ...notice, readAt: notice.readAt || new Date().toISOString() }
            : notice,
        ),
      );
      await refreshNotifications();
    },
    [refreshNotifications, setNotices, token],
  );

  return {
    refreshNotifications,
    markNotificationsRead,
    markNotificationRead,
  };
}
