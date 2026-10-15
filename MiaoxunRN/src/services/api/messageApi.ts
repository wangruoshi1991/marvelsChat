import type { AIContextReference } from '../../models/aiTask';
import {
  ButlerClientContextPayload,
  MessageDTO,
  SendMessageResponse,
} from '../../models/api';
import { request } from './http';
import {
  agentWorkspaceHeaders,
  assertAgentWorkspaceContract,
  assertAIContract,
} from '../aiContract';

export const messageApi = {
  messages(threadId: string, token: string) {
    return request<MessageDTO[]>(`/api/threads/${threadId}/messages`, {
      token,
    });
  },

  sendMessage(
    threadId: string,
    content: string,
    token: string,
    clientContext?: ButlerClientContextPayload | null,
    replyToMessageId?: string | null,
    clientMessageId?: string,
    timeoutMs = 45000,
    contextRefs: AIContextReference[] = [],
    butlerContextReset?: boolean,
  ) {
    if (clientContext || butlerContextReset === true)
      assertAgentWorkspaceContract(token);
    else if (contextRefs.length) assertAIContract(token);
    const body: {
      content: string;
      contextRefs: AIContextReference[];
      butlerContextReset?: boolean;
      clientContext?: ButlerClientContextPayload;
      replyToMessageId?: string;
      clientMessageId?: string;
    } = { content, contextRefs };

    if (butlerContextReset === true) body.butlerContextReset = true;

    if (clientContext) {
      body.clientContext = clientContext;
    }
    if (replyToMessageId) {
      body.replyToMessageId = replyToMessageId;
    }
    if (clientMessageId) {
      body.clientMessageId = clientMessageId;
    }

    return request<SendMessageResponse>(`/api/threads/${threadId}/messages`, {
      method: 'POST',
      token,
      body,
      timeoutMs,
      headers: agentWorkspaceHeaders,
    });
  },

  markThreadRead(threadId: string, token: string) {
    return request<{ ok: boolean }>(`/api/threads/${threadId}/read`, {
      method: 'POST',
      token,
    });
  },

  updateThreadPreferences(
    threadId: string,
    preferences: { muted: boolean },
    token: string,
  ) {
    return request<{ muted: boolean }>(`/api/threads/${threadId}/preferences`, {
      method: 'PATCH',
      token,
      body: preferences,
    });
  },

  deleteMessage(threadId: string, messageId: string, token: string) {
    return request<{ ok: boolean }>(
      `/api/threads/${threadId}/messages/${messageId}`,
      {
        method: 'DELETE',
        token,
      },
    );
  },

  recallMessage(threadId: string, messageId: string, token: string) {
    return request<{ message: MessageDTO }>(
      `/api/threads/${threadId}/messages/${messageId}/recall`,
      {
        method: 'POST',
        token,
      },
    );
  },
};
