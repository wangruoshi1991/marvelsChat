import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ChevronDown, ChevronUp } from 'lucide-react-native';
import { AgentDTO } from '../../models/api';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { AIContextActions } from '../assist/AIContextActions';
import { MiaoTaskAgent } from './MiaoTaskAgent';

/** Single tasks and collaborations share the same content and gesture surface. */
export function MiaoTaskCard({
  object,
  goal,
  status,
  detail,
  participantIds,
  agents,
  palette,
  language,
  grid,
  failed,
  showAgentNames = false,
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
  /** Optional fixed names for callers outside the collapsible feed. */
  showAgentNames?: boolean;
  children?: React.ReactNode;
}) {
  const detailText = detail?.trim();
  const showDetail =
    detailText && detailText !== goal.trim() && detailText !== status.trim();
  const participants = participantIds.map(id => ({
    id,
    agent: agents.find(candidate => candidate.key === id),
  }));
  const [agentsExpanded, setAgentsExpanded] = useState(false);
  const namesVisible = showAgentNames || agentsExpanded;
  const ToggleIcon = agentsExpanded ? ChevronUp : ChevronDown;
  const agentNodes = participants.map(({ id, agent }, index) => (
    <MiaoTaskAgent
      key={id}
      agentId={id}
      agent={agent}
      palette={palette}
      language={language}
      size={33}
      showName={namesVisible || !agent}
      constrainName
      overlap={!namesVisible && index > 0}
    />
  ));
  const taskStatus = (
    <Text
      testID="miao-task-status"
      style={[
        s.status,
        grid && s.gridStatus,
        { color: failed ? palette.rose : palette.secondaryText },
      ]}
    >
      {status}
    </Text>
  );
  return (
    <AIContextActions
      {...actions}
      object={object}
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
        style={[s.description, { color: palette.secondaryText }]}
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
      {grid || !participants.length ? taskStatus : null}
      {participants.length ? (
        <View style={s.footer}>
          {namesVisible ? (
            <View style={[s.agentScroller, s.strip, s.expandedStrip]}>
              {agentNodes}
            </View>
          ) : (
            <ScrollView
              horizontal
              style={s.agentScroller}
              contentContainerStyle={s.strip}
              scrollEnabled={participants.length > 1}
              showsHorizontalScrollIndicator={false}
            >
              {agentNodes}
            </ScrollView>
          )}
          <View style={s.footerActions}>
            {!grid ? taskStatus : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={agentsExpanded ? '收起 Agent' : '展开 Agent'}
              accessibilityState={{ expanded: agentsExpanded }}
              hitSlop={8}
              onPress={event => {
                event.stopPropagation();
                setAgentsExpanded(value => !value);
              }}
              style={s.toggle}
            >
              <ToggleIcon
                color={palette.secondaryText}
                size={22}
                strokeWidth={1.6}
              />
            </Pressable>
          </View>
        </View>
      ) : null}
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
  // V6 `.brief-card`: a rounded card on the dark task-feed canvas.
  card: {
    borderRadius: 19,
    borderWidth: 0,
    gap: 7,
    padding: 18,
  },
  grid: {
    flex: 1,
    maxWidth: '50%',
    borderRadius: 19,
  },
  footer: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
    marginTop: 8,
    minHeight: 33,
  },
  // V20 keeps a compact, overlapping Agent stack below the brief text.
  agentScroller: { flex: 1, minWidth: 0 },
  strip: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 0,
    paddingRight: 4,
  },
  expandedStrip: { gap: 10, flexWrap: 'wrap', rowGap: 12 },
  footerActions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  status: { fontSize: 11, lineHeight: 16, maxWidth: 90 },
  // In a two-column card, status must not take the avatar viewport's width.
  gridStatus: { maxWidth: '100%' },
  toggle: {
    alignItems: 'center',
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  description: {
    fontSize: 15.5,
    lineHeight: 24,
    fontWeight: '400',
  },
  taskNumber: { fontSize: 18, fontWeight: '800' },
  detail: { fontSize: 13, lineHeight: 20 },
});
