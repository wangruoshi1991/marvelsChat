import React, { useMemo, useRef, useState } from 'react';
import { Alert, Image, StyleSheet, Text, View } from 'react-native';
import { StationComicDiaryDTO } from '../../models/api';
import {
  ComicRenderFrame,
  ComicRenderTaskDTO,
  isActiveComicRender,
} from '../../models/comicRender';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
import { textFor } from '../../shared/i18n';
import { SettingsActionButton } from '../../shared/settingsUi';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { useComicRenderTasks } from './useComicRenderTasks';

export function StationComicRenderPanel({
  draft,
  token,
  palette,
  language,
  onActionMessage,
  onActionError,
}: {
  draft: StationComicDiaryDTO;
  token: string;
  palette: Palette;
  language: Language;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const render = useComicRenderTasks(token, draft.id);
  const attempt = useRef<string | null>(null);
  const confirmationOpen = useRef(false);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const hasActiveTask = render.tasks.some(isActiveComicRender);
  const canGenerate =
    render.supported &&
    render.foreground &&
    render.loaded &&
    !render.error &&
    !render.busy &&
    !hasActiveTask;
  const confirmRender = () => {
    if (!canGenerate || !render.isCurrent() || confirmationOpen.current) return;
    confirmationOpen.current = true;
    const frameCount = draft.frames.length;
    const stillCurrent = render.captureCurrent();
    let confirmed = false;
    Alert.alert(
      t('生成漫画画面', 'Generate comic images'),
      t(
        `将为这份已保存分镜的 ${frameCount} 格生成画面。确认后创建图片生成任务。`,
        `Generate images for all ${frameCount} frames of this saved storyboard. Confirm to create a render task.`,
      ),
      [
        {
          text: t('取消', 'Cancel'),
          style: 'cancel',
          onPress: () => {
            confirmationOpen.current = false;
          },
        },
        {
          text: t('确认生成', 'Generate'),
          onPress: async () => {
            confirmationOpen.current = false;
            if (confirmed || !stillCurrent()) return;
            confirmed = true;
            const key = attempt.current || createIdempotencyKey();
            attempt.current = key;
            try {
              const task = await render.create(key);
              if (task && render.isCurrent()) {
                attempt.current = null;
                onActionMessage(
                  t('漫画画面任务已提交', 'Comic render task submitted'),
                );
              }
            } catch (issue) {
              if (render.isCurrent()) onActionError(issue);
            }
          },
        },
      ],
      {
        onDismiss: () => {
          confirmationOpen.current = false;
        },
      },
    );
  };

  return (
    <View style={s.stack}>
      <SettingsActionButton
        title={
          render.busy
            ? t('正在提交', 'Submitting')
            : t('生成漫画画面', 'Generate comic images')
        }
        palette={palette}
        disabled={!canGenerate}
        onPress={confirmRender}
      />
      {!render.supported ? (
        <Text style={{ color: palette.secondaryText }}>
          {t(
            '当前服务器尚未支持漫画画面任务，请在服务更新后重试。',
            'The server does not support comic rendering yet. Try again after the service is updated.',
          )}
        </Text>
      ) : !render.foreground ? null : !render.loaded ? (
        <Text style={{ color: palette.secondaryText }}>
          {t('正在读取漫画画面任务…', 'Loading comic render tasks…')}
        </Text>
      ) : null}
      {render.error ? (
        <View style={s.stack}>
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: palette.rose }}
          >
            {render.error}
          </Text>
        </View>
      ) : null}
      {render.supported && render.foreground && render.loaded ? (
        <SettingsActionButton
          title={t('刷新画面任务', 'Refresh render tasks')}
          palette={palette}
          disabled={render.busy}
          onPress={render.refresh}
        />
      ) : null}
      {render.tasks.map(task => (
        <ComicRenderTask
          key={task.id}
          task={task}
          token={token}
          palette={palette}
          language={language}
          busy={render.busy}
          onCancel={async () => {
            try {
              await render.cancel(task);
            } catch (issue) {
              if (render.isCurrent()) onActionError(issue);
            }
          }}
        />
      ))}
    </View>
  );
}

