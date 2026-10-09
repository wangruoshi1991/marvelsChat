import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { textFor } from '../../shared/i18n';
import { resolveStationColors } from '../station/stationTheme';
import { retrievalStyles as styles } from './mediaRetrievalStyles';

export function RetrievalSearchForm({
  palette,
  language,
  query,
  kind,
  onQuery,
  onKind,
  onSearch,
  busy,
  searching,
  enabled,
}: {
  palette: Palette;
  language: Language;
  query: string;
  kind?: 'image' | 'video';
  onQuery: (value: string) => void;
  onKind: (value: 'image' | 'video' | undefined) => void;
  onSearch: () => void;
  busy: boolean;
  searching: boolean;
  enabled: boolean;
}) {
  const c = resolveStationColors(palette);
  const t = (zh: string, en: string) => textFor(language, zh, en);
  return (
    <View style={styles.column}>
      <Text style={[styles.title, { color: c.text }]}>
        {t('你想找什么画面？', 'What scene are you looking for?')}
      </Text>
      <Text style={[styles.subtitle, { color: c.secondaryText }]}>
        {t(
          '描述画面中的场景、颜色、物品或文字。',
          'Describe the scene, colors, objects, or visible text.',
        )}
      </Text>
      <TextInput
        accessibilityLabel={t('素材描述', 'Media description')}
        value={query}
        onChangeText={onQuery}
        multiline
        maxLength={240}
        editable={!busy}
        placeholder={t(
          '例如：海边穿黄色裙子的照片',
          'For example: a yellow dress at the beach',
        )}
        placeholderTextColor={c.secondaryText}
        style={[
          styles.input,
          { backgroundColor: c.surface, borderColor: c.border, color: c.text },
        ]}
      />
      <View style={styles.wrap}>
        {([undefined, 'image', 'video'] as const).map(value => (
          <Pressable
            key={value || 'all'}
            accessibilityRole="radio"
            accessibilityState={{ selected: kind === value }}
            disabled={busy}
            onPress={() => onKind(value)}
            style={[
              styles.chip,
              {
                borderColor: kind === value ? c.accent : c.border,
                backgroundColor: kind === value ? c.soft : c.surface,
              },
            ]}
          >
            <Text
              style={{ color: kind === value ? c.accent : c.secondaryText }}
            >
              {value === 'image'
                ? t('图片', 'Photos')
                : value === 'video'
                ? t('视频', 'Videos')
                : t('全部', 'All')}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('搜索素材', 'Search media')}
        disabled={!enabled || !query.trim()}
        onPress={onSearch}
        style={[
          styles.button,
          { backgroundColor: c.accent },
          (!enabled || !query.trim()) && styles.disabled,
        ]}
      >
        {searching ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={[styles.buttonText, styles.white]}>
            {t('搜索', 'Search')}
          </Text>
        )}
      </Pressable>
    </View>
  );
}
