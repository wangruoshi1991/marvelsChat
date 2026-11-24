import type {
  ChatMessage,
  ChatThread,
  Language,
} from '../session/sessionTypes';
import { textFor } from '../../shared/i18n';

export const maxForwardSelection = 20;

export function canSelectForwardMessage(message: ChatMessage) {
  const metadata = message.metadata;
  return (
    message.senderType === 'user' &&
    !message.id.startsWith('local-') &&
    !message.localStatus &&
    !message.deletedAt &&
    !message.recalledAt &&
    !metadata?.sticker &&
    !metadata?.contentPreview &&
    !metadata?.contentPreviewContext &&
    !metadata?.workspaceContext &&
    !metadata?.agentWorkspace &&
    (metadata?.attachments?.every(item =>
      ['image', 'audio', 'file', 'video'].includes(item.kind),
    ) ??
      true) &&
    Boolean(message.content.trim() || metadata?.attachments?.length)
  );
}

export function selectableForwardMessages(
  messages: ChatMessage[],
  threadId: string,
) {
  const seen = new Set<string>();
  return messages.filter(message => {
    if (
      seen.has(message.id) ||
      message.threadId !== threadId ||
      !canSelectForwardMessage(message)
    )
      return false;
    seen.add(message.id);
    return true;
  });
}

export function selectableForwardTargets(
  threads: ChatThread[],
  sourceThreadId: string,
) {
  return threads.filter(
    thread =>
      thread.id !== sourceThreadId &&
      !thread.agentId &&
      (thread.kind === 'direct' || thread.kind === 'group'),
  );
}

export function selectedForwardMessages(
  messages: ChatMessage[],
  selected: ReadonlySet<string>,
) {
  return messages
    .filter(message => selected.has(message.id))
    .slice(0, maxForwardSelection);
}

export function forwardMessageLabel(message: ChatMessage, language: Language) {
  const attachments = message.metadata?.attachments || [];
  if (
    attachments.some(item => item.kind === 'audio') &&
    message.content === '[语音]'
  )
    return textFor(language, '语音消息', 'Voice message');
  if (message.content.trim()) return message.content.trim();
  if (attachments.some(item => item.kind === 'video'))
    return textFor(language, '视频消息', 'Video message');
  if (attachments.some(item => item.kind === 'image'))
    return textFor(language, '图片消息', 'Image message');
  if (attachments.some(item => item.kind === 'file'))
    return attachments.map(item => item.filename).join('、');
  return textFor(language, '附件消息', 'Message with attachments');
}
