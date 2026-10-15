import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { AIContextActions } from '../assist/AIContextActions';
import { MiaoTaskAgent } from './MiaoTaskAgent';

/** Single tasks and collaborations share the same content and gesture surface. */
export function MiaoTaskCard({
  goal,
  status,
  detail,
  participantIds,
  agents,
  palette,
  language,
  grid,
  failed,
  children,
  ...actions
}: Omit<React.ComponentProps<typeof AIContextActions>, 'children' | 'style'> & {
  goal: string;
  status: string;
  detail?: string | null;
  participantIds: string[];
  agents: AgentDTO[];
  palette: Palette;
  language: Language;
  grid: boolean;
  failed: boolean;
  children?: React.ReactNode;
}) {
  const detailText = detail?.trim();
  const showDetail =
    detailText && detailText !== goal.trim() && detailText !== status.trim();
  return (
    <AIContextActions
      {...actions}
      palette={palette}
      language={language}
      style={[
        s.card,
        grid && s.grid,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Text
        numberOfLines={grid ? 5 : 3}
        style={[s.goal, { color: palette.text }]}
      >
        {goal}
      </Text>
      {showDetail ? (
        <Text
          numberOfLines={2}
          style={[s.detail, { color: palette.secondaryText }]}
        >
          {detailText}
        </Text>
      ) : null}
      {children}
      <View style={[s.meta, grid && s.gridMeta]}>
        <Text
          style={[
            s.status,
            { color: failed ? palette.rose : palette.secondaryText },
          ]}
        >
          {status}
        </Text>
        {participantIds.length ? (
          <View style={s.participants}>
            {participantIds.map(id => (
              <MiaoTaskAgent
                key={id}
                compact
                agentId={id}
                agent={agents.find(agent => agent.key === id)}
                palette={palette}
                language={language}
              />
            ))}
          </View>
        ) : null}
      </View>
    </AIContextActions>
  );
}

const s = StyleSheet.create({
  card: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    paddingHorizontal: 4,
    paddingVertical: 18,
    gap: 7,
  },
  grid: {
    flex: 1,
    maxWidth: '50%',
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    padding: 13,
  },
  status: { fontSize: 11, lineHeight: 16, fontWeight: '500' },
  goal: {
    fontSize: 17,
    lineHeight: 25,
    fontWeight: '600',
  },
  detail: { fontSize: 13, lineHeight: 20 },
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    marginTop: 5,
  },
  gridMeta: { flexDirection: 'column', alignItems: 'flex-start', gap: 8 },
  participants: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 1,
    gap: 12,
  },
});
