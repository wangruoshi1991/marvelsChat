import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { mediaRetrievalApi } from '../../services/api/mediaRetrievalApi';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import type { Language } from '../session/sessionTypes';

export function AlbumAssistantStatus({
  token,
  palette,
  language,
  onAuthorize,
  onError,
}: {
  token: string;
  palette: Palette;
  language: Language;
  onAuthorize: () => Promise<unknown>;
  onError: (message: string) => void;
}) {
  const [state, setState] = useState('loading');
  const [unavailableAssets, setUnavailableAssets] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refreshVersion, setRefreshVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      mediaRetrievalApi
        .status(token)
        .then(status => {
          if (active) {
            const { indexedAssets, skippedAssets, totalAssets } =
              status.backfill;
            const pendingAssets = totalAssets - indexedAssets - skippedAssets;
            setUnavailableAssets(skippedAssets);
            setState(
              !status.enabled
                ? 'consent'
                : !status.availability.canStartRun
                ? 'unavailable'
                : totalAssets === 0
                ? 'no-media'
                : pendingAssets > 0
                ? indexedAssets === 0
                  ? 'index-pending'
                  : 'indexing'
                : skippedAssets > 0
                ? indexedAssets === 0
                  ? 'index-unavailable'
                  : 'index-partial'
                : 'ready',
            );
          }
        })
        .catch(() => {
          if (active) setState('unavailable');
        });
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token, refreshVersion]);
  return (
    <View style={[local.container, { backgroundColor: palette.soft }]}>
      <Text style={{ color: palette.secondaryText }}>
        {textFor(
          language,
          state === 'consent'
            ? '首次使用请授权相册 AI，之后直接在对话里找素材。'
            : state === 'unavailable'
            ? '相册检索服务暂不可用，请稍后重试。'
            : state === 'no-media'
            ? '上传图片或视频后，可以直接告诉我想找什么。'
            : state === 'indexing'
            ? '素材正在建立索引；可以先查找已完成的素材。'
            : state === 'index-pending'
            ? '还没有完成索引的素材，请等待处理完成后再查找。'
            : state === 'index-unavailable'
            ? '素材处理失败、受阻或尚未开始，目前没有可检索素材，也没有排队任务。'
            : state === 'index-partial'
            ? '部分素材暂不可检索；可以查找已完成索引的素材。'
            : state === 'loading'
            ? '正在读取相册 AI 状态…'
            : '直接描述要找的图片或视频，也可以继续补充条件。',
          state === 'consent'
            ? 'Allow Album AI once to find media in this conversation.'
            : state === 'unavailable'
            ? 'Album search is temporarily unavailable.'
            : state === 'no-media'
            ? 'Upload images or videos, then describe what you need.'
            : state === 'indexing'
            ? 'Indexing media. You can search completed items.'
            : state === 'index-pending'
            ? 'No media is indexed yet. Wait for processing to complete.'
            : state === 'index-unavailable'
            ? 'Media processing failed, was blocked, or has not started. No media is searchable and no tasks are pending.'
            : state === 'index-partial'
            ? 'Some media is unavailable for search. You can search completed items.'
            : state === 'loading'
            ? 'Loading Album AI status…'
            : 'Describe an image or video, then refine your request in the conversation.',
        )}
      </Text>
      {unavailableAssets > 0 &&
      [
        'index-pending',
        'indexing',
        'index-unavailable',
        'index-partial',
      ].includes(state) ? (
        <Text style={{ color: palette.secondaryText }}>
          {textFor(
            language,
            `${unavailableAssets} 个素材需要检查处理状态，不会自动重试。`,
            `${unavailableAssets} items need their processing status checked and will not retry automatically.`,
          )}
        </Text>
      ) : null}
      {state === 'consent' ? (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            try {
              await onAuthorize();
              setState('loading');
              setRefreshVersion(value => value + 1);
            } catch (error) {
              onError(
                error instanceof Error ? error.message : '相册 AI 授权失败',
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <Text style={[local.action, { color: palette.text }]}>
            {textFor(
              language,
              busy ? '处理中…' : '使用相册 AI',
              busy ? 'Working…' : 'Use Album AI',
            )}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  container: { padding: 12 },
  action: { paddingVertical: 10 },
});
