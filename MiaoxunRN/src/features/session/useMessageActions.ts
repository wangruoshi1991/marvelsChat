import type { AIContextReference } from '../../models/aiTask';
import type { ContentPreviewContext } from '../../models/chatContentPreview';
import { usesAgentDispatch } from '../../models/agentDispatch';
import {
  WorkspaceDiscussionContext,
  isWorkspaceDiscussionContext,
  workspaceContextSelector,
} from '../../models/workspaceContext';
import { Dispatch, SetStateAction, useCallback, useRef } from 'react';
import { useCurrentScope } from '../../shared/useCurrentScope';
import { ButlerClientContextPayload, MessageDTO } from '../../models/api';
import { apiClient } from '../../services/apiClient';
import { MiaoxunApiError } from '../../services/api/http';
import {
  assertAgentWorkspaceContract,
  assertAIContract,
  assertChatContentContract,
} from '../../services/aiContract';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import {
  AssistMessageSource,
  normalizeAssistMessageSource,
} from '../assist/assistMessageSource';
import { appErrorMessage } from './sessionDefaults';
import {
  mapMessage,
  mergeMessages,
  mergeThreads,
  mergeThreadMessageActivity,
  mergeThreadState,
  sortThreadsByActivity,
} from './sessionMappers';
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
  const isCurrentSession = useCurrentScope(token);
  const inFlightSends = useRef(new Set<string>());
  const threadReads = useRef(new Map<string, Set<number>>());
  const threadMuteWrites = useRef(new Map<string, Promise<void>>());
  const applyForwardReceipt = useCallback(
    (threadId: string, messages: MessageDTO[]) => {
      if (!isCurrentSession()) return;
      setThreads(current =>
        sortThreadsByActivity(
          current.map(thread =>
            thread.id === threadId
              ? mergeThreadMessageActivity(thread, messages.map(mapMessage))
              : thread,
          ),
        ),
      );
    },
    [isCurrentSession, setThreads],
  );
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
      contentPreviewContext?: ContentPreviewContext,
      attachmentIds?: string[],
      stickerId?: string,
    ) => {
      if (inFlightSends.current.has(threadId)) return false;
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
      if (
        !retryMessageId &&
        attachmentIds?.length &&
        thread?.messages.some(
          message =>
            message.localStatus === 'failed' &&
            message.metadata?.attachmentIds?.some(id =>
              attachmentIds.includes(id),
            ),
        )
      ) {
        setErrorMessage('这组附件已有失败消息，请从原消息入口精确重试。');
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
      const submittedPreview = retryMessage
        ? retryMessage.metadata?.contentPreviewContext
        : contentPreviewContext;
      const submittedStickerId = retryMessage
        ? retryMessage.metadata?.sticker?.id
        : stickerId;
      const requestedSource = retryMessage
        ? retryMessage.metadata?.assistSource
        : assistSource;
      const originalAttachmentIds = retryMessage
        ? retryMessage.metadata?.attachmentIds || []
        : attachmentIds || [];
      const submittedAttachmentIds = [...originalAttachmentIds];
      let submittedSource: AssistMessageSource | undefined;
      try {
        if (
          retryMessage &&
          attachmentIds !== undefined &&
          (attachmentIds.length !== originalAttachmentIds.length ||
            attachmentIds.some(
              (id, index) => id !== originalAttachmentIds[index],
            ))
        )
          throw new Error('失败消息的附件已固定，请按原附件重试。');
        if (
          submittedAttachmentIds.length &&
          ((thread?.kind !== 'direct' && thread?.kind !== 'group') ||
            thread?.agentId ||
            isButler ||
            isProfessional ||
            submittedReferences.length ||
            submittedResetValue !== undefined ||
            submittedAgentResetValue !== undefined ||
            submittedWorkspace !== undefined ||
            submittedPreview !== undefined ||
            requestedSource !== undefined)
        )
          throw new Error('普通聊天附件不能与 Agent、工作区或创作上下文混用。');
        if (submittedStickerId) {
          if (
            submittedContent.trim() ||
            submittedAttachmentIds.length ||
            submittedReferences.length ||
            submittedReplyToMessageId ||
            submittedResetValue !== undefined ||
            submittedAgentResetValue !== undefined ||
            submittedWorkspace !== undefined ||
            submittedPreview !== undefined ||
            requestedSource !== undefined ||
            (thread?.kind !== 'direct' && thread?.kind !== 'group') ||
            thread?.agentId
          )
            throw new Error('自定义表情消息不能与文字、附件或其他上下文混用。');
        }
        if (
          submittedPreview &&
          (thread?.agentId !== 'comic-diary' ||
            submittedWorkspace ||
            submittedReset ||
            submittedAgentReset ||
            submittedReplyToMessageId)
        )
          throw new Error('创作修改关联不能混用其他回复或任务上下文。');
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
          ((!isButler && !(isProfessional && submittedWorkspace.nodeId)) ||
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
        submittedSource = normalizeAssistMessageSource(requestedSource);
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
          ...(submittedPreview
            ? { contentPreviewContext: { ...submittedPreview } }
            : {}),
          ...(submittedAttachmentIds.length
            ? { attachmentIds: submittedAttachmentIds }
            : {}),
          ...(submittedStickerId
            ? { sticker: { id: submittedStickerId } }
            : {}),
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

      inFlightSends.current.add(threadId);

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
        inFlightSends.current.delete(threadId);
        return false;
      }

      try {
        if (thread?.agentId === 'comic-diary') assertChatContentContract(token);
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
          submittedReset || undefined,
          submittedWorkspace
            ? workspaceContextSelector(submittedWorkspace)
            : undefined,
          submittedAgentReset || undefined,
          submittedPreview,
          submittedAttachmentIds.length ? submittedAttachmentIds : undefined,
          submittedStickerId,
        );
        const incoming = response.messages.map(mapMessage);
        setThreads(current =>
          sortThreadsByActivity(
            current.map(item =>
              item.id === threadId
                ? {
                    ...mergeThreadMessageActivity(
                      {
                        ...item,
                        messages: item.messages.filter(
                          message => message.id !== optimisticId,
                        ),
                      },
                      incoming,
                    ),
                  }
                : item,
            ),
          ),
        );
        inFlightSends.current.delete(threadId);
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
        inFlightSends.current.delete(threadId);
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
            sortThreadsByActivity(
              current.map(thread =>
                thread.id === threadId
                  ? mergeThreadMessageActivity(thread, messages.map(mapMessage))
                  : thread,
              ),
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
    async (
      threadId: string,
      readThrough: number,
      isCurrentScreen: () => boolean,
    ) => {
      if (!token || !isCurrentSession()) return;
      const key = JSON.stringify([token, threadId]);
      const positions = threadReads.current.get(key) || new Set<number>();
      if (positions.has(readThrough)) return;
      positions.add(readThrough);
      threadReads.current.set(key, positions);
      const applyReadState = ({
        unreadSequence,
        readSequence,
      }: {
        unreadSequence: number;
        readSequence: number;
      }) => {
        if (
          !Number.isSafeInteger(unreadSequence) ||
          !Number.isSafeInteger(readSequence) ||
          readSequence < 0 ||
          readSequence > unreadSequence
        )
          throw new Error('服务器未返回有效的聊天已读位置。');
        if (isCurrentSession()) {
          setThreads(current =>
            current.map(thread =>
              thread.id === threadId
                ? {
                    ...thread,
                    ...mergeThreadState(thread, {
                      unreadSequence,
                      readSequence,
                    }),
                  }
                : thread,
            ),
          );
        }
      };
      try {
        applyReadState(
          await apiClient.markThreadRead(threadId, token, readThrough),
        );
      } catch (error) {
        if (!isCurrentSession()) return;
        try {
          applyReadState(await apiClient.threadState(threadId, token));
        } catch {
          // Keep the known position if the authoritative read also fails.
        }
        if (isCurrentSession() && isCurrentScreen())
          setErrorMessage(appErrorMessage(error, '已读状态同步失败。'));
      } finally {
        positions.delete(readThrough);
        if (!positions.size) threadReads.current.delete(key);
      }
    },
    [isCurrentSession, setErrorMessage, setThreads, token],
  );

  const setThreadMuted = useCallback(
    async (threadId: string, muted: boolean) => {
      if (!token || !isCurrentSession()) throw new Error('请先登录。');
      const key = JSON.stringify([token, threadId]);
      const previous = threadMuteWrites.current.get(key);
      setThreads(current =>
        current.map(thread =>
          thread.id === threadId ? { ...thread, pendingMuted: muted } : thread,
        ),
      );
      const applyPreferences = (preferences?: {
        muted: boolean;
        preferencesRevision: number;
      }) => {
        if (!isCurrentSession()) return;
        const isLatest = threadMuteWrites.current.get(key) === operation;
        setThreads(current =>
          current.map(thread =>
            thread.id === threadId
              ? {
                  ...thread,
                  ...(preferences ? mergeThreadState(thread, preferences) : {}),
                  pendingMuted: isLatest ? undefined : thread.pendingMuted,
                }
              : thread,
          ),
        );
      };
      const operation = Promise.resolve().then(async () => {
        if (previous) await previous.catch(() => undefined);
        if (!isCurrentSession()) return;
        const write = async () => {
          const { preferencesRevision } = await apiClient.threadState(
            threadId,
            token,
          );
          if (
            !isCurrentSession() ||
            threadMuteWrites.current.get(key) !== operation
          )
            return;
          if (
            !Number.isSafeInteger(preferencesRevision) ||
            preferencesRevision < 0
          )
            throw new Error('服务器未返回有效的免打扰版本。');
          const preferences = await apiClient.updateThreadPreferences(
            threadId,
            { muted, baseRevision: preferencesRevision },
            token,
          );
          applyPreferences(preferences);
        };
        try {
          try {
            await write();
          } catch (error) {
            if (
              !(error instanceof MiaoxunApiError) ||
              error.code !== 'THREAD_PREFERENCES_CHANGED'
            )
              throw error;
            await write();
          }
        } catch (error) {
          if (!isCurrentSession()) return;
          try {
            const { muted: serverMuted, preferencesRevision } =
              await apiClient.threadState(threadId, token);
            applyPreferences({ muted: serverMuted, preferencesRevision });
          } catch {
            applyPreferences();
          }
          if (
            isCurrentSession() &&
            threadMuteWrites.current.get(key) === operation
          )
            throw new Error(appErrorMessage(error, '免打扰设置同步失败。'));
        }
      });
      threadMuteWrites.current.set(key, operation);
      try {
        await operation;
      } finally {
        if (threadMuteWrites.current.get(key) === operation)
          threadMuteWrites.current.delete(key);
      }
    },
    [isCurrentSession, setThreads, token],
  );

  const openFriendThread = useCallback(
    async (friendUserId: string) => {
      if (!token || !isCurrentSession()) {
        throw new Error('请先登录。');
      }
      const bundle = await apiClient.friendThread(friendUserId, token);
      if (!isCurrentSession()) throw new Error('登录账号已切换。');
      const thread: ChatThread = {
        ...bundle.thread,
        messages: bundle.messages.map(mapMessage),
      };
      setThreads(current =>
        isCurrentSession() ? mergeThreads(current, [thread]) : current,
      );
      return thread;
    },
    [isCurrentSession, setThreads, token],
  );

  return {
    applyForwardReceipt,
    sendMessage,
    refreshThreadMessages,
    deleteMessage,
    recallMessage,
    markThreadRead,
    setThreadMuted,
    openFriendThread,
  };
}
