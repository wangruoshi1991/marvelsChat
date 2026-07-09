import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import {Mic, Send} from 'lucide-react-native';

import {displayText, textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {ChatMessage, Language} from '../session/useMiaoxunSession';

export function ChatComposer({
  palette,
  language,
  threadTitle,
  draft,
  isSending,
  isRecognizingSpeech,
  replyTarget,
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
  onChangeDraft: (value: string) => void;
  onClearReplyTarget: () => void;
  onFocusInput: () => void;
  onRecognizeSpeech: () => void;
  onSend: () => void;
}) {
  return (
    <View
      style={[
        styles.composer,
        {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
        },
      ]}>
      {replyTarget ? (
        <View
          style={[
            styles.replyComposer,
            {
              backgroundColor: palette.soft,
              borderLeftColor: palette.mint,
            },
          ]}>
          <View style={styles.replyComposerText}>
            <Text
              style={[
                styles.replyPreviewName,
                {color: palette.secondaryText},
              ]}>
              {textFor(language, '回复', 'Reply')}{' '}
              {displayText(language, replyTarget.senderName)}
            </Text>
            <Text
              style={[
                styles.replyPreviewContent,
                {color: palette.secondaryText},
              ]}
              numberOfLines={1}>
              {displayText(language, replyTarget.content)}
            </Text>
          </View>
          <Pressable
            onPress={onClearReplyTarget}
            style={styles.replyComposerClose}>
            <Text
              style={[
                styles.messageActionText,
                {color: palette.secondaryText},
              ]}>
              ×
            </Text>
          </Pressable>
        </View>
      ) : null}
      <View style={styles.composerRow}>
        <Pressable
          accessibilityLabel={textFor(language, '语音转文字', 'Speech to text')}
          disabled={isRecognizingSpeech || isSending}
          onPress={onRecognizeSpeech}
          style={[
            styles.composerIconButton,
            {backgroundColor: palette.soft},
            (isRecognizingSpeech || isSending) && styles.disabledButton,
          ]}>
          {isRecognizingSpeech ? (
            <ActivityIndicator color={palette.mint} size="small" />
          ) : (
            <Mic color={palette.text} size={19} strokeWidth={2.5} />
          )}
        </Pressable>
        <TextInput
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
            styles.input,
            {backgroundColor: palette.input, color: palette.text},
          ]}
        />
        <Pressable
          disabled={isSending}
          onPress={onSend}
          style={[
            styles.sendButton,
            {backgroundColor: palette.mint},
            isSending && styles.disabledButton,
          ]}>
          <Send color="#ffffff" size={19} strokeWidth={3} />
        </Pressable>
      </View>
    </View>
  );
}
