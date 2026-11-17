import React, {
  useCallback,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  X,
} from 'lucide-react-native';

import type { ChatAttachmentDTO } from '../../models/api';
import { readChatAttachmentText } from '../../services/api/chatAttachmentApi';
import { buildApiUrl } from '../../services/api/http';
import { saveChatImageToLibrary } from '../../services/chatMediaLibrary';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';

export type ChatMessageAttachmentAction =
  | { type: 'image'; attachmentId?: string; index?: number; save?: boolean }
  | { type: 'file'; attachmentId: string }
  | null;

export type ChatMessageAttachmentsHandle = {
  openImageViewer: (index?: number) => void;
  openFilePreview: (attachmentId?: string) => void;
  saveImage: (attachmentId?: string) => Promise<void>;
};

export type ChatMessageAttachmentsProps = {
  attachments: ChatAttachmentDTO[];
  token: string;
  palette: Palette;
  language: Language;
  onActionMessage: (message: string) => void;
  action?: ChatMessageAttachmentAction;
  onActionConsumed?: (action: ChatMessageAttachmentAction) => void;
};

const canonicalPath = (attachment: ChatAttachmentDTO) =>
  `/api/chat-attachments/${attachment.id}/content`;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isCanonicalAttachment = (attachment: ChatAttachmentDTO) =>
  typeof attachment.id === 'string' &&
  uuidPattern.test(attachment.id) &&
  attachment.downloadPath === canonicalPath(attachment);

export const ChatMessageAttachments = forwardRef<
  ChatMessageAttachmentsHandle,
  ChatMessageAttachmentsProps