function ComicRenderTask({
  task,
  token,
  palette,
  language,
  busy,
  onCancel,
}: {
  task: ComicRenderTaskDTO;
  token: string;
  palette: Palette;
  language: Language;
  busy: boolean;
  onCancel: () => void;
}) {
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const states: Record<ComicRenderTaskDTO['status'], string> = {
    queued: t('排队中', 'Queued'),
    running: t('生成中', 'Generating'),
    succeeded: t('全部完成', 'Completed'),
    partially_succeeded: t('部分完成', 'Partially completed'),
    failed: t('生成失败', 'Failed'),
    cancelled: t('已取消', 'Cancelled'),
    interrupted: t('已中断', 'Interrupted'),
  };
  return (
    <View style={[s.task, { borderColor: palette.border }]}>
      <Text
        accessibilityLiveRegion="polite"
        style={[s.title, { color: palette.text }]}
      >
        {states[task.status]} · {task.progress.succeeded}/{task.progress.total}{' '}
        {t('格已保存', 'frames saved')}
      </Text>
      {task.error ? (
        <Text style={{ color: palette.rose }}>{task.error.message}</Text>
      ) : null}
      {task.status === 'interrupted' || task.progress.unknown > 0 ? (
        <Text style={{ color: palette.secondaryText }}>
          {t(
            '结果未知的请求不会自动重试；已完成画面仍可查看。',
            'Requests with an unknown result are never retried automatically. Saved images remain available.',
          )}
        </Text>
      ) : null}
      {task.status === 'running' ? (
        <Text style={{ color: palette.secondaryText }}>
          {t(
            '任务已经开始，无法取消。',
            'This task has started and cannot be cancelled.',
          )}
        </Text>
      ) : null}
      {task.status === 'queued' && task.allowedActions.includes('cancel') ? (
        <SettingsActionButton
          title={t('取消排队', 'Cancel queued task')}
          palette={palette}
          disabled={busy}
          onPress={onCancel}
        />
      ) : null}
      {task.frames.map(frame => (
        <ComicRenderFrameView
          key={frame.frameIndex}
          frame={frame}
          taskId={task.id}
          token={token}
          palette={palette}
          language={language}
        />
      ))}
    </View>
  );
}

function ComicRenderFrameView({
  frame,
  taskId,
  token,
  palette,
  language,
}: {
  frame: ComicRenderFrame;
  taskId: string;
  token: string;
  palette: Palette;
  language: Language;
}) {
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const states: Record<ComicRenderFrame['status'], string> = {
    queued: t('排队中', 'Queued'),
    running: t('生成中', 'Generating'),
    succeeded: t('已完成', 'Completed'),
    failed: t('生成失败', 'Failed'),
    unknown: t('结果未知', 'Result unknown'),
    skipped: t('未生成', 'Not generated'),
  };
  return (
    <View style={s.stack}>
      <Text style={{ color: palette.text }}>
        {t(`第 ${frame.frameIndex} 格`, `Frame ${frame.frameIndex}`)} ·{' '}
        {states[frame.status]}
      </Text>
      {frame.status === 'succeeded' && frame.mediaAssetId ? (
        <ComicFrameImage
          key={`${token}:${taskId}:${frame.frameIndex}:${frame.mediaAssetId}`}
          token={token}
          mediaAssetId={frame.mediaAssetId}
          frameIndex={frame.frameIndex}
          palette={palette}
          language={language}
        />
      ) : frame.status === 'succeeded' ? (
        <Text style={{ color: palette.secondaryText }}>
          {t(
            '画面已删除或不可读取。',
            'This image was deleted or is no longer available.',
          )}
        </Text>
      ) : null}
      {frame.errorCode ? (
        <Text style={{ color: palette.secondaryText }}>
          {frameIssueMessage(frame, language)}
        </Text>
      ) : null}
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

function ComicFrameImage({
  token,
  mediaAssetId,
  frameIndex,
  palette,
  language,
}: {
  token: string;
  mediaAssetId: string;
  frameIndex: number;
  palette: Palette;
  language: Language;
}) {
  const [failed, setFailed] = useState(false);
  const source = useMemo(
    () => ({
      uri: buildStationMediaFileUrl(mediaAssetId),
      headers: { Authorization: `Bearer ${token}` },
    }),
    [token, mediaAssetId],
  );
  return failed ? (
    <Text style={{ color: palette.rose }}>
      {textFor(
        language,
        '画面读取失败，请刷新画面任务。',
        'Unable to load this image. Refresh render tasks.',
      )}
    </Text>
  ) : (
    <Image
      accessibilityLabel={textFor(
        language,
        `第 ${frameIndex} 格漫画画面`,
        `Comic image for frame ${frameIndex}`,
      )}
      accessibilityIgnoresInvertColors
      source={source}
      resizeMode="contain"
      style={s.image}
      onError={() => setFailed(true)}
    />
  );
}

const s = StyleSheet.create({
  stack: { gap: 10 },
  task: { gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  title: { fontSize: 15, fontWeight: '600' },
  image: { width: '100%', aspectRatio: 1, borderRadius: 12 },
});
