import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
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
  const participants = participantIds.map(id => ({
    id,
    agent: agents.find(candidate => candidate.key === id),
  }));
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
      {participants.length ? (
        <View style={s.head}>
          <ScrollView
            horizontal
            contentContainerStyle={s.strip}
            scrollEnabled={participants.length > 3}
            showsHorizontalScrollIndicator={false}
          >
            {participants.map(({ id, agent }) => (
              <MiaoTaskAgent
                key={id}
                agentId={id}
                agent={agent}
                palette={palette}
                language={language}
              />
            ))}
          </ScrollView>
          <Text
            style={[
              s.statusPill,
              {
                backgroundColor: failed ? palette.rose : palette.soft,
                color: failed ? palette.surface : palette.secondaryText,
              },
            ]}
          >
            {status}
          </Text>
        </View>
      ) : null}
      <Text
        numberOfLines={grid ? 5 : 3}
        style={[s.description, { color: palette.text }]}
      >
        {highlightTaskNumbers(goal)}
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
    </AIContextActions>
  );
}

/**
 * Prototype `task-number`: digits inside the description read larger than the
 * surrounding sentence. Only digit runs are split so ordinary text keeps its
 * exact string form for callers that compare it.
 */
export function highlightTaskNumbers(text: string) {
  const parts = text.split(/(\d+(?:[.,]\d+)*)/g);
  if (parts.length === 1) return text;
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <Text key={`${part}-${index}`} style={s.taskNumber}>
        {part}
      </Text>
    ) : (
      part
    ),
  );
}

const s = StyleSheet.create({
  // Prototype `.task-card`: its own bordered, rounded, shadowed card rather
  // than a full-bleed row with a separator line.
  card: {
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 7,
    padding: 18,
  },
  grid: {
    flex: 1,
    maxWidth: '50%',
    borderRadius: 7,
  },
  head: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  // The strip scrolls horizontally rather than wrapping, matching the design.
  strip: { alignItems: 'flex-start', gap: 12, paddingRight: 4 },
  statusPill: {
    borderRadius: 99,
    flexShrink: 0,
    fontSize: 11,
    fontWeight: '700',
    overflow: 'hidden',
    paddingHorizontal: 7,
    paddingVertical: 5,
  },
  description: {
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
  taskNumber: { fontSize: 18, fontWeight: '800' },
  detail: { fontSize: 13, lineHeight: 20 },
});
