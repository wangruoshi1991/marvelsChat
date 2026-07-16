import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, WandSparkles } from 'lucide-react-native';

import { AgentReadinessDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationModule } from './StationHomeModules';

export function StationSiteBuilderPanel({
  palette,
  language,
  enabled,
  readiness,
  onOpenBuilder,
}: {
  palette: Palette;
  language: Language;
  enabled: boolean;
  readiness?: AgentReadinessDTO;
  onOpenBuilder: () => void;
}) {
  if (!enabled) {
    return null;
  }

  const readinessText = readiness?.configured
    ? textFor(language, '可使用', 'Available')
    : textFor(language, '基础版可用', 'Basic mode available');

  return (
    <StationModule
      palette={palette}
      title={textFor(
        language,
        '个人主页 / 建站 Agent',
        'Homepage Builder Agent',
      )}
      action={textFor(language, '打开', 'Open')}
      onAction={onOpenBuilder}
    >
      <Pressable
        testID="station-site-builder-open"
        accessibilityRole="button"
        accessibilityLabel={textFor(
          language,
          '打开个人主页建站 Agent',
          'Open Homepage Builder Agent',
        )}
        onPress={onOpenBuilder}
        style={localStyles.entry}
      >
        <View style={[localStyles.icon, { backgroundColor: palette.soft }]}>
          <WandSparkles color={palette.mint} size={21} strokeWidth={2.3} />
        </View>
        <View style={localStyles.copy}>
          <Text style={[localStyles.title, { color: palette.text }]}>
            {textFor(
              language,
              '自然语言创建个人主页',
              'Create a personal homepage',
            )}
          </Text>
          <Text
            style={[localStyles.status, { color: palette.secondaryText }]}
          >
            {readinessText}
          </Text>
        </View>
        <ChevronRight color={palette.text} size={20} strokeWidth={2.3} />
      </Pressable>
    </StationModule>
  );
}

const localStyles = StyleSheet.create({
  entry: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
  },
  status: {
    marginTop: 2,
    fontSize: 12,
    lineHeight: 17,
  },
});
