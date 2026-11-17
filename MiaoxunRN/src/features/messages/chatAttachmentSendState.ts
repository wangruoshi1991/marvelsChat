import type { ChatMessage } from '../session/sessionTypes';

export function failedAttachmentSendBlockReason(
  attachmentIds: string[],
  messages: ChatMessage[],
) {
  const failedAttachmentIds = new Set(
    messages
      .filter(message => message.localStatus === 'failed')
      .flatMap(message => message.metadata?.attachmentIds || []),
  );
  return attachmentIds.some(id => failedAttachmentIds.has(id))
    ? '这组附件的消息发送失败，请点击失败消息重试，或移除附件后重新选择。'
    : '';
}
