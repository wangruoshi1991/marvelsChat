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

function publicAttachments(value) {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap(item => {
    if (!record(item) || !/^[a-f0-9-]{36}$/i.test(item.id || '') ||
      !['image','audio','file','location','contact','task'].includes(item.kind) ||
      !text(item.filename) || !text(item.title) || !Number.isInteger(item.byteSize) ||
      item.byteSize < 0 || item.byteSize > 8388608 || !record(item.data)) return [];
    const data = {};
    const dataKeys = item.kind === 'location' ? ['latitude','longitude','label'] :
      item.kind === 'contact' ? ['userId','name','aiId'] : item.kind === 'task' ? ['taskId','taskKind','title','status'] : [];
    for (const key of dataKeys) if (text(item.data[key]) || (['latitude','longitude'].includes(key) && Number.isFinite(item.data[key]))) data[key] = item.data[key];
    const downloadPath = ['image','audio','file'].includes(item.kind) ? `/api/chat-attachments/${item.id}/content` : null;
    return [{id:item.id,kind:item.kind,filename:item.filename,title:item.title,
      mimeType:text(item.mimeType) ? item.mimeType : null,byteSize:item.byteSize,
      durationMs:Number.isInteger(item.durationMs) && item.durationMs > 0 ? item.durationMs : null,downloadPath,data}];
  });
}

function publicMetadata(value, suppressAttachments = false, isAgent = false) {
  if (!record(value)) return {};
  const metadata = {};
  if (!suppressAttachments) {
    const attachments = publicAttachments(value.attachments);
    if (attachments?.length) metadata.attachments = attachments;
  }
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
  if (!suppressAttachments && isAgent && record(value.uiPreferencePreview) &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value.uiPreferencePreview.id || "")) {
    metadata.uiPreferencePreview = { id: value.uiPreferencePreview.id };
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
    metadata: publicMetadata(message.metadata, Boolean(message.deletedAt || message.recalledAt), message.senderType === "agent"),
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
