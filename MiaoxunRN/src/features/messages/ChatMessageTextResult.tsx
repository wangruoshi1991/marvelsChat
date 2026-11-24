import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { textFor } from '../../shared/i18n';
import type { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';
import type { ChatMessageTextOutput } from './useChatMessageText';

export function ChatMessageTextResult({
  action,
  output,
  translation,
  language,
  palette,
  onRetry,
  onTranslateTranscript,
  onTranscribeAgain,
}: {
  action: 'translate' | 'transcribe';
  output: ChatMessageTextOutput;
  translation?: ChatMessageTextOutput;
  language: Language;
  palette: Palette;
  onRetry: () => void;
  onTranslateTranscript?: () => void;
  onTranscribeAgain: () => void;
}) {
  if (output.status === 'ready' && !output.visible) return null;
  const button = (label: string, onPress: () => void) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.button}
    >
      <Text style={[styles.buttonLabel, { color: palette.mint }]}>{label}</Text>
    </Pressable>
  );
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.panel, { borderTopColor: palette.border }]}
    >
      <Text style={[styles.label, { color: palette.secondaryText }]}>
        {action === 'translate'
          ? textFor(language, '译文', 'Translation')
          : textFor(language, '语音转文字', 'Voice transcript')}
      </Text>
      <Text
        selectable={output.status === 'ready'}
        style={[styles.text, { color: palette.text }]}
      >
        {output.status === 'loading'
          ? textFor(language, '正在处理…', 'Processing…')
          : output.text}
      </Text>
      {output.status === 'error' && output.retryable
        ? button(textFor(language, '重试', 'Retry'), onRetry)
        : null}
      {output.status === 'ready' && onTranslateTranscript ? (
        translation ? (
          <View
            style={[styles.translation, { borderTopColor: palette.border }]}
          >
            <Text style={[styles.label, { color: palette.secondaryText }]}>
              {textFor(language, '转写译文', 'Transcript translation')}
            </Text>
            <Text
              selectable={translation.status === 'ready'}
              style={[styles.text, { color: palette.text }]}
            >
              {translation.status === 'loading'
                ? textFor(language, '正在翻译…', 'Translating…')
                : translation.text}
            </Text>
            {translation.status === 'error' && translation.expired
              ? button(
                  textFor(language, '重新转写', 'Transcribe again'),
                  onTranscribeAgain,
                )
              : translation.status === 'error' && translation.retryable
              ? button(
                  textFor(language, '重试翻译', 'Retry translation'),
                  onTranslateTranscript,
                )
              : null}
          </View>
        ) : (
          button(
            textFor(language, '翻译转写', 'Translate transcript'),
            onTranslateTranscript,
          )
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 3,
    marginTop: 4,
    maxWidth: '86%',
    minWidth: 100,
    paddingHorizontal: 10,
    paddingTop: 6,
  },
  label: { fontSize: 12, fontWeight: '600' },
  text: { fontSize: 15, lineHeight: 22 },
  translation: {
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 3,
    marginTop: 6,
    paddingTop: 6,
  },
  buttonLabel: { fontWeight: '600' },
  button: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
});
