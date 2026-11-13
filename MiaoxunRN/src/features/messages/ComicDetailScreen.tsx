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
import { Language } from '../session/sessionTypes';
import { useComicRenderTasks } from '../station/useComicRenderTasks';
import { ComicFrameGrid, comicTaskStatus } from './ComicFrameGrid';
import { Action } from './ContentPreviewMessageCard';

export function ComicDetailScreen({
  token,
  comicId,
  preview,
  palette,
  language,
  onBack,
  onPublish,
}: {
  token: string;
  comicId?: string;
  preview?: ContentPreview;
  palette: Palette;
  language: Language;
  onBack: () => void;
  onPublish: (draft: ComicPublishDraft) => void;
}) {
  const [detail, setDetail] = useState<ComicDetail>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
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
      <View style={s.header}>
        <Action label={t('返回', 'Back')} palette={palette} onPress={onBack} />
        <Text
          accessibilityRole="header"
          style={[s.title, { color: palette.text }]}
        >
          {title}
        </Text>
      </View>
      {foreground ? (
        <ScrollView
          contentContainerStyle={s.body}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <>
              <Text accessibilityRole="alert" style={{ color: palette.rose }}>
                {error}
              </Text>
              <Action
                label={t('重新读取', 'Reload')}
                palette={palette}
                onPress={refresh}
              />
            </>
          ) : comicId && !comic ? (
            <Text style={{ color: palette.secondaryText }}>
              {t('正在读取作品', 'Loading comic')}
            </Text>
          ) : null}
          {preview?.kind === 'diary' ? (
            <Text style={{ color: palette.text }}>{preview.snapshot.body}</Text>
          ) : (
            <>
              <Text style={{ color: palette.secondaryText }}>
                {comic?.summary ||
                  (preview?.kind === 'comic' ? preview.snapshot.summary : '')}
              </Text>
              {task ? (
                <Text
                  accessibilityLiveRegion="polite"
                  style={{ color: palette.text }}
                >
                  {comicTaskStatus(task, language)}
                </Text>
              ) : null}
              {task?.error ? (
                <Text style={{ color: palette.rose }}>
                  {task.error.message}
                </Text>
              ) : null}
              {frames.length ? (
                <ComicFrameGrid
                  key={attempt}
                  token={token}
                  count={frames.length}
                  task={task}
                  palette={palette}
                  language={language}
                  large
                />
              ) : null}
              {frames.map((frame, index) => (
                <View key={index} style={s.story}>
                  <Text style={[s.title, { color: palette.text }]}>
                    {index + 1}. {String(frame.title || '')}
                  </Text>
                  {(
                    ['scene', 'caption', 'dialogue', 'mood', 'camera'] as const
                  ).map(key =>
                    frame[key] ? (
                      <Text key={key} style={{ color: palette.secondaryText }}>
                        {
                          (
                            {
                              scene: t('场景', 'Scene'),
                              caption: t('旁白', 'Caption'),
                              dialogue: t('对白', 'Dialogue'),
                              mood: t('情绪', 'Mood'),
                              camera: t('镜头', 'Camera'),
                            } as Record<string, string>
                          )[key]
                        }
                        ：{String(frame[key])}
                      </Text>
                    ) : null,
                  )}
                </View>
              ))}
              {render.error ? (
                <Text style={{ color: palette.rose }}>{render.error}</Text>
              ) : null}
              {comicId ? (
                <Action
                  label={t('刷新查看', 'Refresh')}
                  palette={palette}
                  disabled={render.busy}
                  onPress={refresh}
                />
              ) : null}
              {task?.status === 'queued' &&
              task.allowedActions.includes('cancel') ? (
                <Action
                  label={t('取消排队', 'Cancel queued task')}
                  palette={palette}
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
                          issue instanceof Error ? issue.message : '取消失败。',
                        );
                    });
                  }}
                />
              ) : null}
              {mediaAssetIds.length ? (
                <>
                  <Text style={{ color: palette.secondaryText }}>
                    {t(
                      `将带入${mediaAssetIds.length}张已完成画面；下一步编辑可见性和文案后再发布。`,
                      `${mediaAssetIds.length} completed images. Review text and visibility before posting.`,
                    )}
                  </Text>
                  <Action
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
                </>
              ) : null}
            </>
          )}
          {preview?.sources.length ? (
            <Text style={{ color: palette.secondaryText }}>
              {t('本次来源', 'Sources')}：
              {preview.sources.map(source => source.title).join('、')}
            </Text>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 },
  title: { fontSize: 16, fontWeight: '600', flexShrink: 1 },
  body: { padding: 16, gap: 14 },
  story: { gap: 6 },
});
