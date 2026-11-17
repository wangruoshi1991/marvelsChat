import type { MessageDTO, ThreadDTO } from '../../models/api';
import { request } from './http';

export type GroupChatMemberDTO = {
  id: string;
  name: string;
  avatarText: string;
};

export type CreateGroupChatInput = {
  title: string;
  memberUserIds: string[];
  idempotencyKey: string;
};

export type CreateGroupChatResult = {
  thread: ThreadDTO;
  messages: MessageDTO[];
};

export const groupChatApi = {
  create(input: CreateGroupChatInput, token: string) {
    return request<CreateGroupChatResult>('/api/chat-groups', {
      method: 'POST',
      token,
      body: input,
    });
  },

  members(groupId: string, token: string) {
    return request<GroupChatMemberDTO[]>(
      `/api/chat-groups/${encodeURIComponent(groupId)}/members`,
      { token },
    );
  },

  leave(groupId: string, token: string) {
    return request<{ ok: true }>(
      `/api/chat-groups/${encodeURIComponent(groupId)}/membership`,
      { method: 'DELETE', token },
    );
  },
};
