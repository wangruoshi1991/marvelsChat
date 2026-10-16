import type { AssistMessageSource } from '../assist/assistMessageSource';
import type { AIContextReference } from '../../models/aiTask';
import { ContextReference } from '../ai/AIInteraction';
import React, { useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Bot,
  ClipboardPaste,
  LayoutGrid,
  Mic,
  WrapText,
} from 'lucide-react-native';
import Clipboard from '@react-native-clipboard/clipboard';

import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes, productColors } from '../../shared/theme';
import { useAIAssist } from '../assist/AIAssistProvider';
import { AgentGlyphAvatar } from './AgentGlyphAvatar';
import {
  AIAssistAction,
  AIAssistObjectReference,
} from '../assist/aiAssistTypes';
import { ChatMessage, Language } from '../session/useMiaoxunSession';
import { chatLayoutStyles } from './chatLayoutStyles';

export function ChatComposer({
  palette,
  language,
  threadTitle,
  threadId,
  draft,
  isSending,
  isRecognizingSpeech,
  replyTarget,
  contextRefs = [],
  contextAccessWarning,
  onOpenAgentAccess,
  onRemoveContextReference,
  onChangeDraft,
  onClearReplyTarget,
  onFocusInput,
  onRecognizeSpeech,
  onSend,
  onActionMessage,
}: {
  palette: Palette;
  language: Language;
  threadTitle: string;
  threadId: string;
  draft: string;
  isSending: boolean;
  isRecognizingSpeech: boolean;
  replyTarget: ChatMessage | null;
  contextRefs?: AIContextReference[];
  assistSource?: AssistMessageSource;
  contextAccessWarning?: string;
  onOpenAgentAccess?: () => void;
  onRemoveContextReference?: (index: number) => void;
  onChangeDraft: (value: string) => void;
  onClearReplyTarget: () => void;
  onFocusInput: () => void;
  onRecognizeSpeech: () => void;
  onSend: () => void;
  onActionMessage: (message: string) => void;
}) {
  const assist = useAIAssist();
  const inputRef = useRef<TextInput>(null);
  const selectionRef = useRef({ start: draft.length, end: draft.length });
  const assistObject: AIAssistObjectReference = {
    kind: 'chat-draft',
    id: threadId,
    title: textFor(language, '聊天草稿', 'Message draft'),
    metadata: { content: draft, threadId },
  };
  const replaceSelection = (replacement: string) => {
    const start = Math.max(
      0,
      Math.min(selectionRef.current.start, draft.length),
    );
    const end = Math.max(
      start,
      Math.min(selectionRef.current.end, draft.length),
    );
    const nextDraft = `${draft.slice(0, start)}${replacement}${draft.slice(
      end,
    )}`;
    const cursor = start + replacement.length;
    selectionRef.current = { start: cursor, end: cursor };
    onChangeDraft(nextDraft);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setNativeProps({
        selection: { start: cursor, end: cursor },
      });
    });
  };
  const shareDraft = () => {
    Share.share({ message: draft }).catch(error => {
      onActionMessage(
        error instanceof Error
          ? error.message
          : textFor(language, '分享失败', 'Sharing failed'),
      );
    });
  };
  const copyDraft = () => {
    Clipboard.setString(draft);
    onActionMessage(textFor(language, '草稿已复制', 'Draft copied'));
  };
  const continueEditing = () => {
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const openMoreActions = () => {
    assist.dismiss();
    Alert.alert(textFor(language, '更多', 'More'), undefined, [
      ...(draft.trim()
        ? [
            {
              text: textFor(language, '分享', 'Share'),
              onPress: shareDraft,
            },
            {
              text: textFor(language, '复制', 'Copy'),
              onPress: copyDraft,
            },
          ]
        : []),
      {
        text: textFor(language, '继续编辑', 'Keep editing'),
        onPress: continueEditing,
      },
      { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
    ]);
  };
  const assistActions: AIAssistAction[] = [
    {
      direction: 'up',
      label: textFor(language, '换行', 'New line'),
      Icon: WrapText,
      accent: palette.mint,
      onSelect: () => {
        assist.dismiss();
        replaceSelection('\n');
      },
    },
    {
      direction: 'right',
      label: textFor(language, '妙管家', 'Butler'),
      Icon: Bot,
      accent: palette.mint,
      onSelect: object => assist.askButler(object),
    },
    {
      direction: 'down',
      label: textFor(language, '粘贴', 'Paste'),
      Icon: ClipboardPaste,
      accent: palette.mint,
      onSelect: async () => {
        assist.dismiss();
        try {
          const clipboardText = await Clipboard.getString();
          if (!clipboardText) {
            onActionMessage(
              textFor(language, '剪贴板为空', 'Clipboard is empty'),
            );
            continueEditing();
            return;
          }
          replaceSelection(clipboardText);
        } catch (error) {
          onActionMessage(
            error instanceof Error
              ? error.message
              : textFor(language, '无法读取剪贴板', 'Unable to read clipboard'),
          );
        }
      },
    },
    {
      direction: 'left',
      label: textFor(language, '更多', 'More'),
      Icon: LayoutGrid,
      accent: palette.mint,
      onSelect: openMoreActions,
    },
  ];
  const canOpenAssist = !isSending;
  const canSend = Boolean(draft.trim()) && !isSending && !contextAccessWarning;
  const isLight = palette.text === palettes.light.text;
  const accent = isLight ? productColors.accent : palette.mint;
  const soft = isLight ? productColors.soft : palette.soft;
  const inputBorder = isLight ? productColors.chipBorder : palette.border;

  return (
    <View
      style={[
        chatLayoutStyles.composer,
        {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
        },
      ]}
    >
      {contextAccessWarning ? (
        <Pressable
          testID="chat-context-access"
          accessibilityRole="button"
          accessibilityLabel={contextAccessWarning}
          onPress={onOpenAgentAccess}
          style={accessStyles.warning}
        >
          <Text style={{ color: palette.text }}>{contextAccessWarning}</Text>
          <Text style={{ color: palette.secondaryText }}>
            {textFor(
              language,
              '查看并确认授权，或移除引用',
              'Review access, or remove the reference',
            )}
          </Text>
        </Pressable>
      ) : null}
      <ContextReference
        references={contextRefs}
        onRemove={onRemoveContextReference}
        palette={palette}
        language={language}
      />
      {replyTarget ? (
        <View
          style={[
            styles.replyComposer,
            {
              backgroundColor: palette.soft,
              borderLeftColor: palette.mint,
            },
          ]}
        >
          <View style={styles.replyComposerText}>
            <Text
              style={[
                styles.replyPreviewName,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(language, '回复', 'Reply')}{' '}
              {displayText(language, replyTarget.senderName)}
            </Text>
            <Text
              style={[
                styles.replyPreviewContent,
                { color: palette.secondaryText },
              ]}
              numberOfLines={1}
            >
              {displayText(language, replyTarget.content)}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '取消回复', 'Cancel reply')}
            onPress={onClearReplyTarget}
            style={chatLayoutStyles.composerButton}
          >
            <Text
              style={[
                styles.messageActionText,
                { color: palette.secondaryText },
              ]}
            >
              ×
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={chatLayoutStyles.composerRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '语音转文字', 'Speech to text')}
          disabled={isRecognizingSpeech || isSending}
          onPress={onRecognizeSpeech}
          style={[
            chatLayoutStyles.composerButton,
            { backgroundColor: soft },
            (isRecognizingSpeech || isSending) && styles.disabledButton,
          ]}
        >
          {isRecognizingSpeech ? (
            <ActivityIndicator color={palette.mint} size="small" />
          ) : (
            <Mic color={palette.text} size={19} strokeWidth={2.5} />
          )}
        </Pressable>
        <TextInput
          accessibilityLabel={textFor(language, '消息输入框', 'Message input')}
          ref={inputRef}
          value={draft}
          onChangeText={onChangeDraft}
          onSelectionChange={event => {
            selectionRef.current = event.nativeEvent.selection;
          }}
          placeholder={textFor(
            language,
            `发给${threadTitle}`,
            `Message ${displayText(language, threadTitle)}`,
          )}
          placeholderTextColor={palette.secondaryText}
          multiline
          onFocus={onFocusInput}
          style={[
            chatLayoutStyles.input,
            {
              backgroundColor: palette.input,
              color: palette.text,
              borderColor: inputBorder,
            },
          ]}
        />
        <Pressable
          accessibilityLabel={textFor(
            language,
            '草稿 AI 辅助',
            'Draft AI actions',
          )}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canOpenAssist }}
          disabled={!canOpenAssist}
          onPress={event => {
            assist.open({
              object: assistObject,
              actions: assistActions,
              point: {
                x: event.nativeEvent.pageX,
                y: event.nativeEvent.pageY,
              },
            });
          }}
          style={[
            chatLayoutStyles.composerButton,
            { backgroundColor: soft },
            !canOpenAssist && styles.disabledButton,
          ]}
          testID="chat-draft-assist"
        >
          <AgentGlyphAvatar agentId="miaoxun-butler" size={28} />
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '发送消息', 'Send message')}
          accessibilityState={{ disabled: !canSend, busy: isSending }}
          disabled={!canSend}
          onPress={onSend}
          style={[
            chatLayoutStyles.send,
            { backgroundColor: accent },
            !canSend && styles.disabledButton,
          ]}
        >
          <Text style={chatLayoutStyles.sendText}>
            {textFor(
              language,
              isSending ? '发送中' : '发送',
              isSending ? 'Sending' : 'Send',
            )}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const accessStyles = StyleSheet.create({ warning: { paddingVertical: 8 } });
