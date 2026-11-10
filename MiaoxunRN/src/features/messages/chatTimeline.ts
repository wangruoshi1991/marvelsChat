import { WorkspaceContribution } from '../../models/agentWorkspace';
import { ChatMessage } from '../session/sessionTypes';

export type ChatTimelineItem =
  | { kind: 'message'; key: string; message: ChatMessage }
  | { kind: 'contribution'; key: string; contribution: WorkspaceContribution };

// A node keeps its original position while polling updates its live status.
// Contribution bodies remain protected records, not synthetic chat messages.
export function buildChatTimeline(
  messages: ChatMessage[],
  contributions: WorkspaceContribution[],
): ChatTimelineItem[] {
  const items = new Map<string, ChatTimelineItem>();
  for (const message of messages) {
    const key = `message:${message.id}`;
    items.set(key, { kind: 'message', key, message });
  }
  for (const contribution of contributions) {
    const key = `contribution:${contribution.step.id}`;
    items.set(key, { kind: 'contribution', key, contribution });
  }
  const timestamp = (item: ChatTimelineItem) => {
    const value =
      item.kind === 'message'
        ? item.message.createdAt
        : item.contribution.step.createdAt;
    const parsed = value ? Date.parse(value) : NaN;
    return Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
  };
  return [...items.values()].sort(
    (a, b) => timestamp(a) - timestamp(b) || a.key.localeCompare(b.key),
  );
}
