import type { AIContextReference } from '../../models/aiTask';
import {
  WorkspaceContextSelector,
  workspaceContextSelector,
} from '../../models/workspaceContext';
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
  supportsUIPreferences,
  uiPreferencesHeaders,
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
    workspaceContext?: WorkspaceContextSelector,
    agentContextReset?: boolean,
  ) {
    if (
      agentContextReset !== undefined &&
      (clientContext ||
        butlerContextReset !== undefined ||
        workspaceContext !== undefined)
    )
      throw new Error('专业 Agent 的新需求不能混用管家或任务讨论上下文。');
    if (
      workspaceContext !== undefined &&
      (contextRefs.length ||
        replyToMessageId ||
        butlerContextReset !== undefined)
    )
      throw new Error('任务讨论不能同时附加其他素材、回复或新的需求上下文。');
    if (
      workspaceContext !== undefined &&
      (typeof clientMessageId !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          clientMessageId,
        ))
    )
      throw new Error('任务讨论需要有效的消息标识，请重试。');
    if (
      clientContext ||
      butlerContextReset === true ||
      workspaceContext ||
      agentContextReset === true
    )
      assertAgentWorkspaceContract(token);
    else if (contextRefs.length) assertAIContract(token);
    const body: {
      content: string;
      contextRefs: AIContextReference[];
      butlerContextReset?: boolean;
      agentContextReset?: boolean;
      clientContext?: ButlerClientContextPayload;
      replyToMessageId?: string;
      clientMessageId?: string;
      workspaceContext?: WorkspaceContextSelector;
    } = { content, contextRefs };

    if (butlerContextReset === true) body.butlerContextReset = true;
    if (agentContextReset === true) body.agentContextReset = true;

    if (clientContext) {
      body.clientContext = clientContext;
    }
    if (replyToMessageId) {
      body.replyToMessageId = replyToMessageId;
    }
    if (clientMessageId) {
      body.clientMessageId = clientMessageId;
    }
    if (workspaceContext !== undefined) {
      body.workspaceContext = workspaceContextSelector(workspaceContext);
    }

    return request<SendMessageResponse>(`/api/threads/${threadId}/messages`, {
      method: 'POST',
      token,
      body,
      timeoutMs,
      headers: {
        ...agentWorkspaceHeaders,
        ...(supportsUIPreferences(token) ? uiPreferencesHeaders : {}),
      },
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
