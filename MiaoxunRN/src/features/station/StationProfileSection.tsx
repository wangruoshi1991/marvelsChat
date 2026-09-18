import React, { ReactNode, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronRight } from 'lucide-react-native';
import { Palette } from '../../shared/theme';
import { resolveStationColors } from './stationTheme';

export function StationProfileSection({
  title,
  summary,
  palette,
  disabled,
  initiallyExpanded = false,
  children,
}: {
  title: string;
  summary: string;
  palette: Palette;
  disabled?: boolean;
  initiallyExpanded?: boolean;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const colors = resolveStationColors(palette);
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <View style={[styles.card, { backgroundColor: colors.surface }]}>
      <Pressable
        accessibilityLabel={title}
        accessibilityRole="button"
        accessibilityState={{ expanded, disabled }}
        disabled={disabled}
        onPress={() => setExpanded(!expanded)}
        style={styles.row}
      >
        <View style={styles.copy}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text
            numberOfLines={expanded ? undefined : 2}
            style={[styles.summary, { color: colors.secondaryText }]}
          >
            {summary}
          </Text>
        </View>
        <Chevron color={colors.secondaryText} size={18} />
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, overflow: 'hidden' },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    minHeight: 72,
    padding: 18,
  },
  copy: { flex: 1, gap: 5 },
  title: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  summary: { fontSize: 12, lineHeight: 18 },
  body: { gap: 14, padding: 18, paddingTop: 0 },
});
