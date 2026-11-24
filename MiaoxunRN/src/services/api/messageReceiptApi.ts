import { request } from './http';

export type ChatMessageReceiptAvailability = {
  directDelivery: 1;
  readDisclosure: false;
};

export type DirectMessageReceiptStatus = 'accepted' | 'delivered';
export type DirectMessageReceipt = {
  messageId: string;
  status: DirectMessageReceiptStatus;
};

export async function acknowledgeDirectMessageDelivery(
  threadId: string,
  messageIds: string[],
  token: string,
): Promise<string[]> {
  const result = await request<{ acknowledgedMessageIds: string[] }>(
    `/api/threads/${encodeURIComponent(threadId)}/message-receipts/delivered`,
    { method: 'POST', token, body: { messageIds } },
  );
  if (
    !Array.isArray(result?.acknowledgedMessageIds) ||
    result.acknowledgedMessageIds.some(
      id => typeof id !== 'string' || !messageIds.includes(id),
    )
  ) {
    throw new Error('服务器未返回有效的送达确认。');
  }
  return result.acknowledgedMessageIds;
}

export async function loadDirectMessageReceipts(
  threadId: string,
  messageIds: string[],
  token: string,
): Promise<DirectMessageReceipt[]> {
  const result = await request<{ receipts: DirectMessageReceipt[] }>(
    `/api/threads/${encodeURIComponent(threadId)}/message-receipts/status`,
    { method: 'POST', token, body: { messageIds } },
  );
  if (
    !Array.isArray(result?.receipts) ||
    result.receipts.some(
      item =>
        !item ||
        !messageIds.includes(item.messageId) ||
        !['accepted', 'delivered'].includes(item.status),
    )
  )
    throw new Error('服务器未返回有效的消息回执。');
  return result.receipts;
}
