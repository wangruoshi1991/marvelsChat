import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  Bot,
  Captions,
  Copy,
  Download,
  Eye,
  FileText,
  Forward,
  Languages,
  ListChecks,
  RefreshCw,
  Share2,
  Trash2,
  Undo2,
} from 'lucide-react-native';

import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { MessageInlineAction } from '../../shared/ui';
import { ChatMessage, Language } from '../session/useMiaoxunSession';
import type { ChatAttachmentDTO } from '../../models/api';
import { chatVoiceMessageContent } from '../../services/chatVoiceAudio';

export function ChatMessageMenu({
  palette,
  language,
  selectedMessage,
  position,
  arrowLeft,
  canRecall,
  onClose,
  attachmentId,
  onReply,
  onDeleteMessage,
  onRecallMessage,
  onActionMessage,
  onViewAttachments,
  onPreviewAttachment,
  onSaveAttachment,
  onShare,
  onForward,
  onSelectMessages,
  onTranslate,
  onTranscribe,
  onAskButler,
  translationVisible = false,
  transcriptionVisible = false,
}: {
  palette: Palette;
  language: Language;
  selectedMessage: ChatMessage;
  position: {
    x: number;
    y: number;
    isMine: boolean;
    arrowPlacement: 'top' | 'bottom';
    anchored?: boolean;
    menuWidth?: number;
    maxHeight?: number;
    bottom?: number;
  };
  arrowLeft: number;
  canRecall: boolean;
  onClose: () => void;
  attachmentId?: string;
  onReply: (message: ChatMessage) => void;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onRecallMessage: (messageId: string) => void | Promise<void>;
  onActionMessage: (message: string) => void;
  onViewAttachments?: (message: ChatMessage, attachmentId?: string) => void;
  onPreviewAttachment?: (attachment: ChatAttachmentDTO) => void;
  onSaveAttachment?: (attachment: ChatAttachmentDTO) => void;
  onShare?: (message: ChatMessage) => void;
  onForward?: (message: ChatMessage) => void;
  onSelectMessages?: (message: ChatMessage) => void;
  onTranslate?: (message: ChatMessage) => void;
  onTranscribe?: (message: ChatMessage) => void;
  onAskButler?: (message: ChatMessage) => void;
  translationVisible?: boolean;
  transcriptionVisible?: boolean;
}) {
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const hasText =
    selectedMessage.content.trim().length > 0 &&
    selectedMessage.content !== chatVoiceMessageContent;
  const isFailed = selectedMessage.localStatus === 'failed';
  const attachments =
    !selectedMessage.deletedAt &&
    !selectedMessage.recalledAt &&
    !isFailed &&
    Array.isArray(selectedMessage.metadata?.attachments)
      ? selectedMessage.metadata.attachments.filter(
          (attachment): attachment is ChatAttachmentDTO =>
            Boolean(attachment && typeof attachment === 'object'),
        )
      : [];
  const targetAttachments = attachmentId
    ? attachments.filter(item => item.id === attachmentId)
    : attachments;
  const imageAttachment = targetAttachments.find(item => item.kind === 'image');
  const fileAttachment = targetAttachments.find(item => item.kind === 'file');
  const canReply =
    !isFailed && !selectedMessage.deletedAt && !selectedMessage.recalledAt;
  const hasVoice = targetAttachments.some(item => item.kind === 'audio');
  const run = (action: (message: ChatMessage) => void) => {
    onClose();
    action(selectedMessage);
  };
  const divider = (
    <View
      importantForAccessibility="no"
      style={[menuStyles.divider, { backgroundColor: palette.border }]}
    />
  );
  const hasSecondaryActions =
    (hasText && onTranslate) ||
    onAskButler ||
    (hasVoice && onTranscribe) ||
    (imageAttachment && (onViewAttachments || onSaveAttachment)) ||
    (fileAttachment && onPreviewAttachment);
  return (
    <View
      accessibilityViewIsModal
      onAccessibilityEscape={onClose}
      style={[styles.messageInlineMenuLayer, styles.pointerEventsBoxNone]}
    >
      <Pressable
        accessible={false}
        importantForAccessibility="no"
        style={styles.messageInlineMenuBackdrop}
        onPress={onClose}
      />
      <View
        testID="chat-message-action-menu"
        style={[
          styles.messageInlineMenu,
          menuStyles.panel,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            left: position.x,
            shadowColor: palette.shadow,
            width: position.menuWidth ?? (position.isMine ? 284 : 220),
            maxHeight: position.maxHeight,
            top: position.bottom === undefined ? position.y : undefined,
            bottom: position.bottom,
          },
        ]}
      >
        {position.anchored !== false ? (
          <View
            pointerEvents="none"
            style={[
              styles.messageInlineMenuArrow,
              {
                backgroundColor: palette.surface,
                borderColor: palette.border,
                left: arrowLeft,
              },
              position.arrowPlacement === 'top'
                ? styles.messageInlineMenuArrowTop
                : styles.messageInlineMenuArrowBottom,
            ]}
          />
        ) : null}
        <ScrollView
          contentContainerStyle={menuStyles.actions}
          keyboardShouldPersistTaps="always"
        >
          {canReply ? (
            <MessageInlineAction
              layout="row"
              icon={Undo2}
              title={textFor(language, '回复', 'Reply')}
              palette={palette}
              onPress={() => {
                onReply(selectedMessage);
                onClose();
              }}
            />
          ) : null}
          {hasText && canReply ? (
            <MessageInlineAction
              layout="row"
              icon={Copy}
              title={textFor(language, '复制', 'Copy')}
              palette={palette}
              onPress={() => {
                Clipboard.setString(selectedMessage.content);
                onActionMessage(
                  textFor(language, '消息已复制', 'Message copied'),
                );
                onClose();
              }}
            />
          ) : null}
          {canReply && hasText && onShare ? (
            <MessageInlineAction
              layout="row"
              icon={Share2}
              title={t('分享', 'Share')}
              palette={palette}
              onPress={() => run(onShare)}
            />
          ) : null}
          {canReply && onForward ? (
            <MessageInlineAction
              layout="row"
              icon={Forward}
              title={t('转发', 'Forward')}
              palette={palette}
              onPress={() => run(onForward)}
            />
          ) : null}
          {canReply && onSelectMessages ? (
            <MessageInlineAction
              layout="row"
              icon={ListChecks}
              title={t('多选', 'Select messages')}
              palette={palette}
              onPress={() => run(onSelectMessages)}
            />
          ) : null}
          {canReply && hasSecondaryActions ? divider : null}
          {canReply && hasText && onTranslate ? (
            <MessageInlineAction
              layout="row"
              icon={Languages}
              title={
                translationVisible
                  ? t('收起译文', 'Hide translation')
                  : t('翻译', 'Translate')
              }
              palette={palette}
              onPress={() => run(onTranslate)}
            />
          ) : null}
          {canReply && hasVoice && onTranscribe ? (
            <MessageInlineAction
              layout="row"
              icon={Captions}
              title={
                transcriptionVisible
                  ? t('收起转写', 'Hide transcription')
                  : t('转文字', 'Transcribe')
              }
              palette={palette}
              onPress={() => run(onTranscribe)}
            />
          ) : null}
          {imageAttachment && onViewAttachments ? (
            <MessageInlineAction
              layout="row"
              icon={Eye}
              title={textFor(language, '查看图片', 'View images')}
              accessibilityLabel={textFor(language, '查看图片', 'View images')}
              palette={palette}
              onPress={() => {
                onViewAttachments(selectedMessage, imageAttachment.id);
                onClose();
              }}
            />
          ) : null}
          {imageAttachment && onSaveAttachment ? (
            <MessageInlineAction
              layout="row"
              icon={Download}
              title={textFor(language, '保存图片', 'Save image')}
              accessibilityLabel={textFor(language, '保存图片', 'Save image')}
              palette={palette}
              onPress={() => {
                onSaveAttachment(imageAttachment);
                onClose();
              }}
            />
          ) : null}
          {fileAttachment && onPreviewAttachment ? (
            <MessageInlineAction
              layout="row"
              icon={FileText}
              title={textFor(language, '预览文件', 'Preview file')}
              accessibilityLabel={textFor(language, '预览文件', 'Preview file')}
              palette={palette}
              onPress={() => {
                onPreviewAttachment(fileAttachment);
                onClose();
              }}
            />
          ) : null}
          {canReply && onAskButler ? (
            <MessageInlineAction
              layout="row"
              icon={Bot}
              title={t('妙讯工具', 'Miaoxun tools')}
              palette={palette}
              onPress={() => run(onAskButler)}
            />
          ) : null}
          {canReply ? divider : null}
          <MessageInlineAction
            layout="row"
            icon={Trash2}
            title={textFor(language, '删除', 'Delete')}
            palette={palette}
            danger
            onPress={() => {
              const messageId = selectedMessage.id;
              onClose();
              Alert.alert(
                textFor(language, '删除消息', 'Delete message'),
                textFor(
                  language,
                  '仅从你的聊天记录中删除这条消息，无法恢复。',
                  'Delete this message from your chat history. This cannot be undone.',
                ),
                [
                  {
                    text: textFor(language, '取消', 'Cancel'),
                    style: 'cancel',
                  },
                  {
                    text: textFor(language, '删除', 'Delete'),
                    style: 'destructive',
                    onPress: () => {
                      Promise.resolve(onDeleteMessage(messageId)).catch(
                        error => {
                          onActionMessage(
                            error instanceof Error
                              ? error.message
                              : textFor(language, '删除失败', 'Delete failed'),
                          );
                        },
                      );
                    },
                  },
                ],
              );
            }}
          />
          {canReply && canRecall ? (
            <MessageInlineAction
              layout="row"
              icon={RefreshCw}
              title={textFor(language, '撤回', 'Recall')}
              palette={palette}
              danger
              onPress={() => {
                const messageId = selectedMessage.id;
                onClose();
                Promise.resolve(onRecallMessage(messageId)).catch(error => {
                  onActionMessage(
                    error instanceof Error
                      ? error.message
                      : textFor(language, '撤回失败', 'Recall failed'),
                  );
                });
              }}
            />
          ) : null}
        </ScrollView>
      </View>
    </View>
  );
}

const menuStyles = StyleSheet.create({
  panel: {
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  actions: { padding: 4 },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 8,
    marginVertical: 2,
  },
});
