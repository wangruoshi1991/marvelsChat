import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Video, { type VideoRef } from 'react-native-video';
import { StationMediaAssetDTO } from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { stationContentApi } from '../../services/api/stationContentApi';
import { MiaoxunApiError } from '../../services/api/http';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Header } from '../../shared/ui';
import { Language } from '../session/useMiaoxunSession';

export function StationMediaPreviewScreen({
  asset,
  token,
  timestampMs,
  palette,
  language,
  onBack,
  onUnavailable,
}: {
  asset: Pick<StationMediaAssetDTO, 'id' | 'kind' | 'status'>;
  token: string;
  timestampMs: number | null;
  palette: Palette;
  language: Language;
  onBack: () => void;
  onUnavailable: (assetId: string) => void;
}) {
  const videoRef = useRef<VideoRef>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    const subscription = AppState.addEventListener('change', state =>
      setActive(state === 'active'),
    );
    return () => {
      alive.current = false;
      subscription.remove();
    };
  }, []);
  const source = {
    uri: buildStationMediaFileUrl(asset.id),
    headers: { Authorization: `Bearer ${token}` },
  };
  const handleError = async () => {
    setLoading(false);
    setFailed(true);
    try {
      await stationContentApi.stationMediaAsset(token, asset.id);
    } catch (error) {
      if (
        alive.current &&
        error instanceof MiaoxunApiError &&
        [404, 409].includes(error.status ?? 0)
      ) {
        onUnavailable(asset.id);
      }
    }
  };
  return (
    <View style={[local.screen, { backgroundColor: palette.background }]}>
      <Header
        palette={palette}
        title={textFor(language, '素材预览', 'Media preview')}
        onBack={onBack}
      />
      <View style={[local.stage, { backgroundColor: palette.soft }]}>
        {failed ? (
          <View style={local.state}>
            <Text style={{ color: palette.text }}>
              {textFor(
                language,
                '素材加载失败，请检查网络后重试',
                'Could not load media. Check your connection and retry.',
              )}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setFailed(false);
                setLoading(true);
                setAttempt(value => value + 1);
              }}
              style={local.retry}
            >
              <Text style={{ color: palette.text }}>
                {textFor(language, '重新加载', 'Reload')}
              </Text>
            </Pressable>
          </View>
        ) : asset.kind === 'video' ? (
          <Video
            key={`${asset.id}-${attempt}`}
            ref={videoRef}
            source={source}
            style={local.media}
            controls
            resizeMode="contain"
            paused={!active}
            playInBackground={false}
            playWhenInactive={false}
            onLoad={({ duration }) => {
              if (timestampMs !== null && timestampMs > 0) {
                videoRef.current?.seek(
                  Math.min(timestampMs / 1000, Math.max(0, duration - 0.1)),
                );
              }
              setLoading(false);
            }}
            onError={handleError}
          />
        ) : (
          <Image
            key={`${asset.id}-${attempt}`}
            source={source}
            resizeMode="contain"
            style={local.media}
            accessibilityLabel={textFor(
              language,
              '检索到的图片',
              'Retrieved image',
            )}
            onLoad={() => setLoading(false)}
            onError={handleError}
          />
        )}
        {loading && !failed ? (
          <ActivityIndicator
            accessibilityLabel={textFor(
              language,
              '正在加载素材',
              'Loading media',
            )}
            style={local.loading}
            color={palette.text}
          />
        ) : null}
      </View>
      {asset.kind === 'video' && timestampMs !== null ? (
        <Text style={[local.caption, { color: palette.secondaryText }]}>
          {textFor(language, '匹配片段', 'Matched moment')} ·{' '}
          {(timestampMs / 1000).toFixed(1)}s
        </Text>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1 },
  stage: { flex: 1, margin: 16, borderRadius: 14, overflow: 'hidden' },
  media: { flex: 1, width: '100%', height: '100%' },
  state: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  retry: { padding: 14, minHeight: 44 },
  loading: { position: 'absolute', alignSelf: 'center', top: '50%' },
  caption: { textAlign: 'center', marginBottom: 16, fontSize: 13 },
});
