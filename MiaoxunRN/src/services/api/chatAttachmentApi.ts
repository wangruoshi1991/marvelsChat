import { NativeModules } from 'react-native';
import { ChatAttachmentDTO } from '../../models/api';
import {
  handleAuthenticatedResponse,
  MiaoxunApiError,
  requestNativeBinary,
} from './http';

const maxImageBytes = 8 * 1024 * 1024;
const maxTextBytes = 256 * 1024;
const textMimeTypes = new Set([
  'text/plain',
  'text/markdown',
  'application/json',
  'text/csv',
  'text/tab-separated-values',
]);
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const contentPath = (id: string) => `/api/chat-attachments/${id}/content`;

const nativePicker = NativeModules.MiaoxunDocumentPickerModule as
  | {
      uploadChatAttachment(
        key: string,
        threadId: string,
        token: string,
        mimeType: string,
        encodedFilename: string,
        idempotencyKey: string,
      ): Promise<{ status: number; body: string }>;
    }
  | undefined;

function apiError(
  status: number,
  raw: string,
  requestId?: string,
): MiaoxunApiError {
  let envelope: {
    error?: { message?: string; code?: string; requestId?: string };
  } = {};
  try {
    const parsed: unknown = JSON.parse(raw.slice(0, 8192));
    if (parsed && typeof parsed === 'object')
      envelope = parsed as typeof envelope;
  } catch {
    // Error bodies are bounded and never logged.
  }
  return new MiaoxunApiError(
    envelope.error?.message || `附件请求失败：${status}`,
    {
      status,
      code: envelope.error?.code,
      requestId: envelope.error?.requestId || requestId,
    },
  );
}

function parseAttachment(
  value: unknown,
  kind: 'image' | 'file',
): ChatAttachmentDTO {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('附件上传结果格式无效。');
  const item = value as Record<string, unknown>;
  const validMime =
    typeof item.mimeType === 'string' &&
    (kind === 'image'
      ? item.mimeType === 'image/jpeg'
      : textMimeTypes.has(item.mimeType));
  if (
    typeof item.id !== 'string' ||
    !uuidPattern.test(item.id) ||
    item.kind !== kind ||
    typeof item.filename !== 'string' ||
    !item.filename.trim() ||
    item.filename.length > 180 ||
    item.filename.split('').some(character => character.charCodeAt(0) < 32) ||
    /[\\/]/.test(item.filename) ||
    typeof item.title !== 'string' ||
    !item.title.trim() ||
    !validMime ||
    !Number.isSafeInteger(item.byteSize) ||
    (item.byteSize as number) < 1 ||
    (item.byteSize as number) >
      (kind === 'image' ? maxImageBytes : maxTextBytes) ||
    item.durationMs !== null ||
    item.downloadPath !== contentPath(item.id) ||
    !item.data ||
    typeof item.data !== 'object' ||
    Array.isArray(item.data) ||
    Object.keys(item.data).length !== 0
  ) {
    throw new Error('附件上传结果与当前请求不一致。');
  }
  return item as unknown as ChatAttachmentDTO;
}

export async function uploadChatImage(args: {
  threadId: string;
  token: string;
  uri: string;
  filename: string;
  mimeType: string;
  idempotencyKey: string;
}): Promise<ChatAttachmentDTO> {
  if (!imageMimeTypes.has(args.mimeType)) throw new Error('图片格式不受支持。');
  if (!uuidPattern.test(args.idempotencyKey))
    throw new Error('附件幂等键无效。');
  const binaryRequest = await requestNativeBinary(
    `/api/threads/${encodeURIComponent(args.threadId)}/attachments/upload`,
    {
      method: 'POST',
      token: args.token,
      uri: args.uri,
      maximumUploadBytes: maxImageBytes,
      maximumResponseBytes: 8192,
      headers: {
        'Idempotency-Key': args.idempotencyKey,
        'X-Miaoxun-Attachment-Kind': 'image',
        'X-Miaoxun-Attachment-Mime': args.mimeType,
        'X-Miaoxun-Filename': encodeURIComponent(args.filename),
      },
    },
  );
  {
    const { status, requestId, body } = binaryRequest;
    if (status >= 300 && status < 400)
      throw new MiaoxunApiError('附件请求被重定向，已停止以保护登录信息。', {
        status,
        requestId,
      });
    if (status < 200 || status >= 300) throw apiError(status, body, requestId);
    let envelope: unknown;
    try {
      envelope = JSON.parse(body);
    } catch {
      throw new Error('附件上传结果格式无效。');
    }
    if (!envelope || typeof envelope !== 'object' || !('data' in envelope))
      throw new Error('附件上传结果格式无效。');
    return parseAttachment((envelope as { data: unknown }).data, 'image');
  }
}

export async function uploadChatFile(args: {
  threadId: string;
  token: string;
  nativeKey: string;
  filename: string;
  mimeType: string;
  idempotencyKey: string;
}): Promise<ChatAttachmentDTO> {
  if (!textMimeTypes.has(args.mimeType))
    throw new Error('文本文件格式不受支持。');
  if (!uuidPattern.test(args.idempotencyKey))
    throw new Error('附件幂等键无效。');
  if (!nativePicker) throw new Error('当前设备暂不支持上传文件附件。');
  const response = await nativePicker.uploadChatAttachment(
    args.nativeKey,
    args.threadId,
    args.token,
    args.mimeType,
    encodeURIComponent(args.filename),
    args.idempotencyKey,
  );
  await handleAuthenticatedResponse({
    status: response.status,
    token: args.token,
    method: 'POST',
    path: `/api/threads/${encodeURIComponent(
      args.threadId,
    )}/attachments/upload`,
  });
  if (response.status < 200 || response.status >= 300)
    throw apiError(response.status, response.body.slice(0, 8192));
  if (new TextEncoder().encode(response.body).byteLength > 8192)
    throw new Error('附件上传结果格式无效。');
  let envelope: unknown;
  try {
    envelope = JSON.parse(response.body.slice(0, 8192));
  } catch {
    throw new Error('附件上传结果格式无效。');
  }
  if (!envelope || typeof envelope !== 'object' || !('data' in envelope))
    throw new Error('附件上传结果格式无效。');
  return parseAttachment((envelope as { data: unknown }).data, 'file');
}

export async function readChatAttachmentText(args: {
  attachment: ChatAttachmentDTO;
  token: string;
}): Promise<string> {
  const attachment = parseAttachment(args.attachment, 'file');
  if (
    !attachment.downloadPath ||
    !attachment.mimeType ||
    !textMimeTypes.has(attachment.mimeType)
  )
    throw new Error('该附件不支持文本预览。');
  const binaryRequest = await requestNativeBinary(attachment.downloadPath, {
    method: 'GET',
    token: args.token,
    maximumUploadBytes: 0,
    maximumResponseBytes: maxTextBytes,
  });
  {
    const { status, requestId, body } = binaryRequest;
    if (status >= 300 && status < 400)
      throw new MiaoxunApiError('附件请求被重定向，已停止以保护登录信息。', {
        status,
        requestId,
      });
    if (status < 200 || status >= 300) throw apiError(status, body, requestId);
    if (!body.length) throw new Error('文本附件大小超出限制。');
    const text = body;
    if (text.length > 50000) throw new Error('文本附件内容超出预览限制。');
    return text;
  }
}
