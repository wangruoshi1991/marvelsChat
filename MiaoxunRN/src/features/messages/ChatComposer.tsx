import type { AIContextReference } from '../../models/aiTask';
import type { AssistMessageSource } from '../assist/assistMessageSource';
import { ContextReference } from '../ai/AIInteraction';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Mic } from 'lucide-react-native';

import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes, productColors } from '../../shared/theme';
import { ChatMessage, Language } from '../session/useMiaoxunSession';
import { chatLayoutStyles } from './chatLayoutStyles';

export function ChatComposer({
  palette,
  language,
  threadTitle,
  draft,
  isSending,
  isRecognizingSpeech,
  replyTarget,
  contextRefs = [],
  workspaceActions,
  contextAccessWarning,
  onOpenAgentAccess,
  onRemoveContextReference,
  onChangeDraft,
  onClearReplyTarget,
  onFocusInput,
  onRecognizeSpeech,
  onSend,
}: {
  palette: Palette;
  language: Language;
  threadTitle: string;
  draft: string;
  isSending: boolean;
  isRecognizingSpeech: boolean;
  replyTarget: ChatMessage | null;
  assistSource?: AssistMessageSource;
  contextRefs?: AIContextReference[];
  workspaceActions?: React.ReactNode;
  contextAccessWarning?: string;
  onOpenAgentAccess?: () => void;
  onRemoveContextReference?: (index: number) => void;
  onChangeDraft: (value: string) => void;
  onClearReplyTarget: () => void;
  onFocusInput: () => void;
  onRecognizeSpeech: () => void;
  onSend: () => void;
}) {
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
      {workspaceActions}
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
          value={draft}
          onChangeText={onChangeDraft}
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
