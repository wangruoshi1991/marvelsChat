import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { textFor } from '../../shared/i18n';
import { Language } from '../session/sessionTypes';
import { AgentGlyphAvatar } from '../messages/AgentGlyphAvatar';
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
  return (
    <View
      style={[s.agent, compact && s.compact]}
      testID={`miao-participant-${agentId}`}
    >
      <AgentGlyphAvatar
        agentId={agent ? agentId : ''}
        category={agent?.category}
        identity={agent?.identity}
        size={compact ? 26 : 44}
      />
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
  compactName: {
    marginTop: 0,
    textAlign: 'left',
    fontWeight: '400',
    flexShrink: 1,
  },
  agentName: {
    marginTop: 7,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