>(function ChatMessageAttachmentsView(
  {
    attachments,
    token,
    palette,
    language,
    onActionMessage,
    action,
    onActionConsumed,
  },
  ref,
) {
  const validAttachments = useMemo(
    () => attachments.filter(isCanonicalAttachment).slice(0, 6),
    [attachments],
  );
  const images = useMemo(
    () => validAttachments.filter(item => item.kind === 'image'),
    [validAttachments],
  );
  const files = useMemo(
    () => validAttachments.filter(item => item.kind === 'file'),
    [validAttachments],
  );
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [fileState, setFileState] = useState<
    | { status: 'idle' }
    | { status: 'loading' }
    | { status: 'ready'; text: string }
    | { status: 'error'; message: string }
  >({ status: 'idle' });
  const [imageFailures, setImageFailures] = useState<Set<string>>(
    () => new Set(),
  );
  const [saving, setSaving] = useState(false);
  const previewScope = `${token}:${validAttachments
    .map(item => item.id)
    .join(',')}`;
  const previewScopeRef = useRef(previewScope);
  previewScopeRef.current = previewScope;
  const filePreviewOwner = useRef<string | null>(null);
  const fileRequestEpoch = useRef(0);
  const consumedAction = useRef<ChatMessageAttachmentAction>(null);

  const closeFilePreview = useCallback(() => {
    fileRequestEpoch.current += 1;
    filePreviewOwner.current = null;
    setFileId(null);
    setFileState({ status: 'idle' });
  }, []);

  useEffect(() => {
    closeFilePreview();
    return () => {
      fileRequestEpoch.current += 1;
    };
  }, [closeFilePreview, previewScope]);

  const t = useCallback(
    (zh: string, en: string) => textFor(language, zh, en),
    [language],
  );
  const openImageViewer = useCallback(
    (index = 0) => {
      if (!images.length) return;
      setViewerIndex(Math.max(0, Math.min(index, images.length - 1)));
    },
    [images.length],
  );
  const openFilePreview = useCallback(
    (attachmentId?: string) => {
      const next = files.find(item => item.id === attachmentId) || files[0];
      if (!next) return;
      const origin = previewScopeRef.current;
      const epoch = ++fileRequestEpoch.current;
      filePreviewOwner.current = origin;
      const isCurrent = () =>
        previewScopeRef.current === origin &&
        fileRequestEpoch.current === epoch;
      setFileId(next.id);
      setFileState({ status: 'loading' });
      readChatAttachmentText({ attachment: next, token })
        .then(text => {
          if (isCurrent()) setFileState({ status: 'ready', text });
        })
        .catch(error => {
          if (!isCurrent()) return;
          setFileState({
            status: 'error',
            message:
              error instanceof Error
                ? error.message
                : t(
                    '文件读取失败，请重试。',
                    'Unable to read this file. Try again.',
                  ),
          });
        });
    },
    [files, t, token],
  );
  const saveImage = useCallback(
    async (attachmentId?: string) => {
      const attachment =
        images.find(item => item.id === attachmentId) ||
        images[viewerIndex ?? 0];
      if (!attachment) return;
      setSaving(true);
      try {
        await saveChatImageToLibrary({ attachmentId: attachment.id, token });
        onActionMessage(
          t('图片已保存到系统相册。', 'Image saved to your photo library.'),
        );
      } catch (error) {
        onActionMessage(
          error instanceof Error
            ? error.message
            : t(
                '保存图片失败，请重试。',
                'Unable to save the image. Try again.',
              ),
        );
      } finally {
        setSaving(false);
      }
    },
    [images, onActionMessage, t, token, viewerIndex],
  );
  useImperativeHandle(
    ref,
    () => ({
      openImageViewer,
      openFilePreview,
      saveImage,
    }),
    [openFilePreview, openImageViewer, saveImage],
  );

  useEffect(() => {
    if (!action || consumedAction.current === action) return;
    consumedAction.current = action;
    onActionConsumed?.(action);
    if (action.type === 'image') openImageViewer(action.index);
    else openFilePreview(action.attachmentId);
    if (action.type === 'image' && action.save)
      saveImage(action.attachmentId).catch(() => undefined);
  }, [action, onActionConsumed, openFilePreview, openImageViewer, saveImage]);

  if (!validAttachments.length) return null;
  const sourceFor = (attachment: ChatAttachmentDTO) => ({
    uri: buildApiUrl(attachment.downloadPath!),
    headers: { Authorization: `Bearer ${token}` },
  });
  const viewerAttachment =
    viewerIndex == null ? undefined : images[viewerIndex];
  const fileAttachment =
    filePreviewOwner.current === previewScope
      ? files.find(item => item.id === fileId)
      : undefined;
  return (
    <View style={s.container} testID="chat-message-attachments">
      {images.length ? (
        <View style={s.imageGrid}>
          {images.map((attachment, index) => {
            const failed = imageFailures.has(attachment.id);
            return (
              <Pressable
                key={attachment.id}
                testID="chat-attachment-image"
                accessibilityRole="button"
                accessibilityLabel={t(
                  `查看图片 ${attachment.filename}`,
                  `View image ${attachment.filename}`,
                )}
                onPress={() => openImageViewer(index)}
                style={[
                  s.imageTile,
                  images.length === 1 && s.imageTileSingle,
                  surfaceBorderStyle(palette.soft, palette.border),
                ]}
              >
                {failed ? (
                  <View style={s.failure}>
                    <Text style={colorStyle(palette.rose)}>
                      {t('图片读取失败', 'Image unavailable')}
                    </Text>
                  </View>
                ) : (
                  <Image
                    testID="chat-attachment-image-content"
                    accessibilityLabel={attachment.filename}
                    accessibilityIgnoresInvertColors
                    source={sourceFor(attachment)}
                    resizeMode="cover"
                    style={s.image}
                    onError={() => {
                      setImageFailures(current =>
                        new Set(current).add(attachment.id),
                      );
                      onActionMessage(
                        t(
                          '图片读取失败，请重试。',
                          'Image unavailable. Try again.',
                        ),
                      );
                    }}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {files.map(attachment => (
        <Pressable
          key={attachment.id}
          testID="chat-attachment-file"
          accessibilityRole="button"
          accessibilityLabel={t(
            `预览文件 ${attachment.filename}`,
            `Preview file ${attachment.filename}`,
          )}
          onPress={() => openFilePreview(attachment.id)}
          style={[s.fileRow, surfaceBorderStyle(palette.soft, palette.border)]}
        >
          <FileText color={palette.mint} size={20} />
          <View style={s.fileCopy}>
            <Text numberOfLines={1} style={colorStyle(palette.text)}>
              {attachment.filename}
            </Text>
            <Text style={colorStyle(palette.secondaryText)}>
              {formatBytes(attachment.byteSize)}
            </Text>
          </View>
        </Pressable>
      ))}
      <Modal
        visible={viewerIndex !== null}
        animationType="fade"
        onRequestClose={() => setViewerIndex(null)}
      >
        <View
          testID="chat-attachment-viewer"
          style={[s.viewer, backgroundStyle(palette.background)]}
        >
          <View style={s.viewerHeader}>
            <Pressable
              testID="chat-attachment-viewer-close"
              accessibilityRole="button"
              accessibilityLabel={t('关闭图片查看器', 'Close image viewer')}
              onPress={() => setViewerIndex(null)}
            >
              <X color={palette.text} size={24} />
            </Pressable>
            <Text
              testID="chat-attachment-viewer-page"
              accessibilityLabel={`${(viewerIndex ?? 0) + 1}/${images.length}`}
              style={colorStyle(palette.text)}
            >{`${(viewerIndex ?? 0) + 1}/${images.length}`}</Text>
            <Pressable
              testID="chat-attachment-save"
              accessibilityRole="button"
              accessibilityLabel={t('保存图片', 'Save image')}
              disabled={saving}
              onPress={() =>
                saveImage(viewerAttachment?.id).catch(() => undefined)
              }
            >
              {saving ? (
                <ActivityIndicator color={palette.mint} />
              ) : (
                <Download color={palette.text} size={22} />
              )}
            </Pressable>
          </View>
          {viewerAttachment ? (
            <Image
              testID="chat-attachment-viewer-image"
              source={sourceFor(viewerAttachment)}
              resizeMode="contain"
              style={s.viewerImage}
              onError={() =>
                onActionMessage(
                  t('图片读取失败，请重试。', 'Image unavailable. Try again.'),
                )
              }
            />
          ) : null}
          {images.length > 1 ? (
            <View style={s.viewerControls}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('上一张', 'Previous image')}
                onPress={() =>
                  setViewerIndex(index =>
                    index == null ? null : Math.max(0, index - 1),
                  )
                }
              >
                <ChevronLeft color={palette.text} size={28} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('下一张', 'Next image')}
                onPress={() =>
                  setViewerIndex(index =>
                    index == null
                      ? null
                      : Math.min(images.length - 1, index + 1),
                  )
                }
              >
                <ChevronRight color={palette.text} size={28} />
              </Pressable>
            </View>
          ) : null}
        </View>
      </Modal>
      <Modal
        visible={Boolean(fileAttachment)}
        animationType="slide"
        onRequestClose={closeFilePreview}
      >
        <View
          testID="chat-attachment-file-preview"
          style={[s.filePreview, backgroundStyle(palette.background)]}
        >
          <View style={s.viewerHeader}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('关闭文件预览', 'Close file preview')}
              onPress={closeFilePreview}
            >
              <X color={palette.text} size={24} />
            </Pressable>
            <Text
              numberOfLines={1}
              style={[s.fileTitle, colorStyle(palette.text)]}
            >
              {fileAttachment?.filename}
            </Text>
            <View style={s.iconSpacer} />
          </View>
          {fileState.status === 'loading' ? (
            <ActivityIndicator
              testID="chat-attachment-file-loading"
              color={palette.mint}
            />
          ) : null}
          {fileState.status === 'ready' ? (
            <Text
              testID="chat-attachment-file-body"
              selectable
              style={[s.fileBody, colorStyle(palette.text)]}
            >
              {fileState.text}
            </Text>
          ) : null}
          {fileState.status === 'error' ? (
            <Text style={colorStyle(palette.rose)}>{fileState.message}</Text>
          ) : null}
        </View>
      </Modal>
    </View>
  );
});

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.round(bytes / 1024)} KB`;
}

const colorStyle = (color: string) => ({ color });
const backgroundStyle = (backgroundColor: string) => ({ backgroundColor });
const surfaceBorderStyle = (backgroundColor: string, borderColor: string) => ({
  backgroundColor,
  borderColor,
});

const s = StyleSheet.create({
  container: { gap: 8, marginTop: 8, maxWidth: 300 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  imageTile: {
    borderRadius: 8,
    borderWidth: 1,
    height: 92,
    overflow: 'hidden',
    width: 92,
  },
  imageTileSingle: { height: 180, width: 240 },
  image: { height: '100%', width: '100%' },
  failure: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: 6,
  },
  fileRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  fileCopy: { flex: 1, gap: 2 },
  viewer: { flex: 1, justifyContent: 'center' },
  viewerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  viewerImage: { flex: 1, width: '100%' },
  viewerControls: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 20,
  },
  filePreview: { flex: 1, padding: 16 },
  fileTitle: { flex: 1, textAlign: 'center' },
  fileBody: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: 14,
    lineHeight: 21,
    paddingVertical: 14,
  },
  iconSpacer: { width: 24 },
});
