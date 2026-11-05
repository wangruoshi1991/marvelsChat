import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AgentDTO } from '../../models/api';
import { WorkspaceContribution } from '../../models/agentWorkspace';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { Language } from '../session/sessionTypes';
import { MiaoTaskAgent } from '../miao/MiaoTaskAgent';
import { workspaceStatusLabel } from '../workspaces/workspacePresentation';
import { WorkspaceTextResult } from '../workspaces/WorkspaceTextResult';

export type { WorkspaceContribution } from '../../models/agentWorkspace';

/**
 * A read-only bridge from a real workspace node into its Agent conversation.
 * The node is deliberately kept outside chat_messages: this is a workspace
 * contribution, not a user or Agent chat turn.
 */
export function WorkspaceContributionCard({
  contribution,
  agents,
  token,
  palette,
  language,
}: {
  contribution: WorkspaceContribution;
  agents: AgentDTO[];
  token?: string;
  palette: Palette;
  language: Language;
}) {
  const { workspace, step } = contribution;
  const agent = agents.find(item => item.key === step.agentId);
  const summary = step.summary.trim();
  const resultTitle = step.result?.title;
  return (
    <View
      testID="workspace-contribution-card"
      accessibilityLabel={[
        textFor(language, '协作贡献', 'Workspace contribution'),
        step.goal,
        workspaceStatusLabel(step.status, language, workspace.executionMode),
        summary,
        resultTitle,
      ]
        .filter(Boolean)
        .join(' · ')}
      style={[
        s.card,
        { backgroundColor: palette.soft, borderColor: palette.border },
      ]}
    >
      <View style={s.header}>
        <MiaoTaskAgent
          agentId={step.agentId}
          agent={agent}
          palette={palette}
          language={language}
          compact
        />
        <Text style={[s.label, { color: palette.secondaryText }]}>
          {textFor(language, '协作贡献', 'Workspace contribution')}
        </Text>
        <Text style={[s.status, { color: palette.secondaryText }]}>
          {workspaceStatusLabel(step.status, language, workspace.executionMode)}
        </Text>
      </View>
      <Text style={[s.goal, { color: palette.text }]}>{step.goal}</Text>
      {resultTitle ? (
        <Text style={[s.result, { color: palette.text }]}>{resultTitle}</Text>
      ) : null}
      <Text style={[s.summary, { color: palette.secondaryText }]}>
        {summary ||
          textFor(
            language,
            '该 Agent 还没有提交摘要，协作结果会在这里更新。',
            'This Agent has not submitted a summary yet. Its contribution will appear here.',
          )}
      </Text>
      {step.result?.kind === 'text_result' && token ? (
        <View style={s.body} testID="workspace-contribution-body">
          <WorkspaceTextResult
            artifact={step.result}
            token={token}
            workspaceId={workspace.id}
            foreground
            disabled={false}
            refreshKey={workspace.revision}
            palette={palette}
            language={language}
          />
        </View>
      ) : null}
      {step.result?.kind === 'text_result' && !token ? (
        <Text style={[s.summary, { color: palette.secondaryText }]}>
          {textFor(
            language,
            '登录后才能读取这份真实文字成果。',
            'Sign in to read this verified text contribution.',
          )}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 7,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  label: { flex: 1, fontSize: 12, lineHeight: 17 },
  status: { fontSize: 12, lineHeight: 17 },
  goal: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  result: { fontSize: 13, lineHeight: 19, fontWeight: '600' },
  summary: { fontSize: 13, lineHeight: 20 },
  body: { marginTop: 4 },
});
