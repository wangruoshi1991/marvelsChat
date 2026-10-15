import React, { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Play } from 'lucide-react-native';
import { StationMediaAssetDTO } from '../../models/api';
import { WorkspaceArtifact } from '../../models/agentWorkspace';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceButton, workspaceTokens } from '../../shared/workspaceUi';
import { Language } from '../session/sessionTypes';

type MediaSelection = Extract<WorkspaceArtifact, { kind: 'media_selection' }>;
type Props = {
  artifact: MediaSelection;
  token: string;
  workspaceId: string;
  revision: number;
  foreground: boolean;
  disabled: boolean;
  palette: Palette;
  language: Language;
  onOpen: (artifact: MediaSelection, index: number) => void;
};

export function WorkspaceMediaResult(props: Props) {
  return (
    <View style={s.results}>
      {props.artifact.assets.map((asset, index) => (
        <MediaResult
          key={`${props.token}:${props.workspaceId}:${props.revision}:${asset.id}:${asset.version}`}
          {...props}
          asset={asset}
          index={index}
        />
      ))}
    </View>
  );
}

function MediaResult({
  asset: selected,
  artifact,
  index,
  token,
  workspaceId,
  foreground,
  disabled,
  palette,
  language,
  onOpen,
}: Props & { asset: MediaSelection['assets'][number]; index: number }) {
  const [asset, setAsset] = useState<StationMediaAssetDTO | null>(null);
  const [error, setError] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setAsset(null);
    setError('');
    setImageFailed(false);
    if (!foreground) return;
    let active = true;
    agentWorkspaceApi.media(token, workspaceId, selected.id).then(
      value => {
        if (active) setAsset(value);
      },
      issue => {
        if (active)
          setError(
            issue instanceof Error
              ? issue.message
              : textFor(language, '素材读取失败。', 'Could not read media.'),
          );
      },
    );
    return () => {
      active = false;
    };
  }, [foreground, token, workspaceId, selected.id, language, attempt]);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  if (!foreground) return null;
  if (error)
    return (
      <View style={s.error}>
        <Text accessibilityLiveRegion="polite" style={{ color: palette.rose }}>
          {error}
        </Text>
        <WorkspaceButton
          palette={palette}
          variant="ghost"
          label={t('重新读取素材', 'Reload media')}
          disabled={disabled}
          onPress={() => setAttempt(value => value + 1)}
        />
      </View>
    );
  if (!asset)
    return (
      <Text style={{ color: palette.secondaryText }}>
        {t('正在读取素材…', 'Loading media…')}
      </Text>
    );
  const seconds = Math.floor((selected.matchedFrameTimestampMs || 0) / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(
    2,
    '0',
  )}`;
  const label =
    asset.caption ||
    asset.originalFilename ||
    t(
      `${asset.kind === 'video' ? '视频' : '图片'} ${index + 1}`,
      `${asset.kind} ${index + 1}`,
    );
  return (
    <Pressable
      testID={`workspace-media-${asset.id}`}
      accessibilityRole="button"
      accessibilityLabel={t(
        `打开${asset.kind === 'video' ? '视频' : '图片'}：${label}`,
        `Open ${asset.kind}: ${label}`,
      )}
      disabled={disabled}
      onPress={() => onOpen(artifact, index)}
      style={[
        s.row,
        { borderBottomColor: palette.border },
        disabled && s.disabled,
      ]}
    >
      {asset.kind === 'image' && !imageFailed ? (
        <Image
          key={attempt}
          accessibilityIgnoresInvertColors
          source={{
            uri: buildStationMediaFileUrl(asset.id),
            headers: { Authorization: `Bearer ${token}` },
          }}
          style={[s.thumbnail, { backgroundColor: palette.soft }]}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <View style={[s.thumbnail, s.video, { backgroundColor: palette.soft }]}>
          {asset.kind === 'video' ? (
            <Play size={26} color={palette.text} />
          ) : null}
          <Text style={[s.caption, { color: palette.secondaryText }]}>
            {asset.kind === 'video'
              ? t('视频', 'Video')
              : t('预览加载失败', 'Preview failed')}
          </Text>
        </View>
      )}
      <View style={s.description}>
        <Text
          numberOfLines={3}
          style={[workspaceTokens.typography.body, { color: palette.text }]}
        >
          {label}
        </Text>
        {asset.kind === 'video' && selected.matchedFrameTimestampMs !== null ? (
          <Text style={[s.caption, { color: palette.secondaryText }]}>
            {t(`从 ${time} 查看匹配画面`, `View match at ${time}`)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  results: { gap: 10 },
  error: { gap: 8 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  thumbnail: { width: 92, height: 92 },
  video: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  description: { flex: 1, minWidth: 0, padding: 12, gap: 6 },
  caption: { ...workspaceTokens.typography.caption, textAlign: 'left' },
  disabled: { opacity: 0.5 },
});
