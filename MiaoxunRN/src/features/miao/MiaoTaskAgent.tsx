import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { AgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import { resolveAgentThreadIcon } from '../messages/threadIconRegistry';
export function MiaoTaskAgent({
  agentId,
  agent,
  palette,
  language,
  compact = false,
}: {
  agentId: string;
  agent?: AgentDTO;
  palette: Palette;
  language: Language;
  compact?: boolean;
}) {
  const icon = resolveAgentThreadIcon(agent ? agentId : '', agent?.category);
  const Icon = icon.Icon;
  return (
    <View
      style={[s.agent, compact && s.compact]}
      testID={`miao-participant-${agentId}`}
    >
      <View
        style={[
          s.avatar,
          compact && s.compactAvatar,
          {
            backgroundColor: agent?.identity?.colors.background || palette.soft,
            borderColor: palette.surface,
          },
        ]}
      >
        {icon.imageSource ? (
          <Image
            source={icon.imageSource}
            style={[s.avatarImage, compact && s.compactImage]}
          />
        ) : Icon ? (
          <Icon
            size={compact ? 15 : 22}
            color={agent?.identity?.colors.foreground || palette.text}
          />
        ) : null}
      </View>
      <Text
        numberOfLines={2}
        style={[
          s.agentName,
          compact && s.compactName,
          { color: palette.secondaryText },
        ]}
      >
        {taskAgentDisplayName(agent, language)}
      </Text>
    </View>
  );
}

export function taskAgentDisplayName(
  agent: AgentDTO | undefined,
  language: Language,
) {
  return agent?.name || textFor(language, '执行 Agent', 'Task agent');
}

const s = StyleSheet.create({
  agent: { alignItems: 'center', maxWidth: 112, minWidth: 48 },
  compact: { flexDirection: 'row', gap: 6, minWidth: 0, maxWidth: '100%' },
  compactAvatar: { width: 26, height: 26, borderRadius: 13, borderWidth: 0 },
  compactImage: { width: 24, height: 24, borderRadius: 12 },
  compactName: {
    marginTop: 0,
    textAlign: 'left',
    fontWeight: '400',
    flexShrink: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    resizeMode: 'contain',
  },
  agentName: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
