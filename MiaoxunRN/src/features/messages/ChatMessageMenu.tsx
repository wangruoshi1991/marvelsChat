import React from 'react';
import { Alert, Pressable, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {
  Copy,
  Download,
  Eye,
  FileText,
  RefreshCw,
  Trash2,
  Undo2,
} from 'lucide-react-native';

import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { MessageInlineAction } from '../../shared/ui';
import { ChatMessage, Language } from '../session/useMiaoxunSession';
import type { ChatAttachmentDTO } from '../../models/api';

export function ChatMessageMenu({
  palette,
  language,
  selectedMessage,
  position,
  arrowLeft,
  canRecall,
  onClose,
  onReply,
  onDeleteMessage,
  onRecallMessage,
  onActionMessage,
  onViewAttachments,
  onPreviewAttachment,
  onSaveAttachment,
}: {
  palette: Palette;
  language: Language;
  selectedMessage: ChatMessage;
  position: {
    x: number;
    y: number;
    isMine: boolean;
    arrowPlacement: 'top' | 'bottom';
  };
  arrowLeft: number;
  canRecall: boolean;
  onClose: () => void;
  onReply: (message: ChatMessage) => void;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onRecallMessage: (messageId: string) => void | Promise<void>;
  onActionMessage: (message: string) => void;
  onViewAttachments?: (message: ChatMessage) => void;
  onPreviewAttachment?: (attachment: ChatAttachmentDTO) => void;
  onSaveAttachment?: (attachment: ChatAttachmentDTO) => void;
}) {
  const hasText = selectedMessage.content.trim().length > 0;
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
  const imageAttachments = attachments.filter(item => item.kind === 'image');
  const fileAttachments = attachments.filter(item => item.kind === 'file');
  const canReply =
    !isFailed && !selectedMessage.deletedAt && !selectedMessage.recalledAt;
  return (
    <View style={[styles.messageInlineMenuLayer, styles.pointerEventsBoxNone]}>
      <Pressable style={styles.messageInlineMenuBackdrop} onPress={onClose} />
      <View
        style={[
          styles.messageInlineMenu,
          position.isMine
            ? styles.messageInlineMenuMine
            : styles.messageInlineMenuOther,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            left: position.x,
            shadowColor: palette.shadow,
            top: position.y,
          },
        ]}
      >
        <View
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
        {canReply ? (
          <MessageInlineAction
            icon={Undo2}
            title={textFor(language, '回复', 'Reply')}
            palette={palette}
            onPress={() => {
              onReply(selectedMessage);
              onClose();
            }}
          />
        ) : null}
        {hasText && !isFailed ? (
          <MessageInlineAction
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
        {imageAttachments.length && onViewAttachments ? (
          <MessageInlineAction
            icon={Eye}
            title={textFor(language, '查看图片', 'View images')}
            accessibilityLabel={textFor(language, '查看图片', 'View images')}
            palette={palette}
            onPress={() => {
              onViewAttachments(selectedMessage);
              onClose();
            }}
          />
        ) : null}
        {imageAttachments.length && onSaveAttachment ? (
          <MessageInlineAction
            icon={Download}
            title={textFor(language, '保存图片', 'Save image')}
            accessibilityLabel={textFor(language, '保存图片', 'Save image')}
            palette={palette}
            onPress={() => {
              onSaveAttachment(imageAttachments[0]);
              onClose();
            }}
          />
        ) : null}
        {fileAttachments.length && onPreviewAttachment ? (
          <MessageInlineAction
            icon={FileText}
            title={textFor(language, '预览文件', 'Preview file')}
            accessibilityLabel={textFor(language, '预览文件', 'Preview file')}
            palette={palette}
            onPress={() => {
              onPreviewAttachment(fileAttachments[0]);
              onClose();
            }}
          />
        ) : null}
        <MessageInlineAction
          icon={Trash2}
          title={textFor(language, '删除', 'Delete')}
          palette={palette}
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
                { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
                {
                  text: textFor(language, '删除', 'Delete'),
                  style: 'destructive',
                  onPress: () => {
                    Promise.resolve(onDeleteMessage(messageId)).catch(error => {
                      onActionMessage(
                        error instanceof Error
                          ? error.message
                          : textFor(language, '删除失败', 'Delete failed'),
                      );
                    });
                  },
                },
              ],
            );
          }}
        />
        {canRecall ? (
          <MessageInlineAction
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
      </View>
    </View>
  );
}
