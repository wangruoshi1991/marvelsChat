import { Dispatch, SetStateAction, useCallback } from 'react';
import {
  ButlerClientContextPayload,
  ButlerLocalActionResultPayload,
} from '../../models/api';
import { apiClient } from '../../services/apiClient';
import { appErrorMessage } from './sessionDefaults';
import { mapMessage, mergeMessages, mergeThreads } from './sessionMappers';
import { ChatMessage, ChatThread } from './sessionTypes';

type UseMessageActionsOptions = {
  token: string;
  threads: ChatThread[];
  currentUserName?: string;
  makeButlerContext: (currentPage: string) => ButlerClientContextPayload;
  setThreads: Dispatch<SetStateAction<ChatThread[]>>;
  setErrorMessage: Dispatch<SetStateAction<string | null>>;
};

export function useMessageActions({
  token,
  threads,
  currentUserName,
  makeButlerContext,
  setThreads,
  setErrorMessage,
}: UseMessageActionsOptions) {
  const sendMessage = useCallback(
    async (
      threadId: string,
      content: string,
      appActionResult?: ButlerLocalActionResultPayload | null,
      retryMessageId?: string,
      replyToMessageId?: string | null,
    ) => {
      const thread = threads.find(item => item.id === threadId);
      const isButler = thread?.agentId === 'miaoxun-butler';
      const optimisticId = retryMessageId || `local-${Date.now()}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        threadId,
        senderType: 'user',
        senderName: currentUserName || '我',
        content,
        localStatus: 'sending',
      };

      setThreads(current =>
        current.map(item =>
          item.id === threadId
            ? {
                ...item,
                messages: retryMessageId
                  ? item.messages.map(message =>
                      message.id === retryMessageId
                        ? { ...message, localStatus: 'sending' }
                        : message,
                    )
                  : [...item.messages, optimistic],
                lastContent: content,
              }
            : item,
        ),
      );

      if (!token) {
        const reply = isButler
          ? '请先在设置里登录后端账号。登录后我会读取同账号的聊天、粉丝数、小站设置和 Agent 记录。'
          : '请先登录后端账号后再发送消息。';
        const localNotice: ChatMessage = {
          id: `system-local-${Date.now()}`,
          threadId,
          senderType: 'system',
          senderName: '系统',
          content: reply,
        };
        setThreads(current =>
          current.map(item =>
            item.id === threadId
              ? {
                  ...item,
                  messages: [...item.messages, localNotice],
                  lastContent: reply,
                }
              : item,
          ),
        );
        return false;
      }

      try {
        const response = await apiClient.sendMessage(
          threadId,
          content,
          token,
          isButler ? makeButlerContext('messages.butler') : null,
          appActionResult,
          replyToMessageId,
        );
        const incoming = response.messages.map(mapMessage);
        setThreads(current =>
          current.map(item =>
            item.id === threadId
              ? {
                  ...item,
                  messages: mergeMessages(
                    item.messages.filter(
                      message => message.id !== optimisticId,
                    ),
                    incoming,
                  ),
                  lastContent: incoming.at(-1)?.content || item.lastContent,
                  unreadCount: 0,
                }
              : item,
          ),
        );
        return true;
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '消息发送失败。',
        );
        setThreads(current =>
          current.map(item =>
            item.id === threadId
              ? {
                  ...item,
                  messages: item.messages.map(message =>
                    message.id === optimisticId
                      ? { ...message, localStatus: 'failed' }
                      : message,
                  ),
                }
              : item,
          ),
        );
        return false;
      }
    },
    [
      currentUserName,
      makeButlerContext,
      setErrorMessage,
      setThreads,
      threads,
      token,
    ],
  );

  const deleteMessage = useCallback(
    async (threadId: string, messageId: string) => {
      const removeMessage = (thread: ChatThread) => {
        const messages = thread.messages.filter(
          message => message.id !== messageId,
        );
        return {
          ...thread,
          messages,
          lastContent: messages.at(-1)?.content || '',
          lastMessageAt: messages.at(-1)?.createdAt || thread.lastMessageAt,
        };
      };

      if (messageId.startsWith('local-')) {
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId ? removeMessage(thread) : thread,
          ),
        );
        return;
      }
      if (!token) {
        throw new Error('请先登录。');
      }
      await apiClient.deleteMessage(threadId, messageId, token);
      setThreads(current =>
        current.map(thread =>
          thread.id === threadId ? removeMessage(thread) : thread,
        ),
      );
    },
    [setThreads, token],
  );

  const recallMessage = useCallback(
    async (threadId: string, messageId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      try {
        const response = await apiClient.recallMessage(
          threadId,
          messageId,
          token,
        );
        const message = mapMessage(response.message);
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId
              ? {
                  ...thread,
                  messages: mergeMessages(thread.messages, [message]),
                  lastContent: '',
                }
              : thread,
          ),
        );
      } catch (error) {
        throw new Error(appErrorMessage(error, 'Recall failed.'));
      }
    },
    [setThreads, token],
  );

  const markThreadRead = useCallback(
    async (threadId: string) => {
      setThreads(current =>
        current.map(thread =>
          thread.id === threadId ? { ...thread, unreadCount: 0 } : thread,
        ),
      );

      if (!token) {
        return;
      }

      try {
        await apiClient.markThreadRead(threadId, token);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : '已读状态同步失败。',
        );
      }
    },
    [setErrorMessage, setThreads, token],
  );

  const setThreadMuted = useCallback(
    async (threadId: string, muted: boolean) => {
      const previousMuted =
        threads.find(thread => thread.id === threadId)?.muted || false;
      setThreads(current =>
        current.map(thread =>
          thread.id === threadId ? {...thread, muted} : thread,
        ),
      );

      if (!token) {
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId
              ? {...thread, muted: previousMuted}
              : thread,
          ),
        );
        throw new Error('请先登录。');
      }

      try {
        const preferences = await apiClient.updateThreadPreferences(
          threadId,
          {muted},
          token,
        );
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId
              ? {...thread, muted: preferences.muted}
              : thread,
          ),
        );
      } catch (error) {
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId
              ? {...thread, muted: previousMuted}
              : thread,
          ),
        );
        throw new Error(appErrorMessage(error, 'Notification setting failed.'));
      }
    },
    [setThreads, threads, token],
  );

  const openFriendThread = useCallback(
    async (friendUserId: string) => {
      if (!token) {
        throw new Error('请先登录。');
      }
      const bundle = await apiClient.friendThread(friendUserId, token);
      const thread: ChatThread = {
        ...bundle.thread,
        messages: bundle.messages.map(mapMessage),
      };
      setThreads(current => mergeThreads(current, [thread]));
      return thread;
    },
    [setThreads, token],
  );

  return {
    sendMessage,
    deleteMessage,
    recallMessage,
    markThreadRead,
    setThreadMuted,
    openFriendThread,
  };
}
