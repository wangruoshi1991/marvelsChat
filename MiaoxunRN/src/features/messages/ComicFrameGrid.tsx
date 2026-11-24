import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AccessibilityInfo,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react-native';
import { ComicRenderFrame, ComicRenderTaskDTO } from '../../models/comicRender';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { useReduceMotion } from '../../shared/useReduceMotion';
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
            count={count}
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
  count,
}: {
  index: number;
  frame?: ComicRenderFrame;
  token: string;
  palette: Palette;
  language: Language;
  onPress?: () => void;
  large: boolean;
  count: number;
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
  const style = [
    s.frame,
    large && s.largeFrame,
    count === 1 && s.singleFrame,
    count === 3 && index === 1 && s.featureFrame,
  ];
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

export function ComicImageViewer({
  visible,
  token,
  count,
  task,
  initialIndex,
  palette,
  language,
  onClose,
  onSave,
}: {
  visible: boolean;
  token: string;
  count: number;
  task?: ComicRenderTaskDTO;
  initialIndex: number;
  palette: Palette;
  language: Language;
  onClose: () => void;
  onSave?: (frameIndex: number, mediaAssetId: string) => Promise<void> | void;
}) {
  const reduceMotion = useReduceMotion();
  const listRef = useRef<FlatList<ComicRenderFrame>>(null);
  const [viewport, setViewport] = useState<{ width: number; height: number }>();
  const [activeIndex, setActiveIndex] = useState(
    Math.max(0, Math.min(initialIndex - 1, count - 1)),
  );
  const [saving, setSaving] = useState(false);
  const saveRequest = useRef<symbol | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const frames = useMemo(
    () =>
      Array.from({ length: count }, (_, index) =>
        task?.frames.find(item => item.frameIndex === index + 1),
      ).map(
        (frame, index) =>
          frame || {
            frameIndex: index + 1,
            status: 'queued' as const,
            mediaAssetId: null,
            errorCode: null,
          },
      ),
    [count, task],
  );
  const t = (zh: string, en: string) => textFor(language, zh, en);

  useEffect(() => {
    if (!visible) return;
    const next = Math.max(0, Math.min(initialIndex - 1, count - 1));
    setActiveIndex(next);
    setSaveMessage('');
    requestAnimationFrame(() => {
      listRef.current?.scrollToIndex({ index: next, animated: false });
    });
  }, [count, initialIndex, visible]);

  const current = frames[activeIndex];
  const currentAsset =
    current?.status === 'succeeded' ? current.mediaAssetId : null;
  useLayoutEffect(() => {
    setSaving(false);
    setSaveMessage('');
    return () => {
      saveRequest.current = null;
    };
  }, [current?.frameIndex, currentAsset, task?.id, token, visible]);
  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType={reduceMotion ? 'none' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <SafeAreaProvider>
        <SafeAreaView
          edges={['top', 'bottom']}
          testID="comic-image-viewer"
          style={[s.viewer, { backgroundColor: palette.background }]}
        >
          <View style={s.viewerHeader}>
            <Pressable
              testID="comic-image-viewer-close"
              accessibilityRole="button"
              accessibilityLabel={t('关闭图片查看器', 'Close image viewer')}
              onPress={onClose}
              style={s.viewerIcon}
            >
              <X size={22} color={palette.text} />
            </Pressable>
            <Text style={[s.viewerTitle, { color: palette.text }]}>
              {activeIndex + 1}/{count}
            </Text>
            {currentAsset && onSave ? (
              <Pressable
                testID="comic-image-viewer-save"
                accessibilityRole="button"
                accessibilityLabel={t('保存图片', 'Save image')}
                disabled={saving}
                onPress={async () => {
                  if (saveRequest.current) return;
                  const request = Symbol();
                  saveRequest.current = request;
                  setSaving(true);
                  setSaveMessage(t('正在保存到相册…', 'Saving to Photos…'));
                  let message: string;
                  try {
                    await onSave(current.frameIndex, currentAsset);
                    message = t('已保存到相册', 'Saved to Photos');
                  } catch (error) {
                    message =
                      error instanceof Error
                        ? error.message
                        : t('保存失败，请重试。', 'Save failed. Try again.');
                  }
                  if (saveRequest.current !== request) return;
                  saveRequest.current = null;
                  setSaving(false);
                  setSaveMessage(message);
                  if (Platform.OS === 'ios') {
                    AccessibilityInfo.announceForAccessibility(message);
                  }
                }}
                style={s.viewerIcon}
              >
                <Download
                  size={21}
                  color={saving ? palette.secondaryText : palette.text}
                />
              </Pressable>
            ) : currentAsset ? (
              <Text
                testID="comic-image-viewer-save-unavailable"
                style={[s.viewerUnavailable, { color: palette.secondaryText }]}
              >
                {t('保存暂未开放', 'Save unavailable')}
              </Text>
            ) : (
              <View style={s.viewerIcon} />
            )}
          </View>
          {saveMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[s.viewerSaveMessage, { color: palette.secondaryText }]}
            >
              {saveMessage}
            </Text>
          ) : null}
          <View
            testID="comic-image-viewer-viewport"
            style={s.viewerViewport}
            onLayout={event => {
              const { width, height } = event.nativeEvent.layout;
              setViewport(previous =>
                previous?.width === width && previous.height === height
                  ? previous
                  : { width, height },
              );
            }}
          >
            {viewport &&
            viewport.width > 0 &&
            viewport.height > 0 &&
            count > 0 ? (
              <FlatList
                key={viewport.width}
                ref={listRef}
                data={frames}
                initialScrollIndex={Math.min(activeIndex, count - 1)}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={item => String(item.frameIndex)}
                getItemLayout={(_, index) => ({
                  length: viewport.width,
                  offset: viewport.width * index,
                  index,
                })}
                onScrollToIndexFailed={info => {
                  setTimeout(
                    () =>
                      listRef.current?.scrollToIndex({
                        index: info.index,
                        animated: false,
                      }),
                    0,
                  );
                }}
                onMomentumScrollEnd={event => {
                  const next = Math.max(
                    0,
                    Math.min(
                      count - 1,
                      Math.round(
                        event.nativeEvent.contentOffset.x / viewport.width,
                      ),
                    ),
                  );
                  if (next !== activeIndex) setActiveIndex(next);
                }}
                renderItem={({ item }) => {
                  const source = item.mediaAssetId
                    ? {
                        uri: buildStationMediaFileUrl(item.mediaAssetId),
                        headers: { Authorization: `Bearer ${token}` },
                      }
                    : undefined;
                  const readable =
                    item.status === 'succeeded' && Boolean(source);
                  return (
                    <View style={[s.viewerPage, viewport]}>
                      {readable ? (
                        <Image
                          accessibilityLabel={t(
                            `第 ${item.frameIndex} 格漫画画面`,
                            `Comic image for frame ${item.frameIndex}`,
                          )}
                          accessibilityIgnoresInvertColors
                          source={source}
                          resizeMode="contain"
                          style={s.viewerImage}
                        />
                      ) : (
                        <View
                          style={[
                            s.viewerPlaceholder,
                            {
                              backgroundColor: palette.soft,
                              borderColor: palette.border,
                            },
                          ]}
                        >
                          <Text style={{ color: palette.secondaryText }}>
                            {item.status === 'failed'
                              ? t('这一格生成失败', 'This frame failed')
                              : item.status === 'unknown'
                              ? t('结果暂时无法确认', 'Result is unknown')
                              : t('这一格尚未完成', 'This frame is not ready')}
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                }}
              />
            ) : null}
          </View>
          <View style={s.viewerFooter}>
            <Pressable
              testID="comic-image-viewer-previous"
              accessibilityRole="button"
              accessibilityLabel={t('上一格', 'Previous frame')}
              disabled={activeIndex <= 0}
              onPress={() => {
                const next = Math.max(0, activeIndex - 1);
                setActiveIndex(next);
                listRef.current?.scrollToIndex({ index: next, animated: true });
              }}
              style={s.viewerIcon}
            >
              <ChevronLeft
                size={22}
                color={activeIndex <= 0 ? palette.border : palette.text}
              />
            </Pressable>
            <Text style={[s.viewerHint, { color: palette.secondaryText }]}>
              {t('左右滑动查看画面', 'Swipe to browse frames')}
            </Text>
            <Pressable
              testID="comic-image-viewer-next"
              accessibilityRole="button"
              accessibilityLabel={t('下一格', 'Next frame')}
              disabled={activeIndex >= count - 1}
              onPress={() => {
                const next = Math.min(count - 1, activeIndex + 1);
                setActiveIndex(next);
                listRef.current?.scrollToIndex({ index: next, animated: true });
              }}
              style={s.viewerIcon}
            >
              <ChevronRight
                size={22}
                color={activeIndex >= count - 1 ? palette.border : palette.text}
              />
            </Pressable>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
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
  large: { gap: 10 },
  frame: { width: '48%', minHeight: 44, minWidth: 44, gap: 6 },
  square: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: 'hidden',
  },
  largeFrame: { width: '48%' },
  singleFrame: { width: '100%' },
  featureFrame: { width: '100%' },
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
  viewer: { flex: 1 },
  viewerHeader: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerTitle: { fontSize: 16, fontWeight: '700' },
  viewerIcon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerViewport: { flex: 1 },
  viewerImage: { width: '100%', height: '100%' },
  viewerPage: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  viewerPlaceholder: {
    minWidth: 220,
    minHeight: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  viewerFooter: {
    minHeight: 58,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  viewerHint: { fontSize: 12, flexShrink: 1, textAlign: 'center' },
  viewerSaveMessage: {
    position: 'absolute',
    top: 58,
    left: 24,
    right: 24,
    textAlign: 'center',
  },
  viewerUnavailable: { fontSize: 11, maxWidth: 90, textAlign: 'right' },
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
