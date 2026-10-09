import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { Play, ImageOff } from 'lucide-react-native';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { textFor } from '../../shared/i18n';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { resolveStationColors } from '../station/stationTheme';
import { matchReasonLabels } from './matchReasonLabels';
import { MediaRetrievalSearchResult } from './mediaRetrievalTypes';
import { retrievalStyles as styles } from './mediaRetrievalStyles';

export function RetrievalResultCard({
  result,
  token,
  palette,
  language,
  disabled,
  onPress,
}: {
  result: MediaRetrievalSearchResult;
  token: string;
  palette: Palette;
  language: Language;
  disabled: boolean;
  onPress: () => void;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const c = resolveStationColors(palette);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  const seconds = Math.floor((result.matchedFrameTimestampMs || 0) / 1000);
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(
    2,
    '0',
  )}`;
  const labels = [
    ...new Set(
      result.matchReasons
        .map(reason => matchReasonLabels[reason])
        .filter(Boolean),
    ),
  ];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t(
        `打开${result.kind === 'video' ? '视频' : '图片'}：${result.summary}`,
        `Open ${result.kind}: ${result.summary}`,
      )}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.result,
        { borderColor: c.border, backgroundColor: c.surface },
        disabled && styles.disabled,
      ]}
    >
      {result.kind === 'image' && !imageFailed ? (
        <Image
          accessibilityIgnoresInvertColors
          source={{
            uri: buildStationMediaFileUrl(result.mediaAssetId),
            headers: { Authorization: `Bearer ${token}` },
          }}
          onError={() => setImageFailed(true)}
          style={[styles.thumbnail, { backgroundColor: c.soft }]}
        />
      ) : (
        <View style={[styles.video, { backgroundColor: c.soft }]}>
          {result.kind === 'video' ? (
            <Play size={24} color={c.accent} />
          ) : (
            <ImageOff size={24} color={c.secondaryText} />
          )}
          <Text style={[styles.caption, { color: c.secondaryText }]}>
            {result.kind === 'video'
              ? time
              : t('预览未加载', 'Preview unavailable')}
          </Text>
        </View>
      )}
      <View style={[styles.flex, styles.column]}>
        <Text numberOfLines={3} style={[styles.resultText, { color: c.text }]}>
          {result.summary || t('查看素材', 'View media')}
        </Text>
        <View style={styles.wrap}>
          {language === 'zh'
            ? labels.map(label => (
                <Text
                  key={label}
                  style={[
                    styles.caption,
                    styles.tag,
                    { color: c.accent, backgroundColor: c.soft },
                  ]}
                >
                  {label}
                </Text>
              ))
            : null}
        </View>
        {result.kind === 'video' && result.matchedFrameTimestampMs !== null ? (
          <Text style={[styles.caption, { color: c.secondaryText }]}>
            {t(`从 ${time} 查看匹配画面`, `View match at ${time}`)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
