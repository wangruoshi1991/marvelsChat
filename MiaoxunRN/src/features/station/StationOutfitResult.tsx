import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AvatarConfigDTO, StationMediaAssetDTO } from '../../models/api';
import { stationContentApi } from '../../services/api/stationContentApi';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceState } from '../../shared/workspaceUi';
import { MiaoShowAvatar } from '../avatar/AvatarViews';
import { normalizeAvatarConfig } from '../avatar/avatarConfig';
import { Language } from '../session/sessionTypes';
import { SiteDocumentMedia } from '../site-document/SiteDocumentMedia';
import { StationMediaPreviewScreen } from './StationMediaPreviewScreen';

export function StationOutfitResult({
  avatarConfig,
  mediaAssetId,
  token,
  palette,
  language,
}: {
  avatarConfig: AvatarConfigDTO;
  mediaAssetId: string | null;
  token: string;
  palette: Palette;
  language: Language;
}) {
  const { width } = useWindowDimensions();
  return (
    <View style={s.content}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={textFor(
          language,
          '保存的穿搭形象',
          'Saved outfit avatar',
        )}
        style={[s.avatar, { backgroundColor: palette.soft }]}
      >
        <MiaoShowAvatar
          config={normalizeAvatarConfig(avatarConfig)}
          size={Math.max(120, Math.min(320, width - 40))}
        />
      </View>
      {mediaAssetId ? (
        <OutfitMedia
          key={`${token}:${mediaAssetId}`}
          assetId={mediaAssetId}
          token={token}
          palette={palette}
          language={language}
        />
      ) : null}
    </View>
  );
}

function OutfitMedia({
  assetId,
  token,
  palette,
  language,
}: {
  assetId: string;
  token: string;
  palette: Palette;
  language: Language;
}) {
  const [asset, setAsset] = useState<Pick<
    StationMediaAssetDTO,
    'id' | 'kind' | 'status'
  > | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState(false);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  useEffect(() => {
    let current = true;
    setAsset(null);
    setError('');
    stationContentApi.stationMediaAsset(token, assetId).then(
      media => {
        if (!current) return;
        if (
          !media ||
          media.id !== assetId ||
          media.status !== 'uploaded' ||
          !['image', 'video'].includes(media.kind)
        ) {
          setError(
            textFor(
              language,
              '关联素材已不可用',
              'Linked media is unavailable',
            ),
          );
          return;
        }
        setAsset(media);
      },
      () => {
        if (current)
          setError(
            textFor(
              language,
              '无法读取关联素材，请重试。',
              'Unable to load linked media. Try again.',
            ),
          );
      },
    );
    return () => {
      current = false;
    };
  }, [assetId, token, attempt, language]);
  return (
    <View style={s.content}>
      {asset ? (
        <SiteDocumentMedia
          asset={asset}
          token={token}
          palette={palette}
          language={language}
          onOpen={() => setOpened(true)}
        />
      ) : (
        <WorkspaceState
          palette={palette}
          busy={!error}
          tone={error ? 'error' : undefined}
          title={error || t('正在读取关联素材…', 'Loading linked media…')}
          onRetry={error ? () => setAttempt(value => value + 1) : undefined}
          retryLabel={t('重新读取素材', 'Reload media')}
        />
      )}
      {opened && asset ? (
        <Modal
          visible
          animationType="slide"
          onRequestClose={() => setOpened(false)}
        >
          <SafeAreaView
            style={[s.screen, { backgroundColor: palette.background }]}
          >
            <StationMediaPreviewScreen
              asset={asset}
              token={token}
              timestampMs={null}
              palette={palette}
              language={language}
              onBack={() => setOpened(false)}
              onUnavailable={() => {
                setOpened(false);
                setAsset(null);
                setError(t('关联素材已不可用', 'Linked media is unavailable'));
              }}
            />
          </SafeAreaView>
        </Modal>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  content: { gap: 16 },
  avatar: { alignItems: 'center', borderRadius: 12 },
});
