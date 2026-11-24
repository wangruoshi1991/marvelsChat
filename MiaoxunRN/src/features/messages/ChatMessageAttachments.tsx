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
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  GestureResponderEvent,
  Image,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  FileText,
  X,
} from 'lucide-react-native';

import { ChatVideoMessage } from './ChatVideoMessage';
import { ChatVoiceMessage } from './ChatVoiceMessage';
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
  reduceMotion?: boolean;
  onActionMessage: (message: string) => void;
  standalone?: boolean;
  onOpenMessageActions?: (
    event?: GestureResponderEvent,
    attachmentId?: string,
  ) => void;
  action?: ChatMessageAttachmentAction;
  onActionConsumed?: (action: ChatMessageAttachmentAction) => void;
};

const canonicalPath = (attachment: ChatAttachmentDTO) =>
  `/api/chat-attachments/${attachment.id}/content`;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isCanonicalAttachment = (attachment: ChatAttachmentDTO) =>
  typeof attachment.id === 'string' &&
  uuidPattern.test(attachment.id) &&
  attachment.downloadPath === canonicalPath(attachment);

export const isChatVoiceAttachment = (attachment: ChatAttachmentDTO) =>
  attachment.kind === 'audio' &&
  attachment.mimeType === 'audio/mp4' &&
  Number.isInteger(attachment.durationMs) &&
  (attachment.durationMs ?? 0) > 0;

type ImageViewerSelection = { scope: string; attachmentId: string };

export const ChatMessageAttachments = forwardRef<
  ChatMessageAttachmentsHandle,
  ChatMessageAttachmentsProps
