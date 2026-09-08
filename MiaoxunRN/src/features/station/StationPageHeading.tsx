import React from 'react';
import { Text, View } from 'react-native';

import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { resolveStationColors } from './stationTheme';

export function StationPageHeading({
  title,
  detail,
  watermark,
  palette,
}: {
  title: string;
  detail: string;
  watermark: string;
  palette: Palette;
}) {
  const colors = resolveStationColors(palette);
  return (
    <View style={styles.stationPageHeading}>
      <Text
        pointerEvents="none"
        style={[styles.stationPageWatermark, { color: colors.border }]}
      >
        {watermark}
      </Text>
      <View style={styles.stationPageTitleRow}>
        <Text style={[styles.stationPageTitle, { color: colors.text }]}>
          {title}
        </Text>
        <Text
          style={[
            styles.stationPageDetail,
            {
              backgroundColor: colors.text,
              color: colors.background,
            },
          ]}
        >
          {detail}
        </Text>
      </View>
    </View>
  );
}
