import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ContentPreview } from '../../models/chatContentPreview';
import { ComicRenderTaskDTO } from '../../models/comicRender';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import {
  ComicFrameGrid,
  ComicImageViewer,
  comicTaskStatus,
} from './ComicFrameGrid';
import { PrivateReferenceImage } from './PrivateReferenceImage';

export function ContentPreviewMessageCard({
  preview,
  task,
  token,
  palette,
  language,
  busy,
  error,
  loading,
  imageRevision,
  onConfirm,
  onReject,
  onRefresh,
  onOpen,
  onOpenSource,
  onSelectContext,
  onSaveImage,
}: {
  preview?: ContentPreview;
  task?: ComicRenderTaskDTO;
  token: string;
  palette: Palette;
  language: Language;
  busy: boolean;
  error?: string;
  loading?: boolean;
  imageRevision?: number;
  onConfirm: () => void;
  onReject: () => void;
  onRefresh: () => void;
  onOpen: () => void;
  onOpenSource?: (mediaAssetId: string) => void;
  onSelectContext: () => void;
  onSaveImage?: (
    frameIndex: number,
    mediaAssetId: string,
  ) => Promise<void> | void;
}) {
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const [viewerFrame, setViewerFrame] = useState<number | null>(null);
  const statuses = {
    pending: t('待确认', 'Awaiting confirmation'),
    confirmed: t('已确认', 'Confirmed'),
    rejected: t('已取消', 'Rejected'),
    expired: t('已过期，请在聊天中重新整理', 'Expired. Revise in chat.'),
    superseded: t('已有新提案，本提案已失效', 'Replaced by a newer proposal'),
    revoked: t('来源或授权已变化', 'Sources or access changed'),
  };
  const taskCanRefresh =
    task &&
    (task.status === 'queued' ||
      task.status === 'running' ||
      task.status === 'failed' ||
      task.status === 'interrupted');
  const refreshLabel =
    task && (task.status === 'queued' || task.status === 'running')
      ? t('刷新任务状态', 'Refresh task status')
      : t('刷新查看', 'Refresh');
  return (
    <View style={s.offset}>
      <View
        testID="content-preview-card"
        style={[
          s.card,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        {preview ? (
          <>
            <Pressable
              testID="content-preview-context-select"
              accessibilityRole="button"
              accessibilityLabel={t(
                `引用《${preview.snapshot.title}》到当前聊天`,
                `Use ${preview.snapshot.title} in this chat`,
              )}
              onPress={onSelectContext}
              style={s.header}
            >
              <Text style={[s.title, { color: palette.text }]}>
                {preview.snapshot.title}
              </Text>
              <Text
                accessibilityLiveRegion="polite"
                style={{ color: palette.secondaryText }}
              >
                {task
                  ? comicTaskStatus(task, language)
                  : statuses[preview.status]}
              </Text>
            </Pressable>
            {preview.kind === 'comic' ? (
              <>
                <Text
                  style={{ color: palette.secondaryText }}
                  numberOfLines={3}
                >
                  {preview.snapshot.summary}
                </Text>
                <Text style={{ color: palette.secondaryText }}>
                  {preview.snapshot.frameCount}
                  {t('格', ' frames')} ·{' '}
                  {
                    (
                      {
                        'slice-of-life': t('生活漫画', 'Life'),
                        cute: t('可爱漫画', 'Cute'),
                        manga: t('黑白漫画', 'Manga'),
                        storyboard: t('分镜', 'Storyboard'),
                      } as Record<string, string>
                    )[preview.snapshot.style]
                  }
                </Text>
                <ComicFrameGrid
                  key={imageRevision || 0}
                  token={token}
                  count={preview.snapshot.frameCount}
                  task={task}
                  palette={palette}
                  language={language}
                  onOpen={index => setViewerFrame(index)}
                />
              </>
            ) : (
              <Text style={{ color: palette.text }} numberOfLines={4}>
                {preview.snapshot.body}
              </Text>
            )}
            {preview.sources.length ? (
              <View style={s.sources}>
                <Text style={{ color: palette.secondaryText }}>
                  {t('已选素材', 'Selected sources')} · {preview.sources.length}
                </Text>
                {preview.sources.map(source => (
                  <View key={`${source.type}:${source.id}`} style={s.source}>
                    {source.mediaAssetId ? (
                      <PrivateReferenceImage
                        key={`${token}:${source.mediaAssetId}:${
                          imageRevision || 0
                        }`}
                        token={token}
                        mediaAssetId={source.mediaAssetId}
                        label={source.title || t('参考图片', 'Reference image')}
                        palette={palette}
                        language={language}
                        style={s.thumbnail}
                        onPress={
                          onOpenSource
                            ? () => onOpenSource(source.mediaAssetId!)
                            : undefined
                        }
                      />
                    ) : null}
                    <Text
                      style={[s.sourceText, { color: palette.secondaryText }]}
                      numberOfLines={2}
                    >
                      {source.title}
                    </Text>
                  </View>
                ))}
              </View>
            ) : preview.status === 'pending' ? (
              <Text style={{ color: palette.secondaryText }}>
                {t('素材：本次故事文字', 'Source: this story')}
              </Text>
            ) : null}
            {preview.status === 'pending' &&
            preview.allowedActions.includes('confirm') ? (
              <>
                <Text style={{ color: palette.secondaryText }}>
                  {preview.kind === 'comic'
                    ? t(
                        `将生成${preview.snapshot.frameCount}张画面，使用以上素材。费用按供应商实际计费，不自动重试。`,
                        `Generate ${preview.snapshot.frameCount} images using these sources. Provider charges apply; no automatic retry.`,
                      )
                    : t(
                        '仅保存这份日记，不生成漫画。',
                        'Save this diary without generating comic images.',
                      )}
                </Text>
                <Action
                  testID="content-preview-confirm"
                  label={
                    busy
                      ? t('正在确认', 'Confirming')
                      : preview.kind === 'comic'
                      ? t('生成漫画', 'Generate comic')
                      : t('保存日记', 'Save diary')
                  }
                  palette={palette}
                  disabled={busy || Boolean(error)}
                  onPress={onConfirm}
                  primary
                />
              </>
            ) : null}
            <View style={s.actions}>
              <Action
                label={t('查看详情', 'View details')}
                palette={palette}
                onPress={onOpen}
              />
              {preview.allowedActions.includes('reject') ? (
                <Action
                  label={t('取消提案', 'Reject proposal')}
                  palette={palette}
                  disabled={busy}
                  onPress={onReject}
                />
              ) : null}
            </View>
            {task?.error ? (
              <Text style={{ color: palette.rose }}>{task.error.message}</Text>
            ) : null}
          </>
        ) : (
          <Text style={{ color: palette.secondaryText }}>
            {loading
              ? t('正在读取创作预览', 'Loading creative preview')
              : t('创作预览暂不可用', 'Preview unavailable')}
          </Text>
        )}
        {error ? (
          <Text accessibilityRole="alert" style={{ color: palette.rose }}>
            {error}
          </Text>
        ) : null}
        {error || !preview || taskCanRefresh ? (
          <Action
            label={refreshLabel}
            palette={palette}
            disabled={busy || loading}
            onPress={onRefresh}
          />
        ) : null}
        {preview?.kind === 'comic' ? (
          <ComicImageViewer
            visible={viewerFrame !== null}
            token={token}
            count={preview.snapshot.frameCount}
            task={task}
            initialIndex={viewerFrame || 1}
            palette={palette}
            language={language}
            onClose={() => setViewerFrame(null)}
            onSave={onSaveImage}
          />
        ) : null}
      </View>
    </View>
  );
}
export function Action({
  label,
  palette,
  onPress,
  disabled = false,
  primary = false,
  testID,
}: {
  label: string;
  palette: Palette;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        if (!disabled) onPress();
      }}
      style={[
        s.button,
        { backgroundColor: primary ? palette.mint : palette.soft },
        disabled && s.disabled,
      ]}
    >
      <Text
        style={[
          s.buttonText,
          { color: primary ? palette.background : palette.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}
const s = StyleSheet.create({
  offset: { alignSelf: 'stretch', marginLeft: 42 },
  sourceText: { flexShrink: 1 },
  disabled: { opacity: 0.5 },
  buttonText: { fontWeight: '600' },
  card: {
    alignSelf: 'flex-start',
    width: '100%',
    maxWidth: 360,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 12,
    gap: 10,
    marginTop: 8,
  },
  header: { gap: 4 },
  title: { fontSize: 16, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  button: {
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
  },
  sources: { gap: 6 },
  source: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  thumbnail: { width: 44, height: 44, borderRadius: 6 },
});
