import { BootstrapDTO, MessageDTO, ThreadDTO } from '../../models/api';
import { ChatMessage, ChatThread, RelationshipsState } from './sessionTypes';

export const mapMessage = (message: MessageDTO): ChatMessage => ({
  id: message.id,
  threadId: message.threadId,
  senderType: message.senderType,
  senderName: message.senderName,
  content: message.content,
  metadata: message.metadata,
  clientMessageId: message.clientMessageId,
  deletedAt: message.deletedAt,
  recalledAt: message.recalledAt,
  createdAt: message.createdAt,
});

export const buildThreads = (bootstrap: BootstrapDTO): ChatThread[] =>
  bootstrap.threads.map(thread => ({
    ...thread,
    messages: (bootstrap.messagesByThread[thread.id] || []).map(mapMessage),
  }));

export const applyPresenceToRelationships = (
  current: RelationshipsState,
  userId: string,
  presenceStatus: 'online' | 'offline',
) => ({
  following: current.following.map(item =>
    item.user.id === userId
      ? { ...item, user: { ...item.user, presenceStatus } }
      : item,
  ),
  followers: current.followers.map(item =>
    item.user.id === userId
      ? { ...item, user: { ...item.user, presenceStatus } }
      : item,
  ),
  friends: current.friends.map(item =>
    item.user.id === userId
      ? { ...item, user: { ...item.user, presenceStatus } }
      : item,
  ),
});

export function mergeMessages(
  existing: ChatMessage[],
  incoming: ChatMessage[],
) {
  const incomingIds = new Set(incoming.map(message => message.id));
  const acceptedClientIds = new Set(
    incoming
      .filter(message => message.clientMessageId && !message.localStatus)
      .map(
        message =>
          `${message.threadId}:${message.senderType}:${message.clientMessageId}`,
      ),
  );
  return sortMessages([
    ...existing.filter(
      message =>
        !incomingIds.has(message.id) &&
        !(
          message.localStatus &&
          message.clientMessageId &&
          acceptedClientIds.has(
            `${message.threadId}:${message.senderType}:${message.clientMessageId}`,
          )
        ),
    ),
    ...incoming,
  ]);
}

function activityTime(value?: string | null) {
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : -Infinity;
}

// Workspace projections also own lastContent/lastMessageAt. A message-only
// receipt may advance that activity, but must never replace a newer projection.
export function mergeThreadMessageActivity(
  thread: ChatThread,
  incoming: ChatMessage[],
): ChatThread {
  const messages = mergeMessages(thread.messages, incoming);
  const latest = messages.reduce<ChatMessage | undefined>(
    (current, message) => {
      if (message.localStatus || activityTime(message.createdAt) === -Infinity)
        return current;
      return !current ||
        activityTime(message.createdAt) >= activityTime(current.createdAt)
        ? message
        : current;
    },
    undefined,
  );
  if (
    !latest ||
    activityTime(latest.createdAt) < activityTime(thread.lastMessageAt)
  )
    return { ...thread, messages };
  return {
    ...thread,
    messages,
    lastMessageAt: latest.createdAt,
    lastContent:
      latest.deletedAt || latest.recalledAt
        ? ''
        : latest.metadata?.workspaceContext?.nodeId
        ? latest.senderType === 'agent'
          ? '协作讨论已回复'
          : '正在讨论协作成果'
        : latest.content,
  };
}

export function sortThreadsByActivity(threads: ChatThread[]) {
  return [...threads].sort(
    (left, right) =>
      Number(right.pinned) - Number(left.pinned) ||
      activityTime(right.lastMessageAt) - activityTime(left.lastMessageAt) ||
      0,
  );
}

function sortMessages(messages: ChatMessage[]) {
  return [...messages].sort((left, right) => {
    const leftTime = left.createdAt
      ? Date.parse(left.createdAt)
      : Number.MAX_SAFE_INTEGER;
    const rightTime = right.createdAt
      ? Date.parse(right.createdAt)
      : Number.MAX_SAFE_INTEGER;
    const normalizedLeftTime = Number.isNaN(leftTime)
      ? Number.MAX_SAFE_INTEGER
      : leftTime;
    const normalizedRightTime = Number.isNaN(rightTime)
      ? Number.MAX_SAFE_INTEGER
      : rightTime;
    if (normalizedLeftTime !== normalizedRightTime) {
      return normalizedLeftTime - normalizedRightTime;
    }
    return left.id.localeCompare(right.id);
  });
}

export function buildThreadsFromSync(
  threads: ThreadDTO[],
  messagesByThread: Record<string, MessageDTO[]>,
) {
  return threads.map(thread => ({
    ...thread,
    messages: (messagesByThread[thread.id] || []).map(mapMessage),
  }));
}

export function mergeThreads(existing: ChatThread[], incoming: ChatThread[]) {
  if (!incoming.length) {
    return existing;
  }

  const incomingIds = new Set(incoming.map(thread => thread.id));
  const existingById = new Map(existing.map(thread => [thread.id, thread]));
  const mergedIncoming = incoming.map(thread => {
    const current = existingById.get(thread.id);
    return current
      ? {
          ...thread,
          messages: mergeMessages(current.messages, thread.messages),
        }
      : thread;
  });

  return [
    ...mergedIncoming,
    ...existing.filter(thread => !incomingIds.has(thread.id)),
  ];
}
