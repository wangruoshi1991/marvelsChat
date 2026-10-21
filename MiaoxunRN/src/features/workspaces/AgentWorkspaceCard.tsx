import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AgentDTO } from '../../models/api';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { MiaoTaskCard } from '../miao/MiaoTaskCard';
import { taskAgentDisplayName } from '../miao/MiaoTaskAgent';
import {
  workspaceCardPresentation,
  workspaceStatusLabel,
} from './workspacePresentation';
import { workspaceAssistContext } from '../assist/workspaceAssistContext';
import { textFor } from '../../shared/i18n';

export function AgentWorkspaceCard({
  workspace,
  agents,
  palette,
  language,
  onOpen,
  grid,
}: {
  workspace: AgentWorkspace;
  agents: AgentDTO[];
  palette: Palette;
  language: Language;
  onOpen: () => void;
  grid: boolean;
}) {
  const participants = [...new Set(workspace.steps.map(step => step.agentId))];
  const content = workspaceCardPresentation(workspace, language);
  const activities = content.activities.map(activity => ({
    ...activity,
    name: taskAgentDisplayName(
      agents.find(agent => agent.key === activity.agentId),
      language,
    ),
  }));
  const status = workspaceStatusLabel(
    workspace.status,
    language,
    workspace.executionMode,
  );
  const activityText = activities.map(
    activity => `${activity.name} · ${activity.description}`,
  );
  const outcomeText = content.outcome
    ? `${content.outcome.label}：${content.outcome.title}`
    : null;
  return (
    <MiaoTaskCard
      testID={`miao-workspace-${workspace.id}`}
      object={workspaceAssistContext(workspace, agents, language)}
      goal={workspace.goal}
      status={status}
      detail={content.detail}
      participantIds={participants}
      agents={agents}
      grid={grid}
      failed={Boolean(workspace.error)}
      palette={palette}
      language={language}
      openLabel={
        workspace.executionMode === 'direct'
          ? textFor(language, '查看任务', 'View task')
          : textFor(language, '查看协作', 'View workspace')
      }
      accessibilityLabel={[
        workspace.goal,
        status,
        content.detail,
        ...activityText,
        content.attention,
        outcomeText,
      ]
        .filter(Boolean)
        .join(' · ')}
      onOpen={onOpen}
    >
      {activities.length || content.attention || content.outcome ? (
        <View style={s.activity}>
          {activities.map((activity, index) => (
            <Text
              key={activity.id}
              testID={`workspace-active-${activity.id}`}
              numberOfLines={2}
              accessibilityLabel={activityText[index]}
              style={[s.detail, { color: palette.secondaryText }]}
            >
              <Text style={s.name}>{activity.name}</Text>
              {' · '}
              {activity.description}
            </Text>
          ))}
          {content.attention ? (
            <Text
              testID="workspace-card-attention"
              numberOfLines={3}
              style={[s.attention, { color: palette.text }]}
            >
              {content.attention}
            </Text>
          ) : null}
          {outcomeText ? (
            <Text
              testID="workspace-card-outcome"
              numberOfLines={2}
              style={[s.detail, { color: palette.secondaryText }]}
            >
              {outcomeText}
            </Text>
          ) : null}
        </View>
      ) : null}
    </MiaoTaskCard>
  );
}

const s = StyleSheet.create({
  activity: { gap: 6 },
  detail: { fontSize: 13, lineHeight: 20 },
  name: { fontWeight: '600' },
  attention: { fontSize: 14, lineHeight: 21, fontWeight: '500' },
});
