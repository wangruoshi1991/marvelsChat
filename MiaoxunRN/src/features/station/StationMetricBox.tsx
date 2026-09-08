import React from 'react';
import { Text, View } from 'react-native';

import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { resolveStationColors } from './stationTheme';

export function StationMetricBox({
  palette,
  value,
  label,
}: {
  palette: Palette;
  value: number;
  label: string;
}) {
  const colors = resolveStationColors(palette);
  const backgroundColor = colors.isLight
    ? 'rgba(255,255,255,0.72)'
    : colors.soft;

  return (
    <View style={[styles.stationMetricBox, { backgroundColor }]}>
      <Text style={[styles.stationMetricValue, { color: colors.text }]}>
        {value}
      </Text>
      <Text
        style={[styles.stationMetricLabel, { color: colors.secondaryText }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
