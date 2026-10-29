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
  size,
  showName = true,
  overlap = false,
  constrainName = false,
}: {
  agentId: string;
  agent?: AgentDTO;
  palette: Palette;
  language: Language;
  compact?: boolean;
  /** V20 feed cards use 33px footer avatars; workspace rows keep their 44px size. */
  size?: number;
  /** Feed cards collapse Agent names until the footer disclosure is opened. */
  showName?: boolean;
  /** Apply the V20 footer's compact, overlapping avatar treatment. */
  overlap?: boolean;
  /** Keep expanded footer names inside the card's remaining width. */
  constrainName?: boolean;
}) {
  return (
    <View
      style={[
        s.agent,
        compact && s.compact,
        !showName && s.avatarOnly,
        constrainName && showName && s.constrainedName,
        overlap && s.overlap,
      ]}
      testID={`miao-participant-${agentId}`}
    >
      <AgentGlyphAvatar
        agentId={agent ? agentId : ''}
        identity={
          agent?.identity || {
            status: 'unavailable',
            code: 'AGENT_IDENTITY_CONTRACT_ERROR',
            message: 'Agent identity contract unavailable.',
          }
        }
        size={size ?? (compact ? 26 : 44)}
      />
      {showName ? (
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
      ) : null}
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
  avatarOnly: { maxWidth: 32, minWidth: 32, width: 32 },
  constrainedName: { maxWidth: '100%' },
  overlap: { marginLeft: -12, maxWidth: 32, minWidth: 32, width: 32 },
  compact: { flexDirection: 'row', gap: 6, minWidth: 0, maxWidth: '100%' },
  compactName: {
    marginTop: 0,
    textAlign: 'left',
    fontWeight: '400',
    flexShrink: 1,
  },
  agentName: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    textAlign: 'center',
  },
});
