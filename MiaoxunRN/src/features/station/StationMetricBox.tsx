import React from 'react';
import { Text, View } from 'react-native';

import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';

export function StationMetricBox({
  palette,
  value,
  label,
}: {
  palette: Palette;
  value: number;
  label: string;
}) {
  return (
    <View style={[styles.stationMetricBox, { backgroundColor: palette.soft }]}>
      <Text style={[styles.stationMetricValue, { color: palette.text }]}>
        {value}
      </Text>
      <Text
        style={[styles.stationMetricLabel, { color: palette.secondaryText }]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
