import React from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { contactIconAssets } from '../../assets/icons';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationComicDiaryPanel } from './StationComicDiaryPanel';

export function ComicCreationScreen({
  palette,
  language,
  session,
  initialPrompt,
  onBack,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  initialPrompt?: string;
  onBack: () => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  return (
    <KeyboardAvoidingView
      accessibilityViewIsModal
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[
        styles.stationContentListScreen,
        { backgroundColor: palette.background },
      ]}
    >
      <View
        style={[
          styles.stationContentListHeader,
          {
            backgroundColor: palette.surface,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '返回聊天', 'Back to chat')}
          onPress={onBack}
          style={[styles.stationEditorHeaderSide, creationStyles.back]}
        >
          <Image
            resizeMode="contain"
            source={contactIconAssets.back}
            style={[styles.stationEditorBackIcon, { tintColor: palette.text }]}
          />
        </Pressable>
        <Text
          style={[styles.stationEditorHeaderTitle, { color: palette.text }]}
          numberOfLines={1}
        >
          {textFor(language, '制作漫画', 'Create a comic')}
        </Text>
        <View style={styles.stationEditorHeaderSide} />
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.stationContentListBody}
      >
        <Text style={{ color: palette.secondaryText }}>
          {textFor(
            language,
            '先填写故事并生成、保存分镜；查看后再明确确认生成漫画画面。这里只使用你填写的内容，不会自动读取聊天记录、日记或相册。已保存的独立草稿可在这里继续查看。',
            'Describe your story, then create and save its storyboard. Review it before explicitly confirming image generation. Only the text entered here is used; chat history, diaries and albums are not read automatically. Your saved standalone drafts remain available here.',
          )}
        </Text>
        <StationComicDiaryPanel
          initialPrompt={initialPrompt}
          comicDiaries={session.stationContent.comicDiaries}
          palette={palette}
          language={language}
          session={session}
          onActionMessage={onActionMessage}
          onActionError={onActionError}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const creationStyles = StyleSheet.create({ back: { minHeight: 44 } });
