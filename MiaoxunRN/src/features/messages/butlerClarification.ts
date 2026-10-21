import { isContextReference } from '../../models/aiTask';
import { normalizeAssistMessageSource } from '../assist/assistMessageSource';
import { ChatThread } from '../session/sessionTypes';
import { isAgentDispatch, usesAgentDispatch } from '../../models/agentDispatch';

export function pendingButlerClarification(thread: ChatThread) {
  if (thread.agentId !== 'miaoxun-butler') return null;
  return pendingClarification(thread, false);
}

export function pendingConversationClarification(thread: ChatThread) {
  if (thread.agentId === 'miaoxun-butler')
    return pendingButlerClarification(thread);
  return usesAgentDispatch(thread.agentId)
    ? pendingClarification(thread, true)
    : null;
}

function pendingClarification(thread: ChatThread, professional: boolean) {
  // Professional dispatch treats the latest message as the request boundary;
  // deletion or recall must never revive a previous private request.
  const last = professional
    ? thread.messages.at(-1)
    : [...thread.messages]
        .reverse()
        .find(message => !message.recalledAt && !message.deletedAt);
  // A persisted follow-up can still be processing when the conversation is
  // reopened. Only the server's retained snapshot may continue that context;
  // optimistic inputs and explicit selection resets cannot revive it.
  const isPersistedContinuation =
    last?.senderType === 'user' &&
    (professional
      ? last.metadata?.agentContextReset
      : last.metadata?.butlerContextReset) !== true &&
    !last.id.startsWith('local-') &&
    !last.localStatus;
  const clarification: unknown = professional
    ? last?.metadata?.agentClarification
    : last?.metadata?.butlerClarification;
  if (
    !last ||
    (professional &&
      (last.threadId !== thread.id ||
        last.recalledAt ||
        last.deletedAt ||
        last.localStatus ||
        last.id.startsWith('local-'))) ||
    (last.senderType !== 'agent' && !isPersistedContinuation) ||
    (professional &&
      last.senderType === 'agent' &&
      (!isAgentDispatch(last.metadata?.agentDispatch) ||
        last.metadata?.agentDispatch?.kind !== 'clarify')) ||
    !clarification ||
    typeof clarification !== 'object' ||
    !('contextRefs' in clarification) ||
    !Array.isArray(clarification.contextRefs) ||
    (!professional && !clarification.contextRefs.length) ||
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
