import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { LocationCandidateDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { resolveStationColors } from './stationTheme';

export function StationProfileLocationChoices({
  title,
  candidates,
  selected,
  disabled,
  palette,
  onSelect,
}: {
  title: string;
  candidates: LocationCandidateDTO[];
  selected: string;
  disabled: boolean;
  palette: Palette;
  onSelect: (name: string) => void;
}) {
  const colors = resolveStationColors(palette);
  return (
    <View style={styles.list}>
      <Text style={[styles.title, { color: colors.secondaryText }]}>
        {title}
      </Text>
      {candidates.map(candidate => (
        <Pressable
          key={candidate.id}
          accessibilityRole="radio"
          accessibilityLabel={`${title}：${candidate.name}`}
          accessibilityState={{
            selected: selected === candidate.name,
            disabled,
          }}
          disabled={disabled}
          onPress={() => onSelect(candidate.name)}
          style={[styles.row, { borderColor: colors.border }]}
        >
          <Text style={[styles.name, { color: colors.text }]}>
            {candidate.name}
          </Text>
          {selected === candidate.name ? (
            <Check color={colors.accent} size={18} />
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: 3 },
  title: { fontSize: 12, lineHeight: 18, marginBottom: 5 },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    minHeight: 44,
    paddingVertical: 10,
  },
  name: { flex: 1, fontSize: 14, lineHeight: 20 },
});
