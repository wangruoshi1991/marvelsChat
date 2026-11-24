import React from 'react';
import type { ChatAttachmentDTO } from '../../models/api';
import {
  uploadChatFile,
  uploadChatImage,
  uploadChatVideo,
} from '../../services/api/chatAttachmentApi';
import {
  PickedStationFile,
  releaseStationFile,
} from '../../services/stationFilePicker';

export type ChatAttachmentDraft = {
  id?: string;
  clientKey: string;
  kind: 'image' | 'file' | 'video';
  filename: string;
  mimeType: string;
  byteSize: number;
  localUri?: string;
  idempotencyKey: string;
  status: 'uploading' | 'ready' | 'failed';
  error?: string;
  nativeFile?: PickedStationFile;
};

const supportedImages = new Set(['image/jpeg', 'image/png', 'image/webp']);
const newKey = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, marker => {
    const random = Math.floor(Math.random() * 16);
    return (marker === 'x' ? random : (random % 4) + 8).toString(16);
  });

export function useChatAttachments({
  userId,
  threadId,
  token,
  enabled,
  onCleanupError,
}: {
  userId: string;
  threadId: string;
  token: string;
  enabled: boolean;
  onCleanupError?: (message: string) => void;
}) {
  const scope = `${userId}:${threadId}:${token}`;
  const scopeRef = React.useRef(scope);
  const itemsScopeRef = React.useRef(scope);
  if (scopeRef.current !== scope) scopeRef.current = scope;
  const itemsRef = React.useRef<ChatAttachmentDraft[]>([]);
  const [items, setItems] = React.useState<ChatAttachmentDraft[]>([]);
  const [cleanupError, setCleanupError] = React.useState('');
  const mounted = React.useRef(true);
  const cleanupErrorHandler = React.useRef(onCleanupError);
  cleanupErrorHandler.current = onCleanupError;
  const update = React.useCallback((next: ChatAttachmentDraft[]) => {
    itemsRef.current = next;
    itemsScopeRef.current = scopeRef.current;
    if (mounted.current) setItems(next);
  }, []);
  const cleanup = React.useCallback(async (draft: ChatAttachmentDraft) => {
    if (!draft.nativeFile) return true;
    try {
      await releaseStationFile(draft.nativeFile);
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : '无法释放临时文件。';
      if (mounted.current) setCleanupError(message);
      cleanupErrorHandler.current?.(message);
      return false;
    }
  }, []);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      itemsRef.current.forEach(draft => {
        cleanup(draft).catch(() => undefined);
      });
    };
  }, [cleanup]);

  React.useEffect(() => {
    if (itemsScopeRef.current === scope) return;
    const previous = itemsRef.current;
    update([]);
    previous.forEach(draft => {
      cleanup(draft).catch(() => undefined);
    });
  }, [cleanup, scope, update]);

  const upload = React.useCallback(
    async (draft: ChatAttachmentDraft) => {
      const requestScope = scopeRef.current;
      const setDraft = (next: ChatAttachmentDraft) => {
        if (scopeRef.current !== requestScope) return;
        update(
          itemsRef.current.map(item =>
            item.clientKey === draft.clientKey ? next : item,
          ),
        );
      };
      try {
        const result: ChatAttachmentDTO =
          draft.kind !== 'file'
            ? await (draft.kind === 'image'
                ? uploadChatImage
                : uploadChatVideo)({
                threadId,
                token,
                uri: draft.localUri!,
                filename: draft.filename,
                mimeType: draft.mimeType,
                idempotencyKey: draft.idempotencyKey,
              })
            : await uploadChatFile({
                threadId,
                token,
                nativeKey: draft.idempotencyKey,
                filename: draft.filename,
                mimeType: draft.mimeType,
                idempotencyKey: draft.idempotencyKey,
              });
        if (scopeRef.current !== requestScope) return;
        const released = await cleanup(draft);
        setDraft({
          ...draft,
          id: result.id,
          status: 'ready',
          nativeFile: released ? undefined : draft.nativeFile,
          localUri: draft.kind === 'image' ? draft.localUri : undefined,
        });
      } catch (error) {
        if (scopeRef.current !== requestScope) return;
        setDraft({
          ...draft,
          status: 'failed',
          error: error instanceof Error ? error.message : '上传失败，请重试。',
        });
      }
    },
    [cleanup, threadId, token, update],
  );

  const addImages = React.useCallback(
    async (
      picked: Array<{
        uri: string;
        originalFilename: string;
        mimeType: string;
        byteSize: number | null;
      }>,
    ) => {
      if (!enabled || !picked.length) return;
      const available = Math.max(0, 6 - itemsRef.current.length);
      const selected = picked.slice(0, available);
      const invalid = selected.find(
        item =>
          !supportedImages.has(item.mimeType) ||
          (item.byteSize != null &&
            (item.byteSize <= 0 || item.byteSize > 8 * 1024 * 1024)),
      );
      if (invalid)
        throw new Error(
          !supportedImages.has(invalid.mimeType)
            ? '仅支持 JPEG、PNG 或 WebP 图片。'
            : '图片必须非空且不超过8MiB。',
        );
      const drafts = selected.map(item => ({
        clientKey: newKey(),
        kind: 'image' as const,
        filename: item.originalFilename,
        mimeType: item.mimeType,
        byteSize: item.byteSize ?? 0,
        localUri: item.uri,
        idempotencyKey: newKey(),
        status: 'uploading' as const,
      }));
      update([...itemsRef.current, ...drafts]);
      await Promise.all(drafts.map(upload));
    },
    [enabled, update, upload],
  );

  const addVideo = React.useCallback(
    async (video: PickedStationFile) => {
      if (!enabled || itemsRef.current.length >= 6) {
        await releaseStationFile(video);
        if (enabled) throw new Error('最多添加6个附件。');
        return;
      }
      const draft: ChatAttachmentDraft = {
        clientKey: newKey(),
        kind: 'video',
        filename: video.originalFilename,
        mimeType: video.mimeType,
        byteSize: video.byteSize,
        localUri: video.uri,
        idempotencyKey: video.idempotencyKey,
        nativeFile: video,
        status: 'uploading',
      };
      update([...itemsRef.current, draft]);
      await upload(draft);
    },
    [enabled, update, upload],
  );

  const addFile = React.useCallback(
    async (file: PickedStationFile) => {
      if (!enabled) {
        await releaseStationFile(file);
        return;
      }
      if (itemsRef.current.length >= 6) {
        await releaseStationFile(file);
        throw new Error('最多添加6个附件。');
      }
      const draft: ChatAttachmentDraft = {
        clientKey: file.idempotencyKey,
        idempotencyKey: file.idempotencyKey,
        kind: 'file',
        filename: file.originalFilename,
        mimeType: file.mimeType,
        byteSize: file.byteSize,
        nativeFile: file,
        status: 'uploading',
      };
      update([...itemsRef.current, draft]);
      await upload(draft);
    },
    [enabled, update, upload],
  );

  const remove = React.useCallback(
    async (clientKey: string) => {
      const draft = itemsRef.current.find(item => item.clientKey === clientKey);
      update(itemsRef.current.filter(item => item.clientKey !== clientKey));
      if (draft) await cleanup(draft);
    },
    [cleanup, update],
  );
  const removeMany = React.useCallback(
    async (clientKeys: string[]) => {
      const selected = new Set(clientKeys);
      const removed = itemsRef.current.filter(item =>
        selected.has(item.clientKey),
      );
      update(itemsRef.current.filter(item => !selected.has(item.clientKey)));
      await Promise.all(removed.map(cleanup));
    },
    [cleanup, update],
  );
  const retry = React.useCallback(
    async (clientKey: string) => {
      const draft = itemsRef.current.find(
        item => item.clientKey === clientKey && item.status === 'failed',
      );
      if (!draft) return;
      update(
        itemsRef.current.map(item =>
          item.clientKey === clientKey
            ? { ...item, status: 'uploading', error: undefined }
            : item,
        ),
      );
      await upload({ ...draft, status: 'uploading', error: undefined });
    },
    [update, upload],
  );
  const currentItems = itemsScopeRef.current === scope ? items : [];
  const remainingSlots = Math.max(0, 6 - currentItems.length);
  const blockingItem = currentItems.find(item => item.status !== 'ready');
  return {
    items: currentItems,
    remainingSlots,
    attachmentIds: currentItems.flatMap(item => (item.id ? [item.id] : [])),
    canSend: !blockingItem,
    sendBlockReason:
      blockingItem?.status === 'uploading'
        ? '附件仍在上传，请稍候。'
        : blockingItem
        ? '附件上传失败，请重试或移除。'
        : '',
    cleanupError,
    addImages,
    addVideo,
    addFile,
    remove,
    removeMany,
    retry,
  };
}
