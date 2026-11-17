import type { CustomStickerDTO } from '../../models/api';
import { buildApiUrl, request, requestNativeBinary } from './http';

const maxUploadBytes = 2 * 1024 * 1024;
const supportedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseSticker(value: unknown): CustomStickerDTO {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('自定义表情数据格式无效。');
  const item = value as Record<string, unknown>;
  if (
    typeof item.id !== 'string' ||
    !uuidPattern.test(item.id) ||
    typeof item.mimeType !== 'string' ||
    item.mimeType !== 'image/png' ||
    !Number.isSafeInteger(item.byteSize) ||
    (item.byteSize as number) < 1 ||
    (item.byteSize as number) > maxUploadBytes ||
    !Number.isSafeInteger(item.width) ||
    !Number.isSafeInteger(item.height) ||
    typeof item.downloadPath !== 'string' ||
    item.downloadPath !== `/api/custom-stickers/${item.id}/content`
  )
    throw new Error('自定义表情数据格式无效。');
  return item as unknown as CustomStickerDTO;
}

export const customStickerApi = {
  async list(token: string, before?: string) {
    const query = before
      ? `?limit=100&before=${encodeURIComponent(before)}`
      : '?limit=100';
    const data = await request<CustomStickerDTO[]>(
      `/api/custom-stickers${query}`,
      { token },
    );
    if (!Array.isArray(data)) throw new Error('自定义表情列表格式无效。');
    return data.map(parseSticker);
  },

  async upload(args: {
    token: string;
    uri: string;
    mimeType: string;
    idempotencyKey: string;
  }) {
    if (!supportedMimeTypes.has(args.mimeType))
      throw new Error('仅支持 JPEG、PNG 或 WebP 图片。');
    if (!uuidPattern.test(args.idempotencyKey))
      throw new Error('上传请求标识无效，请重试。');
    const binaryRequest = await requestNativeBinary(
      '/api/custom-stickers/upload',
      {
        method: 'POST',
        token: args.token,
        uri: args.uri,
        maximumUploadBytes: maxUploadBytes,
        maximumResponseBytes: 8192,
        headers: {
          'Idempotency-Key': args.idempotencyKey,
          'X-Miaoxun-Sticker-Mime': args.mimeType,
        },
      },
    );
    if (binaryRequest.status < 200 || binaryRequest.status >= 300)
      throw new Error('自定义表情上传失败，请重试。');
    const parsed = JSON.parse(binaryRequest.body) as { data?: unknown };
    return parseSticker(parsed.data);
  },

  async delete(stickerId: string, token: string) {
    if (!uuidPattern.test(stickerId)) throw new Error('自定义表情标识无效。');
    await request<{ ok: boolean }>(`/api/custom-stickers/${stickerId}`, {
      method: 'DELETE',
      token,
    });
  },

  read(stickerId: string, token: string) {
    if (!uuidPattern.test(stickerId)) throw new Error('自定义表情标识无效。');
    return {
      uri: buildApiUrl(`/api/custom-stickers/${stickerId}/content`),
      headers: { Authorization: `Bearer ${token}` },
    };
  },
};
