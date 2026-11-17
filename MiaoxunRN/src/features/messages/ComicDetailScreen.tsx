import React, { useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  ComicDetail,
  ComicPublishDraft,
  ContentPreview,
} from '../../models/chatContentPreview';
import { chatContentApi } from '../../services/api/chatContentApi';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Header } from '../../shared/ui';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceState,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';
import { useComicRenderTasks } from '../station/useComicRenderTasks';
import {
  ComicFrameGrid,
  ComicImageViewer,
  comicTaskStatus,
} from './ComicFrameGrid';

export function ComicDetailScreen({
  token,
  comicId,
  preview,
  palette,
  language,
  onBack,
  onPublish,
  onSave,
}: {
  token: string;
  comicId?: string;
  preview?: ContentPreview;
  palette: Palette;
  language: Language;
  onBack: () => void;
  onPublish: (draft: ComicPublishDraft) => void;
  onSave?: (frameIndex: number, mediaAssetId: string) => Promise<void> | void;
}) {
  const [detail, setDetail] = useState<ComicDetail>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [showStoryboard, setShowStoryboard] = useState(false);
  const [largeFrames, setLargeFrames] = useState(true);
  const [viewerFrame, setViewerFrame] = useState<number | null>(null);
  const lifecycle = useRef(0);
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => {
      lifecycle.current += 1;
      setForeground(next === 'active');
      setDetail(undefined);
      if (next === 'active') setAttempt(value => value + 1);
    });
    return () => subscription.remove();
  }, []);
  const scope = `${token}:${comicId || preview?.id || ''}`;
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    setShowStoryboard(false);
    setLargeFrames(true);
    setViewerFrame(null);
  }, [scope]);
  const render = useComicRenderTasks(comicId ? token : '', comicId || '');
  useEffect(() => {
    let active = true;
    const epoch = lifecycle.current;
    setDetail(undefined);
    setError('');
    if (comicId && foreground)
      chatContentApi.comic(token, comicId).then(
        value => {
          if (
            active &&
            scopeRef.current === scope &&
            lifecycle.current === epoch
          )
            setDetail(value);
        },
        issue => {
          if (
            active &&
            scopeRef.current === scope &&
            lifecycle.current === epoch
          )
            setError(issue instanceof Error ? issue.message : '作品读取失败。');
        },
      );
    return () => {
      active = false;
    };
  }, [comicId, token, scope, attempt, foreground]);
  const refresh = () => {
    if (!foreground) return;
    setAttempt(value => value + 1);
    render.refresh();
  };
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const comic = detail?.comicDiary;
  const snapshot = preview?.snapshot;
  const isDiary = preview?.kind === 'diary';
  const title = comic?.title || snapshot?.title || t('漫画作品', 'Comic');
  const tasks = render.error
    ? []
    : render.loaded
    ? render.tasks
    : detail?.tasks || [];
  const exactTaskId =
    preview?.kind === 'comic' ? preview.result?.comicRenderTaskId : undefined;
  const task = exactTaskId
    ? tasks.find(item => item.id === exactTaskId)
    : tasks[0];
  const frames =
    comic?.frames || (preview?.kind === 'comic' ? preview.snapshot.frames : []);
  const mediaAssetIds =
    task?.frames
      .filter(frame => frame.status === 'succeeded' && frame.mediaAssetId)
      .sort((a, b) => a.frameIndex - b.frameIndex)
      .map(frame => frame.mediaAssetId!) || [];
  return (
    <View style={[s.screen, { backgroundColor: palette.background }]}>
      <Header
        palette={palette}
        title={
          isDiary
            ? t('日记详情', 'Diary details')
            : t('漫画详情', 'Comic details')
        }
        backAccessibilityLabel={t('返回', 'Back')}
        onBack={onBack}
      />
      {foreground ? (
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <WorkspacePanel palette={palette}>
              <WorkspaceState
                palette={palette}
                title={t('作品暂时无法读取', 'Unable to load this work')}
                description={error}
                tone="error"
                onRetry={refresh}
                retryLabel={t('重新读取', 'Reload')}
              />
            </WorkspacePanel>
          ) : comicId && !comic ? (
            <WorkspaceState
              palette={palette}
              title={t('正在读取作品', 'Loading comic')}
              busy
            />
          ) : null}
          {comic || preview ? (
            <WorkspacePanel palette={palette}>
              <Text
                accessibilityRole="header"
                style={[s.heading, { color: palette.text }]}
              >
                {title}
              </Text>
              {!isDiary ? (
                <Text style={[s.caption, { color: palette.secondaryText }]}>
                  {frames.length}
                  {t('格漫画', ' frames')}
                  {comic?.createdAt
                    ? ` · ${new Date(comic.createdAt).toLocaleDateString()}`
                    : ''}
                </Text>
              ) : null}
              {comic?.summary ||
              (preview?.kind === 'comic' && preview.snapshot.summary) ? (
                <Text style={[s.bodyText, { color: palette.secondaryText }]}>
                  {comic?.summary ||
                    (preview?.kind === 'comic' ? preview.snapshot.summary : '')}
                </Text>
              ) : null}
            </WorkspacePanel>
          ) : null}
          {preview?.kind === 'diary' ? (
            <WorkspacePanel palette={palette}>
              <Text selectable style={[s.bodyText, { color: palette.text }]}>
                {preview.snapshot.body}
              </Text>
            </WorkspacePanel>
          ) : (
            <>
              {frames.length ? (
                <WorkspacePanel palette={palette}>
                  <View style={s.sectionHeader}>
                    <Text
                      accessibilityRole="header"
                      style={[s.title, { color: palette.text }]}
                    >
                      {t('漫画画面', 'Comic images')}
                    </Text>
                    <WorkspaceButton
                      palette={palette}
                      label={
                        largeFrames
                          ? t('紧凑网格', 'Compact grid')
                          : t('放大网格', 'Large grid')
                      }
                      variant="ghost"
                      onPress={() => setLargeFrames(value => !value)}
                    />
                  </View>
                  {task ? (
                    <Text
                      accessibilityLiveRegion="polite"
                      style={[s.caption, { color: palette.secondaryText }]}
                    >
                      {comicTaskStatus(task, language)}
                    </Text>
                  ) : null}
                  {task?.error ? (
                    <Text
                      accessibilityRole="alert"
                      style={[s.bodyText, { color: palette.rose }]}
                    >
                      {task.error.message}
                    </Text>
                  ) : null}
                  <ComicFrameGrid
                    key={attempt}
                    token={token}
                    count={frames.length}
                    task={task}
                    palette={palette}
                    language={language}
                    large={largeFrames}
                    onOpen={index => setViewerFrame(index)}
                  />
                  {render.error ? (
                    <Text
                      accessibilityRole="alert"
                      style={[s.bodyText, { color: palette.rose }]}
                    >
                      {render.error}
                    </Text>
                  ) : null}
                  <View style={s.actions}>
                    {comicId ? (
                      <WorkspaceButton
                        label={t('刷新查看', 'Refresh')}
                        palette={palette}
                        variant="secondary"
                        busy={render.busy}
                        onPress={refresh}
                      />
                    ) : null}
                    {task?.status === 'queued' &&
                    task.allowedActions.includes('cancel') ? (
                      <WorkspaceButton
                        label={t('取消排队', 'Cancel queued task')}
                        palette={palette}
                        variant="ghost"
                        disabled={render.busy}
                        onPress={() => {
                          const captured = scope;
                          const epoch = lifecycle.current;
                          render.cancel(task).catch(issue => {
                            if (
                              scopeRef.current === captured &&
                              lifecycle.current === epoch
                            )
                              setError(
                                issue instanceof Error
                                  ? issue.message
                                  : '取消失败。',
                              );
                          });
                        }}
                      />
                    ) : null}
                  </View>
                </WorkspacePanel>
              ) : null}
              {frames.length ? (
                <WorkspacePanel palette={palette}>
                  <WorkspaceButton
                    label={
                      showStoryboard
                        ? t('收起分镜文字', 'Hide storyboard')
                        : t('查看分镜文字', 'View storyboard')
                    }
                    palette={palette}
                    variant="ghost"
                    accessibilityState={{ expanded: showStoryboard }}
                    onPress={() => setShowStoryboard(value => !value)}
                    style={s.storyToggle}
                  />
                  {showStoryboard
                    ? frames.map((frame, index) => (
                        <View
                          key={index}
                          style={[s.story, { borderTopColor: palette.border }]}
                        >
                          <Text style={[s.title, { color: palette.text }]}>
                            {index + 1}. {String(frame.title || '')}
                          </Text>
                          {(
                            [
                              'scene',
                              'caption',
                              'dialogue',
                              'mood',
                              'camera',
                            ] as const
                          ).map(key =>
                            frame[key] ? (
                              <Text
                                key={key}
                                selectable
                                style={[
                                  s.bodyText,
                                  { color: palette.secondaryText },
                                ]}
                              >
                                {
                                  {
                                    scene: t('场景', 'Scene'),
                                    caption: t('旁白', 'Caption'),
                                    dialogue: t('对白', 'Dialogue'),
                                    mood: t('情绪', 'Mood'),
                                    camera: t('镜头', 'Camera'),
                                  }[key]
                                }
                                ：{String(frame[key])}
                              </Text>
                            ) : null,
                          )}
                        </View>
                      ))
                    : null}
                </WorkspacePanel>
              ) : null}
              {mediaAssetIds.length ? (
                <WorkspacePanel palette={palette}>
                  <Text
                    accessibilityRole="header"
                    style={[s.title, { color: palette.text }]}
                  >
                    {t('分享作品', 'Share your comic')}
                  </Text>
                  <Text style={[s.caption, { color: palette.secondaryText }]}>
                    {t(
                      `将带入${mediaAssetIds.length}张已完成画面；下一步编辑可见性和文案后再发布。`,
                      `${mediaAssetIds.length} completed images. Review text and visibility before posting.`,
                    )}
                  </Text>
                  <WorkspaceButton
                    label={t(
                      `发布动态（${mediaAssetIds.length}张）`,
                      `Create post (${mediaAssetIds.length})`,
                    )}
                    palette={palette}
                    onPress={() => {
                      if (foreground && scopeRef.current === scope)
                        onPublish({
                          body:
                            comic?.summary ||
                            (preview?.kind === 'comic'
                              ? preview.snapshot.summary
                              : ''),
                          mediaAssetIds,
                        });
                    }}
                  />
                </WorkspacePanel>
              ) : null}
            </>
          )}
          {preview?.sources.length ? (
            <Text style={[s.caption, { color: palette.secondaryText }]}>
              {t('本次来源', 'Sources')}：
              {preview.sources.map(source => source.title).join('、')}
            </Text>
          ) : null}
        </ScrollView>
      ) : null}
      {frames.length ? (
        <ComicImageViewer
          visible={viewerFrame !== null}
          token={token}
          count={frames.length}
          task={task}
          initialIndex={viewerFrame || 1}
          palette={palette}
          language={language}
          onClose={() => setViewerFrame(null)}
          onSave={onSave}
        />
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  heading: workspaceTokens.typography.heading,
  title: { ...workspaceTokens.typography.title, flexShrink: 1 },
  caption: workspaceTokens.typography.caption,
  bodyText: workspaceTokens.typography.body,
  body: { padding: workspaceTokens.space.lg, gap: workspaceTokens.space.md },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: workspaceTokens.space.sm,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: workspaceTokens.space.sm,
  },
  storyToggle: { justifyContent: 'flex-start' },
  story: {
    gap: workspaceTokens.space.sm,
    paddingTop: workspaceTokens.space.md,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
