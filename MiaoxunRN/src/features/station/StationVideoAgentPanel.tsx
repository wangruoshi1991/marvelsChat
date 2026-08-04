import React, { useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import {
  AgentReadinessDTO,
  StationContentDTO,
  StationVideoDraftDTO,
} from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationModule } from './StationHomeModules';

const defaultPrompt = '把我的相册和漫画日记整理成一支适合小站展示的短视频脚本';

export function StationVideoAgentPanel({
  palette,
  language,
  readiness,
  stationContent,
  onCreateVideoDraft,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  readiness?: AgentReadinessDTO;
  stationContent: StationContentDTO;
  onCreateVideoDraft: (payload: {
    prompt: string;
    diaryEntryId?: string | null;
    comicDiaryId?: string | null;
    mediaAssetIds?: string[];
    fileAssetIds?: string[];
    format?: 'short-clip';
    aspectRatio?: '9:16';
    durationSeconds?: number;
  }) => Promise<StationVideoDraftDTO>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [isCreating, setIsCreating] = useState(false);
  const latestDrafts = useMemo(
    () =>
      [...(stationContent.videoDrafts || [])]
        .sort((left, right) =>
          String(right.createdAt || '').localeCompare(
            String(left.createdAt || ''),
          ),
        )
        .slice(0, 3),
    [stationContent.videoDrafts],
  );

  const createDraft = async () => {
    const safePrompt = prompt.trim();
    if (!safePrompt || isCreating) {
      return;
    }
    setIsCreating(true);
    try {
      await onCreateVideoDraft({
        prompt: safePrompt,
        diaryEntryId: stationContent.diaryEntries[0]?.id || null,
        comicDiaryId: stationContent.comicDiaries?.[0]?.id || null,
        mediaAssetIds: stationContent.mediaAssets
          .slice(0, 8)
          .map(asset => asset.id),
        fileAssetIds: stationContent.fileAssets
          .slice(0, 3)
          .map(asset => asset.id),
        format: 'short-clip',
        aspectRatio: '9:16',
        durationSeconds: 45,
      });
      onActionMessage(
        textFor(language, '视频草稿已生成', 'Video draft created'),
      );
    } catch (error) {
      onActionError(error);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <StationModule
      palette={palette}
      title={textFor(language, '视频制作 Agent', 'Video Production Agent')}
      action={
        isCreating
          ? textFor(language, '生成中', 'Creating')
          : textFor(language, '生成', 'Create')
      }
      onAction={createDraft}
    >
      <View style={styles.stationAgentLoopStack}>
        <View
          style={[
            styles.stationAgentLoopStatus,
            { backgroundColor: palette.soft, borderColor: palette.border },
          ]}
        >
          <View style={styles.stationAgentLoopStatusCopy}>
            <Text
              style={[
                styles.stationAgentLoopEyebrow,
                { color: palette.secondaryText },
              ]}
            >
              {textFor(language, '视频草稿', 'Video Draft')}
            </Text>
            <Text
              style={[styles.stationAgentLoopTitle, { color: palette.text }]}
            >
              {readiness?.configured
                ? textFor(
                    language,
                    '可生成脚本和镜头表',
                    'Ready to draft scripts and shots',
                  )
                : textFor(
                    language,
                    '可生成草稿，成片渲染稍后开放',
                    'Drafts ready; rendering will open later',
                  )}
            </Text>
          </View>
          <Text
            style={[
              styles.stationAgentLoopBadge,
              { backgroundColor: palette.surface, color: palette.text },
            ]}
          >
            {readiness?.configured
              ? textFor(language, '可生成', 'Ready')
              : textFor(language, '草稿可用', 'Drafts ready')}
          </Text>
        </View>

        <TextInput
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={1200}
          placeholder={textFor(
            language,
            '描述要生成的视频草稿',
            'Describe the video draft',
          )}
          placeholderTextColor={palette.secondaryText}
          style={[
            styles.settingsInput,
            styles.stationAgentLoopInput,
            {
              backgroundColor: palette.input,
              borderColor: palette.border,
              color: palette.text,
            },
          ]}
        />

        {latestDrafts.length ? (
          latestDrafts.map(draft => (
            <View
              key={draft.id}
              style={[
                styles.stationAgentLoopCard,
                {
                  borderColor: palette.border,
                  backgroundColor: palette.surface,
                },
              ]}
            >
              <Text
                style={[styles.stationAgentLoopTitle, { color: palette.text }]}
              >
                {draft.title}
              </Text>
              <Text
                style={[
                  styles.stationAgentLoopMeta,
                  { color: palette.secondaryText },
                ]}
              >
                {formatDuration(language, draft.durationSeconds)} ·{' '}
                {statusText(language, draft.status)}
              </Text>
              <Text
                style={[
                  styles.stationAgentLoopBody,
                  { color: palette.secondaryText },
                ]}
              >
                {draft.summary}
              </Text>
              <VideoScriptPreview
                palette={palette}
                language={language}
                draft={draft}
              />
              <View style={styles.stationAgentLoopChipRow}>
                <Text
                  style={[
                    styles.stationAgentLoopChip,
                    { backgroundColor: palette.soft, color: palette.text },
                  ]}
                >
                  {textFor(language, '镜头', 'Shots')} {draft.shots.length}
                </Text>
                <Text
                  style={[
                    styles.stationAgentLoopChip,
                    { backgroundColor: palette.soft, color: palette.text },
                  ]}
                >
                  {textFor(language, '字幕结构', 'Caption structure')}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text
            style={[styles.relationshipEmpty, { color: palette.secondaryText }]}
          >
            {textFor(
              language,
              '生成后会展示脚本摘要、镜头表和字幕结构。',
              'Created drafts will show script summary, shots, and captions.',
            )}
          </Text>
        )}
      </View>
    </StationModule>
  );
}

function statusText(language: Language, status?: string) {
  if (status === 'draft' || !status) {
    return textFor(language, '草稿', 'Draft');
  }
  if (status === 'rendering') {
    return textFor(language, '生成中', 'Generating');
  }
  if (status === 'ready' || status === 'completed') {
    return textFor(language, '已生成', 'Generated');
  }
  if (status === 'failed') {
    return textFor(language, '生成失败', 'Failed');
  }
  return textFor(language, '草稿', 'Draft');
}

function VideoScriptPreview({
  palette,
  language,
  draft,
}: {
  palette: Palette;
  language: Language;
  draft: StationVideoDraftDTO;
}) {
  const scriptLines = scriptPreviewLines(draft.script);
  const shots = draft.shots.slice(0, 4);
  if (!scriptLines.length && !shots.length) {
    return null;
  }
  return (
    <View style={styles.stationVideoPreviewStack}>
      {scriptLines.length ? (
        <View
          style={[
            styles.stationVideoPreviewBlock,
            { backgroundColor: palette.soft },
          ]}
        >
          <Text
            style={[
              styles.stationAgentLoopEyebrow,
              { color: palette.secondaryText },
            ]}
          >
            {textFor(language, '脚本摘要', 'Script')}
          </Text>
          {scriptLines.map((line, index) => (
            <Text
              key={`video-script-${draft.id}-${index}`}
              style={[styles.stationVideoPreviewLine, { color: palette.text }]}
              numberOfLines={2}
            >
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      {shots.length ? (
        <View style={styles.stationVideoShotGrid}>
          {shots.map((shot, index) => (
            <View
              key={`video-shot-${draft.id}-${index}`}
              style={[
                styles.stationVideoShotCard,
                { backgroundColor: palette.soft, borderColor: palette.border },
              ]}
            >
              <Text
                style={[styles.stationVideoShotIndex, { color: palette.mint }]}
              >
                {index + 1}
              </Text>
              <Text
                style={[styles.stationVideoShotText, { color: palette.text }]}
                numberOfLines={3}
              >
                {shotPreviewText(shot, language)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function scriptPreviewLines(script: Record<string, unknown>) {
  const candidates = [
    script.summary,
    script.opening,
    script.narration,
    script.voiceover,
    script.caption,
  ];
  return candidates
    .filter(
      (item): item is string =>
        typeof item === 'string' && item.trim().length > 0,
    )
    .map(item => item.trim())
    .slice(0, 3);
}

function shotPreviewText(shot: Record<string, unknown>, language: Language) {
  const candidates = [
    shot.title,
    shot.scene,
    shot.visual,
    shot.caption,
    shot.description,
  ];
  const text = candidates.find(
    item => typeof item === 'string' && item.trim().length > 0,
  );
  return typeof text === 'string'
    ? text.trim()
    : textFor(language, '镜头草稿', 'Shot draft');
}

function formatDuration(language: Language, seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return textFor(language, '短视频', 'Short video');
  }
  return textFor(language, `${seconds} 秒`, `${seconds}s`);
}
