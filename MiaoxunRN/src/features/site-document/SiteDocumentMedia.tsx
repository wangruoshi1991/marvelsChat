import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Play } from 'lucide-react-native';
import { StationMediaAssetDTO } from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceState, workspaceTokens } from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';

export function SiteDocumentMedia({
  asset,
  token,
  palette,
  language,
  onOpen,
  onReadinessChange,
}: {
  asset: Pick<StationMediaAssetDTO, 'id' | 'kind'> &
    Partial<Pick<StationMediaAssetDTO, 'caption' | 'originalFilename'>>;
  token: string;
  palette: Palette;
  language: Language;
  onOpen: () => void;
  onReadinessChange?: (ready: boolean) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const request = useRef(0);
  const failedRequest = useRef(false);
  useEffect(
    () => () => {
      request.current += 1;
    },
    [],
  );
  const title =
    asset.caption ||
    asset.originalFilename ||
    textFor(language, '素材', 'Media');
  return (
    <View style={s.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={textFor(language, `查看${title}`, `View ${title}`)}
        onPress={onOpen}
        style={[s.preview, { backgroundColor: palette.soft }]}
      >
        {asset.kind === 'video' ? (
          <View style={s.video}>
            <Play size={28} color={palette.text} />
            <Text style={[s.body, { color: palette.text }]}>
              {textFor(language, '播放视频', 'Play video')}
            </Text>
          </View>
        ) : !failed ? (
          <>
            <Image
              key={attempt}
              source={{
                uri: buildStationMediaFileUrl(asset.id),
                headers: { Authorization: `Bearer ${token}` },
                ...(attempt ? { cache: 'reload' as const } : {}),
              }}
              resizeMode="contain"
              style={s.image}
              accessibilityLabel={title}
              onLoad={() => {
                if (request.current !== attempt || failedRequest.current)
                  return;
                setLoading(false);
                onReadinessChange?.(true);
              }}
              onError={() => {
                if (request.current !== attempt) return;
                failedRequest.current = true;
                setLoading(false);
                setFailed(true);
                onReadinessChange?.(false);
              }}
            />
            {loading ? (
              <ActivityIndicator
                color={palette.text}
                accessibilityLabel={textFor(
                  language,
                  '正在加载图片',
                  'Loading image',
                )}
                style={s.loading}
              />
            ) : null}
          </>
        ) : (
          <Text style={[s.body, { color: palette.secondaryText }]}>
            {textFor(language, '图片暂不可见', 'Image unavailable')}
          </Text>
        )}
      </Pressable>
      {failed ? (
        <WorkspaceState
          palette={palette}
          tone="error"
          title={textFor(language, '图片加载失败', 'Unable to load this image')}
          retryLabel={textFor(language, '重新加载图片', 'Reload image')}
          onRetry={() => {
            request.current += 1;
            failedRequest.current = false;
            setAttempt(value => value + 1);
            setLoading(true);
            setFailed(false);
            onReadinessChange?.(false);
          }}
        />
      ) : null}
      <Text selectable style={[s.body, { color: palette.text }]}>
        {title}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: workspaceTokens.space.sm },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    minHeight: workspaceTokens.minTouch,
    borderRadius: workspaceTokens.radius.control,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  loading: { position: 'absolute', alignSelf: 'center' },
  video: { alignItems: 'center', gap: workspaceTokens.space.sm },
  body: workspaceTokens.typography.body,
});
