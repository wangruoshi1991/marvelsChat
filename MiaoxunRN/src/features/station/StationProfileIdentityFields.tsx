import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ProfileLanguageCode } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationProfileField } from './StationProfileField';
import { profileLanguageOptions } from './stationProfileIdentity';
import { resolveStationColors } from './stationTheme';

export function StationProfileIdentityFields({
  palette,
  language,
  disabled,
  headline,
  experienceYears,
  languages,
  onHeadlineChange,
  onExperienceChange,
  onLanguagesChange,
}: {
  palette: Palette;
  language: Language;
  disabled: boolean;
  headline: string;
  experienceYears: string;
  languages: ProfileLanguageCode[];
  onHeadlineChange: (value: string) => void;
  onExperienceChange: (value: string) => void;
  onLanguagesChange: (value: ProfileLanguageCode[]) => void;
}) {
  const colors = resolveStationColors(palette);
  return (
    <>
      <StationProfileField
        label={textFor(language, '职业身份', 'Professional headline')}
        value={headline}
        maxLength={80}
        disabled={disabled}
        palette={palette}
        onChangeText={onHeadlineChange}
        placeholder={textFor(
          language,
          '例如：产品设计师',
          'e.g. Product designer',
        )}
      />
      <StationProfileField
        label={textFor(language, '经验年限', 'Experience')}
        value={experienceYears}
        maxLength={2}
        numeric
        disabled={disabled}
        palette={palette}
        onChangeText={onExperienceChange}
        placeholder={textFor(language, '未填写', 'Not set')}
      />
      <Text style={[styles.label, { color: palette.text }]}>
        {textFor(language, '沟通语言', 'Languages')}
      </Text>
      <View style={styles.options}>
        {profileLanguageOptions.map(option => {
          const selected = languages.includes(option.code);
          return (
            <Pressable
              key={option.code}
              accessibilityRole="checkbox"
              accessibilityLabel={textFor(language, option.zh, option.en)}
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() =>
                onLanguagesChange(
                  selected
                    ? languages.filter(code => code !== option.code)
                    : [...languages, option.code],
                )
              }
              style={[
                styles.option,
                {
                  backgroundColor: selected ? colors.soft : colors.surface,
                  borderColor: selected ? colors.accent : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.optionText,
                  { color: selected ? colors.accent : colors.secondaryText },
                ]}
              >
                {textFor(language, option.zh, option.en)}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.helper, { color: palette.secondaryText }]}>
        {textFor(
          language,
          '按需补充，未填写的内容不会展示。',
          'All details are optional. Empty fields stay hidden.',
        )}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, lineHeight: 22 },
  helper: { fontSize: 12, lineHeight: 18 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    borderRadius: 22,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  optionText: { fontSize: 14 },
});
