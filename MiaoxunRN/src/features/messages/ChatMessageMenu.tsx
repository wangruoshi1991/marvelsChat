import React from 'react';
import {Pressable, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Copy, RefreshCw, Trash2, Undo2} from 'lucide-react-native';

import {textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {MessageInlineAction} from '../../shared/ui';
import {ChatMessage, Language} from '../session/useMiaoxunSession';

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
}: {
  palette: Palette;
  language: Language;
  selectedMessage: ChatMessage;
  position: {x: number; y: number; isMine: boolean};
  arrowLeft: number;
  canRecall: boolean;
  onClose: () => void;
  onReply: (message: ChatMessage) => void;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onRecallMessage: (messageId: string) => void | Promise<void>;
  onActionMessage: (message: string) => void;
}) {
  return (
    <View style={[styles.messageInlineMenuLayer, styles.pointerEventsBoxNone]}>
      <Pressable style={styles.messageInlineMenuBackdrop} onPress={onClose} />
      <View
        style={[
          styles.messageInlineMenu,
          {
            backgroundColor: palette.surface,
            borderColor: palette.border,
            left: position.x,
            shadowColor: palette.shadow,
            top: position.y,
          },
        ]}>
        <View
          style={[
            styles.messageInlineMenuArrow,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              left: arrowLeft,
            },
          ]}
        />
        <MessageInlineAction
          icon={Undo2}
          title={textFor(language, '回复', 'Reply')}
          palette={palette}
          onPress={() => {
            onReply(selectedMessage);
            onClose();
          }}
        />
        <MessageInlineAction
          icon={Copy}
          title={textFor(language, '复制', 'Copy')}
          palette={palette}
          onPress={() => {
            Clipboard.setString(selectedMessage.content);
            onClose();
            onActionMessage(textFor(language, '消息已复制', 'Message copied'));
          }}
        />
        <MessageInlineAction
          icon={Trash2}
          title={textFor(language, '删除', 'Delete')}
          palette={palette}
          onPress={() => {
            const messageId = selectedMessage.id;
            onClose();
            Promise.resolve(onDeleteMessage(messageId)).catch(error => {
              onActionMessage(
                error instanceof Error
                  ? error.message
                  : textFor(language, '删除失败', 'Delete failed'),
              );
            });
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