>(function ChatMessageAttachmentsView(
  {
    attachments,
    token,
    palette,
    language,
    reduceMotion = true,
    onActionMessage,
    standalone = false,
    onOpenMessageActions,
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
  const [viewerSelection, setViewerSelection] =
    useState<ImageViewerSelection | null>(null);
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
  const [savingKeys, setSavingKeys] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [viewerSaveNotice, setViewerSaveNotice] = useState<string | null>(null);
  const selectedImage = useRef<ImageViewerSelection | null>(null);
  const savesInFlight = useRef(new Set<string>());
  const mounted = useRef(true);
  const previewScope = `${token}:${validAttachments
    .map(item => item.id)
    .join(',')}`;
  const previewScopeRef = useRef(previewScope);
  previewScopeRef.current = previewScope;
  const filePreviewOwner = useRef<string | null>(null);
  const fileRequestEpoch = useRef(0);
  const consumedAction = useRef<ChatMessageAttachmentAction>(null);
  const viewerIndex =
    viewerSelection?.scope === previewScope
      ? images.findIndex(image => image.id === viewerSelection.attachmentId)
      : -1;
  const viewerAttachment = images[viewerIndex];
  const viewerSaving =
    !!viewerAttachment &&
    savingKeys.has(`${previewScope}:${viewerAttachment.id}`);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const closeFilePreview = useCallback(() => {
    fileRequestEpoch.current += 1;
    filePreviewOwner.current = null;
    setFileId(null);
    setFileState({ status: 'idle' });
  }, []);

  useEffect(() => {
    closeFilePreview();
    setImageFailures(current => (current.size ? new Set() : current));
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
      const attachment =
        images[Math.max(0, Math.min(index, images.length - 1))];
      if (!attachment || previewScopeRef.current !== previewScope) return;
      setImageFailures(current => {
        if (!current.has(attachment.id)) return current;
        const next = new Set(current);
        next.delete(attachment.id);
        return next;
      });
      if (
        selectedImage.current?.scope === previewScope &&
        selectedImage.current.attachmentId === attachment.id
      ) {
        return;
      }
      const selection = { scope: previewScope, attachmentId: attachment.id };
      selectedImage.current = selection;
      setViewerSaveNotice(null);
      setViewerSelection(selection);
    },
    [images, previewScope],
  );
  const closeImageViewer = useCallback(() => {
    selectedImage.current = null;
    setViewerSaveNotice(null);
    setViewerSelection(null);
  }, []);
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
      const viewer = selectedImage.current;
      const requestedId =
        attachmentId ??
        (viewer?.scope === previewScope ? viewer.attachmentId : images[0]?.id);
      if (
        !requestedId ||
        previewScopeRef.current !== previewScope ||
        !images.some(image => image.id === requestedId)
      ) {
        return;
      }
      const saveKey = `${previewScope}:${requestedId}`;
      if (savesInFlight.current.has(saveKey)) return;

      const ownsViewer =
        viewer?.scope === previewScope && viewer.attachmentId === requestedId;
      savesInFlight.current.add(saveKey);
      setSavingKeys(new Set(savesInFlight.current));
      if (ownsViewer) setViewerSaveNotice(null);
      let message: string;
      try {
        await saveChatImageToLibrary({ attachmentId: requestedId, token });
        message = t(
          '图片已保存到系统相册。',
          'Image saved to your photo library.',
        );
      } catch (error) {
        message =
          error instanceof Error
            ? error.message
            : t(
                '保存图片失败，请重试。',
                'Unable to save the image. Try again.',
              );
      } finally {
        savesInFlight.current.delete(saveKey);
        if (mounted.current) setSavingKeys(new Set(savesInFlight.current));
      }
      if (!mounted.current || previewScopeRef.current !== previewScope) return;
      if (selectedImage.current?.scope !== previewScope) {
        onActionMessage(message);
      } else if (selectedImage.current.attachmentId === requestedId) {
        setViewerSaveNotice(message);
        if (Platform.OS === 'ios')
          AccessibilityInfo.announceForAccessibility(message);
      }
    },
    [images, onActionMessage, previewScope, t, token],
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
    if (action.type === 'file') {
      openFilePreview(action.attachmentId);
      return;
    }
    const index = action.attachmentId
      ? images.findIndex(image => image.id === action.attachmentId)
      : action.index;
    if (index === -1) return;
    openImageViewer(index);
    if (action.save) {
      saveImage(action.attachmentId).catch(() => undefined);
    }
  }, [
    action,
    images,
    onActionConsumed,
    openFilePreview,
    openImageViewer,
    saveImage,
  ]);

  const showImageActions = (index: number, inViewer = false) => {
    const image = images[index];
    if (!image || savesInFlight.current.has(`${previewScope}:${image.id}`))
      return;
    Alert.alert(
      t('图片操作', 'Image actions'),
      undefined,
      [
        ...(inViewer
          ? []
          : [
              {
                text: t('查看大图', 'View full image'),
                onPress: () => openImageViewer(index),
              },
            ]),
        {
          text: t('保存到相册', 'Save to Photos'),
          onPress: () => saveImage(image.id).catch(() => undefined),
        },
        { text: t('取消', 'Cancel'), style: 'cancel' },
      ],
      { cancelable: true },
    );
  };
  const stepImage = useCallback(
    (direction: number) => {
      const selection = selectedImage.current;
      if (selection?.scope !== previewScope) return;
      const index = images.findIndex(
        image => image.id === selection.attachmentId,
      );
      if (index >= 0) openImageViewer(index + direction);
    },
    [images, openImageViewer, previewScope],
  );
  const viewerSwipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          images.length > 1 &&
          Math.abs(gesture.dx) > 12 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) < 45) return;
          stepImage(gesture.dx < 0 ? 1 : -1);
        },
      }),
    [images.length, stepImage],
  );
  if (!validAttachments.length) return null;
  const sourceFor = (attachment: ChatAttachmentDTO) => ({
    uri: buildApiUrl(attachment.downloadPath!),
    headers: { Authorization: `Bearer ${token}` },
  });
  const fileAttachment =
    filePreviewOwner.current === previewScope
      ? files.find(item => item.id === fileId)
      : undefined;
  return (
    <View
      style={[s.container, standalone && s.standalone]}
      testID="chat-message-attachments"
    >
      {images.length ? (
        <View style={s.imageGrid}>
          {images.map((attachment, index) => {
            const failed = imageFailures.has(attachment.id);
            return (
              <Pressable
                key={attachment.id}
                testID="chat-attachment-image"
                accessibilityRole="button"
                accessibilityLabel={
                  failed
                    ? t(
                        `重试图片 ${attachment.filename}`,
                        `Retry image ${attachment.filename}`,
                      )
                    : t(
                        `查看图片 ${attachment.filename}`,
                        `View image ${attachment.filename}`,
                      )
                }
                accessibilityHint={t(
                  '长按显示图片操作',
                  'Touch and hold for image actions',
                )}
                accessibilityActions={[
                  {
                    name: 'image-actions',
                    label: t('图片操作', 'Image actions'),
                  },
                ]}
                onAccessibilityAction={event => {
                  if (event.nativeEvent.actionName !== 'image-actions') return;
                  if (onOpenMessageActions)
                    onOpenMessageActions(undefined, attachment.id);
                  else showImageActions(index);
                }}
                onPress={() => openImageViewer(index)}
                onLongPress={event => {
                  if (onOpenMessageActions)
                    onOpenMessageActions(event, attachment.id);
                  else showImageActions(index);
                }}
                style={[
                  s.imageTile,
                  images.length === 1 && s.imageTileSingle,
                  standalone && s.standaloneImage,
                  surfaceBorderStyle(palette.soft, palette.border),
                ]}
              >
                {failed ? (
                  <View style={s.failure}>
                    <Text style={colorStyle(palette.rose)}>
                      {t(
                        '图片读取失败，点按重试',
                        'Image unavailable. Tap to retry.',
                      )}
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
                      if (
                        !mounted.current ||
                        previewScopeRef.current !== previewScope
                      )
                        return;
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
      {validAttachments
        .filter(
          attachment =>
            attachment.kind === 'video' && attachment.mimeType === 'video/mp4',
        )
        .map(attachment => (
          <ChatVideoMessage
            key={token + ':' + attachment.id}
            {...{ attachment, token, palette, language }}
            onLongPress={
              onOpenMessageActions
                ? event => onOpenMessageActions(event, attachment.id)
                : undefined
            }
          />
        ))}
      {validAttachments.filter(isChatVoiceAttachment).map(attachment => (
        <ChatVoiceMessage
          key={attachment.id}
          attachment={attachment}
          token={token}
          palette={palette}
          language={language}
          onActionMessage={onActionMessage}
          standalone={standalone}
          onOpenMessageActions={onOpenMessageActions}
        />
      ))}
      {files.map(attachment => (
        <Pressable
          key={attachment.id}
          testID="chat-attachment-file"
          accessibilityRole="button"
          accessibilityLabel={t(
            `预览文件 ${attachment.filename}`,
            `Preview file ${attachment.filename}`,
          )}
          accessibilityActions={
            onOpenMessageActions
              ? [
                  {
                    name: 'message-actions',
                    label: t('消息操作', 'Message actions'),
                  },
                ]
              : undefined
          }
          onAccessibilityAction={event => {
            if (event.nativeEvent.actionName === 'message-actions')
              onOpenMessageActions?.(undefined, attachment.id);
          }}
          onLongPress={
            onOpenMessageActions
              ? event => onOpenMessageActions(event, attachment.id)
              : undefined
          }
          onPress={() => openFilePreview(attachment.id)}
          style={[
            s.fileRow,
            standalone && s.standaloneFile,
            surfaceBorderStyle(
              standalone ? palette.surface : 'transparent',
              palette.border,
            ),
          ]}
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
        visible={Boolean(viewerAttachment)}
        presentationStyle="fullScreen"
        animationType={reduceMotion ? 'none' : 'fade'}
        onRequestClose={closeImageViewer}
      >
        <SafeAreaProvider>
          {Platform.OS === 'ios' && viewerAttachment ? (
            <StatusBar barStyle="light-content" />
          ) : null}
          <SafeAreaView
            edges={['top']}
            style={[
              s.viewer,
              Platform.OS === 'android' && backgroundStyle(palette.background),
            ]}
          >
            <SafeAreaView
              edges={['bottom']}
              testID="chat-attachment-viewer"
              style={s.viewer}
            >
              <View style={s.viewerHeader}>
                <Pressable
                  testID="chat-attachment-viewer-close"
                  style={s.viewerButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('关闭图片查看器', 'Close image viewer')}
                  onPress={closeImageViewer}
                >
                  <X color={viewerTextColor} size={24} />
                </Pressable>
                <Text
                  testID="chat-attachment-viewer-page"
                  accessibilityLabel={`${viewerIndex + 1}/${images.length}`}
                  style={colorStyle(viewerTextColor)}
                >{`${viewerIndex + 1}/${images.length}`}</Text>
                <Pressable
                  testID="chat-attachment-viewer-actions"
                  style={s.viewerButton}
                  accessibilityRole="button"
                  accessibilityLabel={t('图片操作', 'Image actions')}
                  accessibilityState={{
                    busy: viewerSaving,
                    disabled: viewerSaving,
                  }}
                  disabled={viewerSaving}
                  onPress={() => showImageActions(viewerIndex, true)}
                >
                  {viewerSaving ? (
                    <ActivityIndicator color={viewerTextColor} />
                  ) : (
                    <Ellipsis color={viewerTextColor} size={22} />
                  )}
                </Pressable>
              </View>
              {viewerAttachment ? (
                <View {...viewerSwipe.panHandlers} style={s.visual}>
                  <Pressable
                    accessibilityRole="imagebutton"
                    accessibilityLabel={viewerAttachment.filename}
                    accessibilityHint={t(
                      '长按显示图片操作',
                      'Touch and hold for image actions',
                    )}
                    accessibilityActions={[
                      {
                        name: 'image-actions',
                        label: t('图片操作', 'Image actions'),
                      },
                    ]}
                    onAccessibilityAction={() =>
                      showImageActions(viewerIndex, true)
                    }
                    onLongPress={() => showImageActions(viewerIndex, true)}
                    style={s.visual}
                  >
                    <Image
                      testID="chat-attachment-viewer-image"
                      source={sourceFor(viewerAttachment)}
                      resizeMode="contain"
                      style={s.viewerImage}
                      onError={() => {
                        if (selectedImage.current !== viewerSelection) return;
                        setViewerSaveNotice(
                          t(
                            '图片读取失败，请关闭后重试。',
                            'Image unavailable. Close and try again.',
                          ),
                        );
                      }}
                    />
                  </Pressable>
                </View>
              ) : null}
              {images.length > 1 ? (
                <View style={s.viewerControls}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('上一张', 'Previous image')}
                    accessibilityState={{ disabled: viewerIndex === 0 }}
                    disabled={viewerIndex === 0}
                    style={s.viewerButton}
                    onPress={() => stepImage(-1)}
                  >
                    <ChevronLeft
                      color={
                        viewerIndex === 0 ? viewerMutedColor : viewerTextColor
                      }
                      size={26}
                    />
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('下一张', 'Next image')}
                    accessibilityState={{
                      disabled: viewerIndex === images.length - 1,
                    }}
                    disabled={viewerIndex === images.length - 1}
                    style={s.viewerButton}
                    onPress={() => stepImage(1)}
                  >
                    <ChevronRight
                      color={
                        viewerIndex === images.length - 1
                          ? viewerMutedColor
                          : viewerTextColor
                      }
                      size={26}
                    />
                  </Pressable>
                </View>
              ) : null}
              {viewerSaveNotice ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={[s.viewerNotice, colorStyle(viewerTextColor)]}
                >
                  {viewerSaveNotice}
                </Text>
              ) : null}
            </SafeAreaView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
      <Modal
        visible={Boolean(fileAttachment)}
        animationType={reduceMotion ? 'none' : 'slide'}
        onRequestClose={closeFilePreview}
      >
        <SafeAreaProvider>
          <SafeAreaView
            testID="chat-attachment-file-preview"
            accessibilityViewIsModal
            onAccessibilityEscape={closeFilePreview}
            style={[s.filePreview, backgroundStyle(palette.background)]}
          >
            <View style={s.viewerHeader}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('关闭文件预览', 'Close file preview')}
                onPress={closeFilePreview}
                style={s.viewerButton}
              >
                <X color={palette.text} size={24} />
              </Pressable>
              <Text
                numberOfLines={1}
                style={[s.fileTitle, colorStyle(palette.text)]}
              >
                {fileAttachment?.filename}
              </Text>
              <View style={s.fileHeaderSpacer} />
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
          </SafeAreaView>
        </SafeAreaProvider>
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

const viewerTextColor = '#FAFAFC';
const viewerMutedColor = '#777B82';

const s = StyleSheet.create({
  container: { gap: 8, marginTop: 8, maxWidth: 300 },
  standalone: { marginTop: 0 },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  imageTile: {
    borderRadius: 8,
    borderWidth: 1,
    height: 92,
    overflow: 'hidden',
    width: 92,
  },
  imageTileSingle: { height: 180, width: 240, maxWidth: '100%' },
  standaloneImage: { borderWidth: 0, borderRadius: 12 },
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
    flexDirection: 'row',
    gap: 8,
    minHeight: 56,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  standaloneFile: {
    borderRadius: 12,
    borderWidth: 1,
    width: 220,
    maxWidth: '100%',
  },
  fileCopy: { flex: 1, gap: 2 },
  viewer: { flex: 1, backgroundColor: '#15171B' },
  visual: { flex: 1 },
  viewerHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 56,
    paddingHorizontal: 16,
  },
  viewerButton: {
    alignItems: 'center',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  viewerImage: { flex: 1, width: '100%' },
  viewerNotice: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    textAlign: 'center',
  },
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
  fileHeaderSpacer: { width: 44 },
});
