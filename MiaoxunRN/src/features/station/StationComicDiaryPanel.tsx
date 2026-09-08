import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';

import { StationComicDiaryDTO, StationDiaryEntryDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import {
  SettingsActionButton,
  SettingsSegmentRow,
} from '../../shared/settingsUi';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { SegmentedControl } from '../../shared/ui';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { StationContentEditorSection } from './StationContentEditorUi';

type ComicStyle = 'slice-of-life' | 'cute' | 'manga' | 'storyboard';
type FrameCountValue = '2' | '4' | '6' | '8';

export function StationComicDiaryPanel({
  diary,
  comicDiaries,
  palette,
  language,
  session,
  onActionMessage,
  onActionError,
}: {
  diary: StationDiaryEntryDTO;
  comicDiaries: StationComicDiaryDTO[];
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const relatedDrafts = useMemo(
    () =>
      comicDiaries
        .filter(draft => draft.sourceDiaryEntryId === diary.id)
        .sort((left, right) =>
          String(right.createdAt || '').localeCompare(
            String(left.createdAt || ''),
          ),
        ),
    [comicDiaries, diary.id],
  );
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<ComicStyle>('slice-of-life');
  const [frameCount, setFrameCount] = useState<FrameCountValue>('4');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  useEffect(() => {
    setPrompt(defaultComicPrompt(diary));
    setStyle('slice-of-life');
    setFrameCount('4');
  }, [diary]);

  const canCreate = prompt.trim().length > 0 && !isCreating;
  const createDraft = async () => {
    if (!canCreate) {
      return;
    }
    setIsCreating(true);
    try {
      await session.createStationComicDiary({
        prompt: prompt.trim(),
        diaryEntryId: diary.id,
        style,
        frameCount: Number(frameCount),
      });
      onActionMessage(
        relatedDrafts.length
          ? textFor(language, '漫画分镜已重新整理', 'Storyboard prepared again')
          : textFor(language, '漫画分镜已整理', 'Storyboard prepared'),
      );
    } catch (error) {
      onActionError(error);
    } finally {
      setIsCreating(false);
    }
  };

  const deleteDraft = (draftId: string) => {
    if (deletingDraftId) {
      return;
    }
    Alert.alert(
      textFor(language, '删除漫画草稿', 'Delete Storyboard'),
      textFor(
        language,
        '删除后这份漫画分镜草稿会从当前日记移除。',
        'This storyboard draft will be removed from this diary.',
      ),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '删除', 'Delete'),
          style: 'destructive',
          onPress: () => {
            setDeletingDraftId(draftId);
            session
              .deleteStationComicDiary(draftId)
              .then(() =>
                onActionMessage(
                  textFor(language, '漫画草稿已删除', 'Storyboard deleted'),
                ),
              )
              .catch(onActionError)
              .finally(() => setDeletingDraftId(null));
          },
        },
      ],
    );
  };

  return (
    <StationContentEditorSection
      title={textFor(language, '漫画日记 Agent', 'Comic Diary Agent')}
      palette={palette}
    >
      <SettingsSegmentRow
        title={textFor(language, '漫画风格', 'Comic Style')}
        palette={palette}
      >
        <SegmentedControl
          fill
          palette={palette}
          value={style}
          options={comicStyleOptions(language)}
          onChange={setStyle}
        />
      </SettingsSegmentRow>

      <SettingsSegmentRow
        title={textFor(language, '分镜数量', 'Frames')}
        palette={palette}
      >
        <SegmentedControl
          fill
          palette={palette}
          value={frameCount}
          options={frameCountOptions(language)}
          onChange={setFrameCount}
        />
      </SettingsSegmentRow>

      <View style={styles.settingsInputWrap}>
        <Text
          style={[
            styles.settingsSegmentTitle,
            { color: palette.secondaryText },
          ]}
        >
          {textFor(language, '生成要求', 'Prompt')}
        </Text>
        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={1200}
          placeholderTextColor={palette.secondaryText}
          style={[
            styles.settingsInput,
            styles.settingsInputMultiline,
            styles.stationComicPromptInput,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
        />
      </View>

      <View style={styles.settingsActionRow}>
        <SettingsActionButton
          title={
            isCreating
              ? textFor(language, '生成中', 'Creating')
              : relatedDrafts.length
              ? textFor(language, '重新生成', 'Regenerate')
              : textFor(language, '生成漫画分镜', 'Create Storyboard')
          }
          palette={palette}
          primary
          disabled={!canCreate}
          onPress={createDraft}
        />
      </View>

      <View style={styles.stationComicDraftStack}>
        {relatedDrafts.length ? (
          relatedDrafts.map(draft => (
            <ComicDraftCard
              key={draft.id}
              draft={draft}
              palette={palette}
              language={language}
              deleting={deletingDraftId === draft.id}
              onDelete={() => deleteDraft(draft.id)}
            />
          ))
        ) : (
          <Text
            style={[styles.relationshipEmpty, { color: palette.secondaryText }]}
          >
            {textFor(
              language,
              '还没有漫画分镜草稿。生成后会保存在当前日记下方。',
              'No storyboard draft yet. New drafts will be saved under this diary.',
            )}
          </Text>
        )}
      </View>
    </StationContentEditorSection>
  );
}

function ComicDraftCard({
  draft,
  palette,
  language,
  deleting,
  onDelete,
}: {
  draft: StationComicDiaryDTO;
  palette: Palette;
  language: Language;
  deleting: boolean;
  onDelete: () => void;
}) {
  return (
    <View
      style={[
        styles.stationComicDraftCard,
        { backgroundColor: palette.soft, borderColor: palette.border },
      ]}
    >
      <View style={styles.stationComicDraftHeader}>
        <View style={styles.stationComicDraftTitleWrap}>
          <Text
            style={[styles.stationComicDraftTitle, { color: palette.text }]}
            numberOfLines={1}
          >
            {draft.title || textFor(language, '漫画日记', 'Comic Diary')}
          </Text>
          <Text
            style={[
              styles.stationComicDraftMeta,
              { color: palette.secondaryText },
            ]}
          >
            {comicStyleLabel(draft.style, language)} · {draft.frames.length}{' '}
            {textFor(language, '格', 'frames')}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={deleting}
          onPress={onDelete}
          style={[
            styles.stationManageSmallButton,
            { backgroundColor: palette.surface },
            deleting && styles.disabledButton,
          ]}
        >
          <Text
            style={[
              styles.stationManageSmallButtonText,
              { color: palette.rose },
            ]}
          >
            {deleting
              ? textFor(language, '删除中', 'Deleting')
              : textFor(language, '删除', 'Delete')}
          </Text>
        </Pressable>
      </View>
      <Text
        style={[
          styles.stationComicDraftSummary,
          { color: palette.secondaryText },
        ]}
        numberOfLines={3}
      >
        {draft.summary || draft.prompt}
      </Text>
      <View style={styles.stationComicFrameGrid}>
        {draft.frames.map((frame, index) => (
          <View
            key={`${draft.id}-frame-${index}`}
            style={[
              styles.stationComicFrameCard,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Text
              style={[styles.stationComicFrameIndex, { color: palette.mint }]}
            >
              {index + 1}
            </Text>
            <Text
              style={[styles.stationComicFrameTitle, { color: palette.text }]}
              numberOfLines={2}
            >
              {frameText(frame.title) || frameText(frame.scene)}
            </Text>
            <Text
              style={[
                styles.stationComicFrameBody,
                { color: palette.secondaryText },
              ]}
              numberOfLines={3}
            >
              {frameText(frame.caption) || frameText(frame.dialogue)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const defaultComicPrompt = (diary: StationDiaryEntryDTO) =>
  `把这篇日记改编成漫画分镜，保留真实情绪和关键场景：${diary.title}。${diary.body}`.slice(
    0,
    1200,
  );

const comicStyleOptions = (language: Language) => [
  { label: textFor(language, '生活', 'Life'), value: 'slice-of-life' as const },
  { label: textFor(language, '可爱', 'Cute'), value: 'cute' as const },
  { label: textFor(language, '漫画', 'Manga'), value: 'manga' as const },
  { label: textFor(language, '分镜', 'Board'), value: 'storyboard' as const },
];

const frameCountOptions = (language: Language) => [
  { label: textFor(language, '2 格', '2'), value: '2' as const },
  { label: textFor(language, '4 格', '4'), value: '4' as const },
  { label: textFor(language, '6 格', '6'), value: '6' as const },
  { label: textFor(language, '8 格', '8'), value: '8' as const },
];

const comicStyleLabel = (style: string, language: Language) => {
  const labels: Record<string, { zh: string; en: string }> = {
    'slice-of-life': { zh: '生活四格', en: 'Slice of life' },
    cute: { zh: '可爱漫画', en: 'Cute' },
    manga: { zh: '黑白漫画', en: 'Manga' },
    storyboard: { zh: '分镜草稿', en: 'Storyboard' },
  };
  const label = labels[style] || labels['slice-of-life'];
  return textFor(language, label.zh, label.en);
};

const frameText = (value: unknown) => (typeof value === 'string' ? value : '');
