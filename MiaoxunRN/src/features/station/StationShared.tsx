import React from 'react';
import { Text, View } from 'react-native';

import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { resolveStationColors } from './stationTheme';

export function StationCard({
  title,
  detail,
  palette,
  children,
}: {
  title: string;
  detail: string;
  palette: Palette;
  children: React.ReactNode;
}) {
  const colors = resolveStationColors(palette);

  return (
    <View
      style={[
        styles.stationCard,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          shadowColor: palette.shadow,
        },
      ]}
    >
      <View style={styles.stationCardHeader}>
        <Text
          style={[styles.stationCardTitle, { color: colors.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <Text
          style={[styles.stationCardDetail, { color: colors.secondaryText }]}
          numberOfLines={1}
        >
          {detail}
        </Text>
      </View>
      {children}
    </View>
  );
}
