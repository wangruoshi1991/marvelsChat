import { RelationshipProfileDTO, ThreadDTO } from '../../models/api';

export type Language = 'zh' | 'en';

export type ChatMessage = {
  id: string;
  threadId: string;
  senderType: string;
  senderName: string;
  content: string;
  metadata?: Record<string, unknown>;
  clientMessageId?: string | null;
  deletedAt?: string | null;
  recalledAt?: string | null;
  createdAt?: string | null;
  localStatus?: 'sending' | 'failed';
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
