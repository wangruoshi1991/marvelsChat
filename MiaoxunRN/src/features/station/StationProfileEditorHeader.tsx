import React from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { resolveStationColors } from './stationTheme';
import { profileEditStyles as styles } from './stationProfileEditStyles';

export function StationProfileEditorHeader({
  palette,
  language,
  isSaving,
  isLocating,
  error,
  onBack,
  onSave,
}: {
  palette: Palette;
  language: Language;
  isSaving: boolean;
  isLocating: boolean;
  error: string;
  onBack: () => void;
  onSave: () => Promise<void>;
}) {
  const colors = resolveStationColors(palette);
  return (
    <>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel={textFor(language, '返回', 'Back')}
          accessibilityRole="button"
          disabled={isSaving || isLocating}
          onPress={onBack}
          style={styles.headerAction}
        >
          <ChevronLeft color={colors.text} size={23} />
        </Pressable>
        <Text style={[styles.title, { color: colors.text }]}>
          {textFor(language, '编辑小站资料', 'Edit station profile')}
        </Text>
        <Pressable
          accessibilityLabel={textFor(
            language,
            '保存小站资料',
            'Save station profile',
          )}
          accessibilityRole="button"
          accessibilityState={{
            disabled: isSaving || isLocating,
            busy: isSaving,
          }}
          disabled={isSaving || isLocating}
          onPress={onSave}
          style={styles.headerAction}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Text
              style={[
                styles.saveText,
                { color: colors.accent },
                isLocating && styles.disabled,
              ]}
            >
              {textFor(language, '保存', 'Save')}
            </Text>
          )}
        </Pressable>
      </View>
      {error ? (
        <Text
          accessibilityRole="alert"
          style={[styles.error, { color: palette.rose }]}
        >
          {error}
        </Text>
      ) : null}
    </>
  );
}
