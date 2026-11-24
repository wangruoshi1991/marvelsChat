import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
import { Download } from 'lucide-react-native';
import { StationMediaAssetDTO } from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { stationContentApi } from '../../services/api/stationContentApi';
import { MiaoxunApiError } from '../../services/api/http';
import { saveComicImageToLibrary } from '../../services/comicMediaLibrary';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Header } from '../../shared/ui';
import { Language } from '../session/useMiaoxunSession';

import { useVoiceCallActivity } from '../voiceCalls/useVoiceCallActivity';
import { voiceCallConflictCopy } from '../../services/voiceCall/voiceCallResources';

export function StationMediaPreviewScreen({
  asset,
  token,
  timestampMs,
  palette,
  language,
  onBack,
  onUnavailable,
  onActionMessage,
}: {
  asset: Pick<StationMediaAssetDTO, 'id' | 'kind' | 'status'>;
  token: string;
  timestampMs: number | null;
  palette: Palette;
  language: Language;
  onBack: () => void;
  onUnavailable: (assetId: string) => void;
  onActionMessage?: (message: string) => void;
}) {
  const callActive = useVoiceCallActivity();
  const videoBlocked = asset.kind === 'video' && callActive;
  const videoRef = useRef<VideoRef>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [saveState, setSaveState] = useState<
    'idle' | 'saving' | 'success' | 'error'
  >('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const saveRequest = useRef<symbol | null>(null);
  useLayoutEffect(() => {
    setSaveState('idle');
    setSaveMessage('');
    return () => {
      saveRequest.current = null;
    };
  }, [asset.id, token]);
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
  const handleSave = async () => {
    if (asset.kind !== 'image' || saveRequest.current) return;
    const request = Symbol();
    saveRequest.current = request;
    setSaveState('saving');
    setSaveMessage(textFor(language, '正在保存…', 'Saving…'));
    try {
      await saveComicImageToLibrary({ mediaAssetId: asset.id, token });
      if (saveRequest.current !== request) return;
      const message = textFor(
        language,
        '图片已保存到系统相册。',
        'Image saved to your photo library.',
      );
      setSaveState('success');
      setSaveMessage(message);
      onActionMessage?.(message);
    } catch (error) {
      if (saveRequest.current !== request) return;
      const message =
        error instanceof Error
          ? error.message
          : textFor(
              language,
              '保存图片失败，请重试。',
              'Unable to save the image. Try again.',
            );
      setSaveState('error');
      setSaveMessage(message);
      onActionMessage?.(message);
    } finally {
      if (saveRequest.current === request) saveRequest.current = null;
    }
  };
  return (
    <View style={[local.screen, { backgroundColor: palette.background }]}>
      <Header
        palette={palette}
        title={textFor(language, '素材预览', 'Media preview')}
        onBack={onBack}
      />
      {asset.kind === 'image' ? (
        <View style={[local.actions, { borderBottomColor: palette.border }]}>
          <Pressable
            testID="station-media-save"
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '保存图片', 'Save image')}
            disabled={saveState === 'saving'}
            onPress={() => {
              handleSave().catch(() => undefined);
            }}
            style={local.saveButton}
          >
            {saveState === 'saving' ? (
              <ActivityIndicator color={palette.mint} />
            ) : (
              <Download color={palette.text} size={22} />
            )}
            <Text style={{ color: palette.text }}>
              {textFor(language, '保存图片', 'Save image')}
            </Text>
          </Pressable>
        </View>
      ) : null}
      {saveMessage ? (
        <Text
          testID="station-media-save-status"
          accessibilityLiveRegion="polite"
          style={[
            local.saveStatus,
            {
              color:
                saveState === 'error' ? palette.rose : palette.secondaryText,
            },
          ]}
        >
          {saveMessage}
        </Text>
      ) : null}
      <View style={[local.stage, { backgroundColor: palette.soft }]}>
        {videoBlocked ? (
          <View style={local.state}>
            <Text
              accessibilityLiveRegion="polite"
              style={{ color: palette.text }}
            >
              {textFor(language, ...voiceCallConflictCopy.playback)}
            </Text>
          </View>
        ) : failed ? (
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
        {loading && !failed && !videoBlocked ? (
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
  actions: {
    minHeight: 52,
    paddingHorizontal: 16,
    alignItems: 'flex-end',
    justifyContent: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  saveButton: {
    minHeight: 44,
    paddingHorizontal: 12,
    gap: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveStatus: { paddingHorizontal: 16, paddingTop: 8, textAlign: 'right' },
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
