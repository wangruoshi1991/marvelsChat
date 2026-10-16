import React from 'react';
import { Text, View } from 'react-native';

import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { resolveStationColors } from './stationTheme';

export function StationPageHeading({
  title,
  detail,
  palette,
}: {
  title: string;
  detail: string;
  palette: Palette;
}) {
  const colors = resolveStationColors(palette);
  return (
    <View style={styles.stationPageHeading}>
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
