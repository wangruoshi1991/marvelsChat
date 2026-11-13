import React, { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ComicRenderFrame, ComicRenderTaskDTO } from '../../models/comicRender';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';

export function ComicFrameGrid({
  token,
  count,
  task,
  palette,
  language,
  onOpen,
  large = false,
}: {
  token: string;
  count: number;
  task?: ComicRenderTaskDTO;
  palette: Palette;
  language: Language;
  onOpen?: (index: number) => void;
  large?: boolean;
}) {
  return (
    <View style={[s.grid, large && s.large]}>
      {Array.from({ length: count }, (_, index) => {
        const frame = task?.frames.find(item => item.frameIndex === index + 1);
        return (
          <Frame
            key={`${token}:${task?.id || 'proposal'}:${index}:${
              frame?.mediaAssetId || ''
            }`}
            index={index + 1}
            frame={frame}
            token={token}
            palette={palette}
            language={language}
            onPress={onOpen ? () => onOpen(index + 1) : undefined}
            large={large}
          />
        );
      })}
    </View>
  );
}
function Frame({
  index,
  frame,
  token,
  palette,
  language,
  onPress,
  large,
}: {
  index: number;
  frame?: ComicRenderFrame;
  token: string;
  palette: Palette;
  language: Language;
  onPress?: () => void;
  large: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const mediaAssetId = frame?.mediaAssetId;
  const status = frame?.status;
  const source = useMemo(
    () =>
      mediaAssetId
        ? {
            uri: buildStationMediaFileUrl(mediaAssetId),
            headers: { Authorization: `Bearer ${token}` },
          }
        : undefined,
    [token, mediaAssetId],
  );
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const label = t(`第${index}格`, `Frame ${index}`);
  const state = !status
    ? t('分镜', 'Storyboard')
    : status === 'queued'
    ? t('排队中', 'Queued')
    : status === 'running'
    ? t('生成中', 'Generating')
    : status === 'failed'
    ? t('生成失败', 'Failed')
    : status === 'unknown'
    ? t('结果未知', 'Unknown result')
    : status === 'skipped'
    ? t('未生成', 'Not generated')
    : t('已完成', 'Completed');
  const readable = status === 'succeeded' && Boolean(mediaAssetId) && !failed;
  const content = (
    <>
      <View
        style={[
          s.square,
          { backgroundColor: palette.soft, borderColor: palette.border },
        ]}
      >
        {readable ? (
          <Image
            accessibilityLabel={t(
              `第 ${index} 格漫画画面`,
              `Comic image for frame ${index}`,
            )}
            accessibilityIgnoresInvertColors
            source={source}
            resizeMode="contain"
            style={s.image}
            onError={() => setFailed(true)}
          />
        ) : (
          <View style={s.placeholder}>
            <Text style={{ color: palette.secondaryText }}>{label}</Text>
            <Text
              style={{
                color:
                  failed || status === 'failed'
                    ? palette.rose
                    : palette.secondaryText,
              }}
            >
              {failed
                ? t(
                    '画面读取失败，请刷新查看。',
                    'Unable to load this image. Refresh to view.',
                  )
                : status === 'succeeded' && !mediaAssetId
                ? t('图片已不可用', 'Image unavailable')
                : state}
            </Text>
          </View>
        )}
        {readable ? (
          <Text
            style={[
              s.badge,
              { color: palette.text, backgroundColor: palette.surface },
            ]}
          >
            {index}
          </Text>
        ) : null}
      </View>
      {large && frame?.errorCode ? (
        <Text style={{ color: palette.secondaryText }}>
          {frameIssueMessage(frame, language)}
        </Text>
      ) : null}
    </>
  );
  const style = [s.frame, large && s.largeFrame];
  const accessibilityLabel = `${label}，${
    failed ? t('图片读取失败', 'Image unavailable') : state
  }`;
  return onPress ? (
    <Pressable
      testID={`comic-frame-${index}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={style}
    >
      {content}
    </Pressable>
  ) : (
    <View
      testID={`comic-frame-${index}`}
      accessibilityLabel={accessibilityLabel}
      style={style}
    >
      {content}
    </View>
  );
}
function frameIssueMessage(frame: ComicRenderFrame, language: Language) {
  const t = (zh: string, en: string) => textFor(language, zh, en);
  if (frame.status === 'unknown')
    return t(
      '请求已发出，结果无法确认，不会自动重试。',
      'The request was sent but its result could not be confirmed. It will not be retried automatically.',
    );
  if (/ACCESS|CONSENT|ENTITLEMENT/.test(frame.errorCode || ''))
    return t(
      '生成权限已变化，请重新确认漫画 Agent 授权。',
      'Generation access has changed. Review the Comic Diary Agent authorization.',
    );
  if (/SOURCE|REVISION/.test(frame.errorCode || ''))
    return t(
      '分镜或来源已变化，请核对后重新生成。',
      'The storyboard or its sources changed. Review them before generating again.',
    );
  if (frame.status === 'skipped')
    return t(
      '这一格未发起生成请求。',
      'No generation request was sent for this frame.',
    );
  return t(
    '这一格未能生成，已完成的画面会保留。',
    'This frame could not be generated. Completed images are retained.',
  );
}
const s = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  large: { gap: 12 },
  frame: { width: '48%', minHeight: 44, minWidth: 44, gap: 6 },
  square: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  largeFrame: { width: '100%' },
  image: { width: '100%', height: '100%' },
  placeholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 6,
    gap: 4,
  },
  badge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    borderRadius: 4,
    paddingHorizontal: 5,
  },
});

export function comicTaskStatus(task: ComicRenderTaskDTO, language: Language) {
  const names = {
    queued: ['排队中', 'Queued'],
    running: ['生成中', 'Generating'],
    succeeded: ['全部完成', 'Completed'],
    partially_succeeded: ['部分完成', 'Partially completed'],
    failed: ['生成失败', 'Failed'],
    cancelled: ['已取消', 'Cancelled'],
    interrupted: ['结果未确认', 'Interrupted'],
  };
  const [zh, en] = names[task.status];
  return `${textFor(language, zh, en)} · ${task.progress.succeeded}/${
    task.progress.total
  }`;
}
