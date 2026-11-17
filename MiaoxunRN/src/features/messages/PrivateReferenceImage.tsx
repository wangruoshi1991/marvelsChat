import React, { useEffect, useMemo, useState } from 'react';
import {
  Image,
  ImageStyle,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
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
  onPress,
}: {
  token: string;
  mediaAssetId: string;
  label: string;
  style: StyleProp<ImageStyle>;
  palette: Palette;
  language: Language;
  onPress?: () => void;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [token, mediaAssetId]);
  const source = useMemo(
    () => ({
      uri: buildStationMediaFileUrl(mediaAssetId),
      headers: { Authorization: `Bearer ${token}` },
    }),
    [token, mediaAssetId],
  );
  const content = failed ? (
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
      accessible={!onPress}
      accessibilityIgnoresInvertColors
      source={source}
      style={style}
      onError={() => setFailed(true)}
    />
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={style as StyleProp<ViewStyle>}
    >
      {content}
    </Pressable>
  ) : (
    content
  );
}
const s = StyleSheet.create({
  failure: { alignItems: 'center', justifyContent: 'center', padding: 4 },
});
