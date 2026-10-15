import { isContextReference } from '../../models/aiTask';
import { normalizeAssistMessageSource } from '../assist/assistMessageSource';
import { ChatThread } from '../session/sessionTypes';

export function pendingButlerClarification(thread: ChatThread) {
  if (thread.agentId !== 'miaoxun-butler') return null;
  const last = [...thread.messages]
    .reverse()
    .find(message => !message.recalledAt && !message.deletedAt);
  // A persisted follow-up can still be processing when the conversation is
  // reopened. Only the server's retained snapshot may continue that context;
  // optimistic inputs and explicit selection resets cannot revive it.
  const isPersistedContinuation =
    last?.senderType === 'user' &&
    last.metadata?.butlerContextReset !== true &&
    !last.id.startsWith('local-') &&
    !last.localStatus;
  const clarification: unknown = last?.metadata?.butlerClarification;
  if (
    !last ||
    (last.senderType !== 'agent' && !isPersistedContinuation) ||
    !clarification ||
    typeof clarification !== 'object' ||
    !('contextRefs' in clarification) ||
    !Array.isArray(clarification.contextRefs) ||
    !clarification.contextRefs.length ||
    clarification.contextRefs.length > 6 ||
    !clarification.contextRefs.every(isContextReference) ||
    !('source' in clarification) ||
    !clarification.source ||
    typeof clarification.source !== 'object' ||
    !('currentPage' in clarification.source) ||
    typeof clarification.source.currentPage !== 'string'
  )
    return null;
  try {
    const source = normalizeAssistMessageSource({
      currentPage: clarification.source.currentPage,
    });
    return {
      messageId: last.id,
      references: clarification.contextRefs.map(reference => ({
        ...reference,
      })),
      source,
    };
  } catch {
    return null;
  }
}
