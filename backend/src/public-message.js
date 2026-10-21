import { publicWorkspaceContext } from "./workspace-discussion-contract.js";

const record = (value) =>
  Boolean(value && typeof value === "object" && !Array.isArray(value));
const text = (value) => typeof value === "string";

function contextReferences(value) {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    if (!record(item) || !text(item.kind) || !text(item.id)) return [];
    return [
      {
        kind: item.kind,
        id: item.id,
        ...(text(item.version) ? { version: item.version } : {}),
        ...(text(item.title) ? { title: item.title } : {}),
      },
    ];
  });
}

function publicMetadata(value) {
  if (!record(value)) return {};
  const metadata = {};
  const workspaceContext = publicWorkspaceContext(value.workspaceContext);
  if (workspaceContext) metadata.workspaceContext = workspaceContext;
  if (text(value.senderUserId)) metadata.senderUserId = value.senderUserId;
  if (value.butlerContextReset === true) metadata.butlerContextReset = true;
  if (value.agentContextReset === true) metadata.agentContextReset = true;
  if (record(value.agentDispatch) && value.agentDispatch.version === 1 &&
      ["reply", "clarify", "workspace"].includes(value.agentDispatch.kind)) {
    metadata.agentDispatch = { version: 1, kind: value.agentDispatch.kind };
  }
  if (record(value.assistSource) && text(value.assistSource.currentPage)) {
    metadata.assistSource = { currentPage: value.assistSource.currentPage };
  }
  if (record(value.replyTo)) {
    metadata.replyTo = Object.fromEntries(
      ["messageId", "senderName", "content", "recalledAt"]
        .filter((key) => text(value.replyTo[key]))
        .map((key) => [key, value.replyTo[key]]),
    );
  }
  const references = contextReferences(value.contextRefs);
  if (references) metadata.contextRefs = references;
  if (record(value.butlerClarification)) {
    const clarificationReferences = contextReferences(
      value.butlerClarification.contextRefs,
    );
    const source = value.butlerClarification.source;
    if (clarificationReferences && record(source) && text(source.currentPage)) {
      metadata.butlerClarification = {
        contextRefs: clarificationReferences,
        source: { currentPage: source.currentPage },
      };
    }
  }
  if (record(value.agentWorkspace) && text(value.agentWorkspace.id)) {
    metadata.agentWorkspace = { id: value.agentWorkspace.id };
  }
  if (record(value.agentClarification)) {
    const clarificationReferences = contextReferences(value.agentClarification.contextRefs);
    const source = value.agentClarification.source;
    if (clarificationReferences && record(source) && text(source.currentPage)) {
      metadata.agentClarification = { contextRefs: clarificationReferences, source: { currentPage: source.currentPage } };
    }
  }
  if (
    record(value.albumAssistant) &&
    value.albumAssistant.outcome === "found"
  ) {
    metadata.albumAssistant = { outcome: "found" };
  }
  return metadata;
}

// Repository messages retain operational metadata for workers; only this
// minimal workflow state crosses into app responses and realtime events.
export function publicMessage(message) {
  return {
    id: message.id,
    threadId: message.threadId,
    senderType: message.senderType,
    senderName: message.senderName,
    content: message.content,
    metadata: publicMetadata(message.metadata),
    clientMessageId: message.clientMessageId || null,
    deletedAt: message.deletedAt || null,
    recalledAt: message.recalledAt || null,
    createdAt: message.createdAt || null,
  };
}

export function publicMessagesByThread(messagesByThread) {
  return Object.fromEntries(
    Object.entries(messagesByThread).map(([threadId, messages]) => [
      threadId,
      messages.map(publicMessage),
    ]),
  );
}
