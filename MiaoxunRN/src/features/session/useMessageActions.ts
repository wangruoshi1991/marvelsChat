import type { AIContextReference } from '../../models/aiTask';
import { usesAgentDispatch } from '../../models/agentDispatch';
import {
  WorkspaceContextSelector,
  WorkspaceDiscussionContext,
  isWorkspaceDiscussionContext,
  workspaceContextSelector,
} from '../../models/workspaceContext';
import { Dispatch, SetStateAction, useCallback, useRef } from 'react';
import { ButlerClientContextPayload } from '../../models/api';
import { apiClient } from '../../services/apiClient';
import { MiaoxunApiError } from '../../services/api/http';
import {
  assertAgentWorkspaceContract,
  assertAIContract,
} from '../../services/aiContract';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import {
  AssistMessageSource,
  normalizeAssistMessageSource,
} from '../assist/assistMessageSource';
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
  const refreshes = useRef(new Map<string, Promise<void>>());
  const sendMessage = useCallback(
    async (
      threadId: string,
      content: string,
      retryMessageId?: string,
      replyToMessageId?: string | null,
      contextRefs: AIContextReference[] = [],
      assistSource?: AssistMessageSource,
      butlerContextReset?: boolean,
      workspaceContext?: WorkspaceDiscussionContext,
      agentContextReset?: boolean,
    ) => {
      const thread = threads.find(item => item.id === threadId);
      const isButler = thread?.agentId === 'miaoxun-butler';
      const isProfessional = usesAgentDispatch(thread?.agentId);
      const retryMessage = thread?.messages.find(
        message => message.id === retryMessageId,
      );
      if (
        retryMessageId &&
        (!retryMessage ||
          retryMessage.senderType !== 'user' ||
          retryMessage.localStatus !== 'failed' ||
          !retryMessage.clientMessageId)
      ) {
        setErrorMessage('原失败消息已不可重试，请刷新会话后核对原提交。');
        return false;
      }
      const originalReply = retryMessage?.metadata?.replyTo;
      const submittedReplyToMessageId = retryMessage
        ? originalReply &&
          typeof originalReply === 'object' &&
          'messageId' in originalReply &&
          typeof originalReply.messageId === 'string'
          ? originalReply.messageId
          : null
        : replyToMessageId;
      const submittedContent = retryMessage?.content ?? content;
      const submittedReferences = (
        retryMessage ? retryMessage.metadata?.contextRefs || [] : contextRefs
      ).map(reference => ({ ...reference }));
      const submittedResetValue = retryMessage
        ? retryMessage.metadata?.butlerContextReset
        : butlerContextReset;
      const submittedReset = isButler && submittedResetValue === true;
      const submittedAgentResetValue = retryMessage
        ? retryMessage.metadata?.agentContextReset
        : agentContextReset;
      const submittedAgentReset =
        isProfessional && submittedAgentResetValue === true;
      const submittedWorkspace = retryMessage
        ? retryMessage.metadata?.workspaceContext
        : workspaceContext;
      let submittedSource: AssistMessageSource | undefined;
      try {
        if (
          submittedAgentResetValue !== undefined &&
          (!isProfessional ||
            submittedResetValue !== undefined ||
            submittedWorkspace !== undefined)
        )
          throw new Error('专业 Agent 的新需求不能混用管家或任务讨论上下文。');
        if (submittedResetValue !== undefined && !isButler)
          throw new Error('专业 Agent 不能使用管家上下文重置。');
        if (
          submittedWorkspace !== undefined &&
          (!isButler ||
            !isWorkspaceDiscussionContext(submittedWorkspace) ||
            submittedReferences.length ||
            submittedReplyToMessageId ||
            submittedResetValue !== undefined)
        )
          throw new Error(
            '任务讨论关联无效，不能同时附加其他素材或回复。请重新打开原任务。',
          );
        // Retries keep the original location even if the user has navigated
        // elsewhere. A new caller cannot replace an accepted request's source.
        submittedSource = normalizeAssistMessageSource(
          retryMessage ? retryMessage.metadata?.assistSource : assistSource,
        );
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : 'AI 请求来源无效。',
        );
        return false;
      }
      const clientMessageId =
        retryMessage?.clientMessageId || createIdempotencyKey();
      const optimisticId = retryMessageId || `local-${clientMessageId}`;
      const optimistic: ChatMessage = {
        id: optimisticId,
        threadId,
        senderType: 'user',
        senderName: currentUserName || '我',
        content: submittedContent,
        clientMessageId,
        metadata: {
          contextRefs: submittedReferences,
          ...(submittedReset ? { butlerContextReset: true } : {}),
          ...(submittedAgentReset ? { agentContextReset: true } : {}),
          ...(submittedSource ? { assistSource: submittedSource } : {}),
          ...(submittedWorkspace
            ? { workspaceContext: { ...submittedWorkspace } }
            : {}),
          ...(submittedReplyToMessageId
            ? { replyTo: { messageId: submittedReplyToMessageId } }
            : {}),
        },
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
                        ? {
                            ...message,
                            localStatus: 'sending',
                            localFailure: undefined,
                          }
                        : message,
                    )
                  : [...item.messages, optimistic],
                lastContent: submittedContent,
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
                  messages: [
                    ...item.messages.map(message =>
                      message.id === optimisticId
                        ? { ...message, localStatus: 'failed' as const }
                        : message,
                    ),
                    localNotice,
                  ],
                  lastContent: reply,
                }
              : item,
          ),
        );
        return false;
      }

      try {
        if (isButler || isProfessional) assertAgentWorkspaceContract(token);
        else if (thread?.agentId || submittedReferences.length)
          assertAIContract(token);
        const response = await apiClient.sendMessage(
          threadId,
          submittedContent,
          token,
          isButler
            ? makeButlerContext(
                submittedSource?.currentPage || 'messages.butler',
              )
            : null,
          submittedReplyToMessageId,
          clientMessageId,
          45000,
          submittedReferences,
          ...((submittedAgentReset
            ? [undefined, undefined, true]
            : submittedWorkspace
            ? [undefined, workspaceContextSelector(submittedWorkspace)]
            : submittedReset
            ? [true]
            : []) as [boolean?, WorkspaceContextSelector?, boolean?]),
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
                      ? {
                          ...message,
                          localStatus: 'failed',
                          localFailure: {
                            message:
                              error instanceof Error
                                ? error.message
                                : '消息发送失败。',
                            ...(error instanceof MiaoxunApiError && error.code
                              ? { code: error.code }
                              : {}),
                          },
                        }
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

  const refreshThreadMessages = useCallback(
    (threadId: string) => {
      if (!token) return Promise.resolve();
      const key = `${token}:${threadId}`;
      const running = refreshes.current.get(key);
      if (running) return running;
      const refresh = apiClient
        .messages(threadId, token)
        .then(messages => {
          setThreads(current =>
            current.map(thread =>
              thread.id === threadId
                ? {
                    ...thread,
                    messages: mergeMessages(
                      thread.messages,
                      messages.map(mapMessage),
                    ),
                    lastContent: messages.at(-1)?.content || thread.lastContent,
                  }
                : thread,
            ),
          );
        })
        .finally(() => refreshes.current.delete(key));
      refreshes.current.set(key, refresh);
      return refresh;
    },
    [setThreads, token],
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
          thread.id === threadId ? { ...thread, muted } : thread,
        ),
      );

      if (!token) {
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId
              ? { ...thread, muted: previousMuted }
              : thread,
          ),
        );
        throw new Error('请先登录。');
      }

      try {
        const preferences = await apiClient.updateThreadPreferences(
          threadId,
          { muted },
          token,
        );
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId
              ? { ...thread, muted: preferences.muted }
              : thread,
          ),
        );
      } catch (error) {
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId
              ? { ...thread, muted: previousMuted }
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
    refreshThreadMessages,
    deleteMessage,
    recallMessage,
    markThreadRead,
    setThreadMuted,
    openFriendThread,
  };
}
