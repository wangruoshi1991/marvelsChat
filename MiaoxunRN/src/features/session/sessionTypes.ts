import type { AIContextReference } from '../../models/aiTask';
import type { AssistMessageSource } from '../assist/assistMessageSource';
import { RelationshipProfileDTO, ThreadDTO } from '../../models/api';

export type Language = 'zh' | 'en';

export type ChatMessage = {
  id: string;
  threadId: string;
  senderType: string;
  senderName: string;
  content: string;
  metadata?: Record<string, unknown> & {
    contextRefs?: AIContextReference[];
    assistSource?: AssistMessageSource;
    agentWorkspace?: { id: string };
    butlerClarification?: {
      contextRefs: AIContextReference[];
      source: { currentPage: string };
    };
    butlerContextReset?: boolean;
  };
  clientMessageId?: string | null;
  deletedAt?: string | null;
  recalledAt?: string | null;
  createdAt?: string | null;
  localStatus?: 'sending' | 'failed';
  localFailure?: { message: string; code?: string };
};

export type ChatThread = ThreadDTO & {
  messages: ChatMessage[];
};

export type RelationshipsState = {
  following: RelationshipProfileDTO[];
  followers: RelationshipProfileDTO[];
  friends: RelationshipProfileDTO[];
};

export type RealtimeStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';
export type RestoreStatus =
  | 'checking'
  | 'authenticated'
  | 'signedOut'
  | 'networkError';
