import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from 'react';
import { MessageDTO, PresenceMode } from '../../models/api';
import { apiClient, buildRealtimeUrl } from '../../services/apiClient';
import { realtimeReconnectDelaysMs } from './sessionDefaults';
import {
  applyPresenceToRelationships,
  mapMessage,
  mergeMessages,
} from './sessionMappers';
import { ChatThread, RealtimeStatus, RelationshipsState } from './sessionTypes';

export type RealtimeNotificationNotice = {
  id: string | null;
  kind: string | null;
  title: string;
  body: string;
};

type RealtimeChannelOptions = {
  token: string;
  userId?: string;
  activeThreadIdRef: MutableRefObject<string | null>;
  refreshNotifications: () => Promise<void>;
  incrementalSync: (showError?: boolean) => Promise<void>;
  setThreads: Dispatch<SetStateAction<ChatThread[]>>;
  setRelationships: Dispatch<SetStateAction<RelationshipsState>>;
  setUserPresenceMode: (presenceMode: PresenceMode) => void;
  setRealtimeNotificationNotice: Dispatch<
    SetStateAction<RealtimeNotificationNotice | null>
  >;
};

export function useRealtimeChannel({
  token,
  userId,
  activeThreadIdRef,
  refreshNotifications,
  incrementalSync,
  setThreads,
  setRelationships,
  setUserPresenceMode,
  setRealtimeNotificationNotice,
}: RealtimeChannelOptions) {
  const [realtimeStatus, setRealtimeStatus] =
    useState<RealtimeStatus>('disconnected');
  const realtimeSocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) {
      setRealtimeStatus('disconnected');
      return undefined;
    }

    let reconnectAttempt = 0;
    let closedByEffect = false;

    const clearReconnectTimer = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    const reportBackgroundFailure = () => {
      setRealtimeStatus('error');
    };

    const connect = () => {
      clearReconnectTimer();
      setRealtimeStatus('connecting');
      const socket = new WebSocket(
        buildRealtimeUrl(`/realtime?token=${encodeURIComponent(token)}`),
      );
      realtimeSocketRef.current = socket;

      socket.onopen = () => {
        reconnectAttempt = 0;
        setRealtimeStatus('connected');
      };
      socket.onerror = () => {
        setRealtimeStatus('error');
      };
      socket.onclose = () => {
        if (realtimeSocketRef.current === socket) {
          realtimeSocketRef.current = null;
        }
        if (closedByEffect) {
          return;
        }

        const delay =
          realtimeReconnectDelaysMs[
            Math.min(reconnectAttempt, realtimeReconnectDelaysMs.length - 1)
          ];
        reconnectAttempt += 1;
        setRealtimeStatus(current =>
          current === 'error' ? 'error' : 'disconnected',
        );
        reconnectTimerRef.current = setTimeout(connect, delay);
      };
      socket.onmessage = event => {
        const payload = parseRealtimePayload(event.data);
        if (!payload) {
          setRealtimeStatus('error');
          return;
        }

        if (payload.type === 'connection.ready') {
          incrementalSync(false).catch(reportBackgroundFailure);
          return;
        }

        if (payload.type === 'thread.message' && 'message' in payload) {
          const message = mapMessage(payload.message as MessageDTO);
          const activeThreadId = activeThreadIdRef.current;
          setThreads(current =>
            current.map(thread =>
              thread.id === message.threadId
                ? {
                    ...thread,
                    messages: mergeMessages(thread.messages, [message]),
                    lastContent: message.content,
                    lastMessageAt: message.createdAt || thread.lastMessageAt,
                    unreadCount:
                      activeThreadId === message.threadId
                        ? 0
                        : thread.unreadCount + 1,
                  }
                : thread,
            ),
          );
          if (activeThreadId === message.threadId) {
            apiClient
              .markThreadRead(message.threadId, token)
              .catch(reportBackgroundFailure);
          }
          return;
        }

        if (payload.type === 'thread.message.updated' && 'message' in payload) {
          const message = mapMessage(payload.message as MessageDTO);
          setThreads(current =>
            current.map(thread =>
              thread.id === message.threadId
                ? {
                    ...thread,
                    messages: mergeMessages(thread.messages, [message]),
                    lastContent: message.recalledAt
                      ? ''
                      : message.content || thread.lastContent,
                    lastMessageAt: message.createdAt || thread.lastMessageAt,
                  }
                : thread,
            ),
          );
          return;
        }

        if (
          payload.type === 'notification.changed' ||
          payload.type === 'relationships.changed'
        ) {
          if (payload.type === 'notification.changed') {
            const title =
              typeof payload.title === 'string' ? payload.title.trim() : '';
            const body =
              typeof payload.body === 'string' ? payload.body.trim() : '';
            if (title || body) {
              setRealtimeNotificationNotice({
                id:
                  typeof payload.notificationId === 'string'
                    ? payload.notificationId
                    : null,
                kind:
                  typeof payload.notificationKind === 'string'
                    ? payload.notificationKind
                    : null,
                title,
                body,
              });
            }
          }
          refreshNotifications().catch(reportBackgroundFailure);
          incrementalSync().catch(reportBackgroundFailure);
          return;
        }

        if (payload.type === 'presence.changed') {
          const changedUserId =
            'userId' in payload && typeof payload.userId === 'string'
              ? payload.userId
              : '';
          const presenceStatus =
            'presenceStatus' in payload &&
            (payload.presenceStatus === 'online' ||
              payload.presenceStatus === 'offline')
              ? payload.presenceStatus
              : null;
          const presenceMode =
            'presenceMode' in payload &&
            (payload.presenceMode === 'online' ||
              payload.presenceMode === 'offline' ||
              payload.presenceMode === 'hidden')
              ? payload.presenceMode
              : null;

          if (changedUserId && changedUserId === userId && presenceMode) {
            setUserPresenceMode(presenceMode);
          }
          if (changedUserId && presenceStatus) {
            setThreads(current =>
              current.map(thread =>
                thread.peerUserId === changedUserId
                  ? { ...thread, peerPresenceStatus: presenceStatus }
                  : thread,
              ),
            );
            setRelationships(current =>
              applyPresenceToRelationships(
                current,
                changedUserId,
                presenceStatus,
              ),
            );
          }
          incrementalSync().catch(reportBackgroundFailure);
        }
      };
    };

    connect();

    return () => {
      closedByEffect = true;
      clearReconnectTimer();
      const socket = realtimeSocketRef.current;
      if (socket) {
        realtimeSocketRef.current = null;
        socket.close();
      }
    };
  }, [
    activeThreadIdRef,
    incrementalSync,
    refreshNotifications,
    setRelationships,
    setThreads,
    setRealtimeNotificationNotice,
    setUserPresenceMode,
    token,
    userId,
  ]);

  return realtimeStatus;
}

function parseRealtimePayload(
  data: unknown,
): { type?: unknown; [key: string]: unknown } | null {
  try {
    const payload = JSON.parse(String(data));
    return payload && typeof payload === 'object' && 'type' in payload
      ? payload
      : null;
  } catch {
    return null;
  }
}
