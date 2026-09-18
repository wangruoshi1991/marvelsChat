import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { Palette } from '../../shared/theme';
import { resolveStationColors } from './stationTheme';

export function StationProfileField({
  label,
  value,
  maxLength,
  multiline,
  numeric,
  disabled,
  placeholder,
  palette,
  onChangeText,
}: {
  label: string;
  value: string;
  maxLength: number;
  multiline?: boolean;
  numeric?: boolean;
  disabled?: boolean;
  placeholder?: string;
  palette: Palette;
  onChangeText: (value: string) => void;
}) {
  const colors = resolveStationColors(palette);
  return (
    <View style={[styles.field, multiline && styles.stacked]}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        editable={!disabled}
        maxLength={maxLength}
        multiline={multiline}
        keyboardType={numeric ? 'number-pad' : 'default'}
        onChangeText={onChangeText}
        placeholder={placeholder || label}
        placeholderTextColor={palette.secondaryText}
        style={[
          styles.input,
          multiline && styles.multiline,
          {
            color: colors.text,
          },
        ]}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  field: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  stacked: { alignItems: 'stretch', flexDirection: 'column', gap: 6 },
  label: { fontSize: 14, lineHeight: 22, minWidth: 62 },
  input: {
    flex: 1,
    fontSize: 15,
    minHeight: 44,
    paddingHorizontal: 0,
    paddingVertical: 10,
    textAlign: 'right',
  },
  multiline: {
    flex: 0,
    minHeight: 84,
    textAlign: 'left',
    textAlignVertical: 'top',
  },
});
