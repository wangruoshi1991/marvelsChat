import {
  ButlerClientContextPayload,
  ButlerLocalActionResultPayload,
  MessageDTO,
  SendMessageResponse,
} from '../../models/api';
import { longRequestTimeoutMs, request } from './http';

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
    localActionResult?: ButlerLocalActionResultPayload | null,
    replyToMessageId?: string | null,
  ) {
    const body: {
      content: string;
      clientContext?: ButlerClientContextPayload;
      localActionResult?: ButlerLocalActionResultPayload;
      replyToMessageId?: string;
    } = { content };

    if (clientContext) {
      body.clientContext = clientContext;
    }
    if (localActionResult) {
      body.localActionResult = localActionResult;
    }
    if (replyToMessageId) {
      body.replyToMessageId = replyToMessageId;
    }

    return request<SendMessageResponse>(`/api/threads/${threadId}/messages`, {
      method: 'POST',
      token,
      body,
      timeoutMs: longRequestTimeoutMs,
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
