import {
  ContentPreview,
  ContentPreviewContext,
  parseComicDetail,
  parseContentPreview,
} from '../../models/chatContentPreview';
import { StationComicDiaryDTO } from '../../models/api';
import { assertChatContentContract, chatContentHeaders } from '../aiContract';
import { request } from './http';
const previewPath = (id: string) =>
  `/api/chat-content-previews/${encodeURIComponent(id)}`;
const matches = (preview: ContentPreview, id: string) => {
  if (preview.id !== id) throw new Error('创作预览与当前请求不一致，请刷新。');
  return preview;
};
export const chatContentApi = {
  async get(token: string, id: string) {
    assertChatContentContract(token);
    return matches(
      parseContentPreview(
        await request<unknown>(previewPath(id), {
          token,
          headers: chatContentHeaders,
        }),
      ),
      id,
    );
  },
  async confirm(
    token: string,
    preview: ContentPreview,
    idempotencyKey: string,
  ) {
    assertChatContentContract(token);
    const next = matches(
      parseContentPreview(
        await request<unknown>(`${previewPath(preview.id)}/confirm`, {
          method: 'POST',
          token,
          headers: chatContentHeaders,
          body: {
            revision: preview.revision,
            snapshotHash: preview.snapshotHash,
            idempotencyKey,
          },
        }),
      ),
      preview.id,
    );
    if (
      next.threadId !== preview.threadId ||
      next.outputMessageId !== preview.outputMessageId ||
      next.kind !== preview.kind ||
      next.snapshotHash !== preview.snapshotHash ||
      next.revision < preview.revision
    )
      throw new Error('创作确认回执与当前提案不一致。');
    return next;
  },
  async reject(token: string, preview: ContentPreview) {
    assertChatContentContract(token);
    return matches(
      parseContentPreview(
        await request<unknown>(`${previewPath(preview.id)}/reject`, {
          method: 'POST',
          token,
          headers: chatContentHeaders,
          body: { revision: preview.revision },
        }),
      ),
      preview.id,
    );
  },
  async comic(token: string, id: string) {
    return parseComicDetail(
      await request<unknown>(
        `/api/station/comic-diaries/${encodeURIComponent(id)}`,
        { token, headers: chatContentHeaders },
      ),
      id,
    );
  },
  async comics(token: string) {
    const value = await request<StationComicDiaryDTO[]>(
      '/api/station/comic-diaries?limit=50',
      { token, headers: chatContentHeaders },
    );
    if (
      !Array.isArray(value) ||
      value.length > 50 ||
      value.some(
        item =>
          !item ||
          typeof item.id !== 'string' ||
          typeof item.title !== 'string' ||
          !Array.isArray(item.frames),
      )
    )
      throw new Error('漫画作品列表格式无效。');
    return value;
  },
};
export const previewContext = (
  preview: ContentPreview,
): ContentPreviewContext => ({ id: preview.id, revision: preview.revision });
