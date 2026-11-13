import React, { useMemo, useState } from 'react';
import {
  Image,
  ImageStyle,
  StyleProp,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';

export function PrivateReferenceImage({
  token,
  mediaAssetId,
  label,
  style,
  palette,
  language,
}: {
  token: string;
  mediaAssetId: string;
  label: string;
  style: StyleProp<ImageStyle>;
  palette: Palette;
  language: Language;
}) {
  const [failed, setFailed] = useState(false);
  const source = useMemo(
    () => ({
      uri: buildStationMediaFileUrl(mediaAssetId),
      headers: { Authorization: `Bearer ${token}` },
    }),
    [token, mediaAssetId],
  );
  return failed ? (
    <View
      accessibilityLabel={`${label}，${textFor(
        language,
        '图片读取失败',
        'Image unavailable',
      )}`}
      style={[style, s.failure, { backgroundColor: palette.soft }]}
    >
      <Text style={{ color: palette.rose }}>
        {textFor(language, '图片读取失败', 'Image unavailable')}
      </Text>
    </View>
  ) : (
    <Image
      accessibilityLabel={label}
      accessibilityIgnoresInvertColors
      source={source}
      style={style}
      onError={() => setFailed(true)}
    />
  );
}
const s = StyleSheet.create({
  failure: { alignItems: 'center', justifyContent: 'center', padding: 4 },
});
