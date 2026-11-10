import React, { useEffect, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { AgentDTO } from '../../models/api';
import {
  AgentWorkspace,
  WorkspaceContribution,
} from '../../models/agentWorkspace';
import {
  WorkspaceDiscussionContext,
  workspaceDiscussionContext,
} from '../../models/workspaceContext';
import { agentWorkspaceApi } from '../../services/api/agentWorkspaceApi';
import { WorkspaceButton, WorkspaceState } from '../../shared/workspaceUi';
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
  agentId,
  onDiscuss,
  onOpenWorkspace,
}: {
  contribution: WorkspaceContribution;
  agents: AgentDTO[];
  token?: string;
  palette: Palette;
  language: Language;
  agentId?: string;
  onDiscuss?: (context: WorkspaceDiscussionContext) => void;
  onOpenWorkspace?: (workspace: AgentWorkspace) => void;
}) {
  const { workspace, step } = contribution;
  const agent = agents.find(item => item.key === step.agentId);
  const summary = step.summary.trim();
  const resultTitle = step.result?.title;
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const pending = useRef(false);
  const foregroundRef = useRef(foreground);
  const canDiscuss = Boolean(
    token &&
      onDiscuss &&
      agentId === step.agentId &&
      step.round === workspace.currentRound &&
      step.status === 'succeeded' &&
      step.result?.kind === 'text_result',
  );
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      foregroundRef.current = state === 'active';
      setForeground(state === 'active');
      if (state !== 'active') {
        generation.current += 1;
        pending.current = false;
        setBusy(false);
        setError('');
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    setBusy(false);
    setError('');
    pending.current = false;
    return () => {
      generation.current += 1;
    };
  }, [
    token,
    workspace.id,
    workspace.revision,
    workspace.currentRound,
    step.id,
    agentId,
  ]);
  const read = async (discuss: boolean) => {
    if (!token || !foregroundRef.current || pending.current) return;
    pending.current = true;
    const seq = ++generation.current;
    setBusy(true);
    setError('');
    try {
      const latest = await agentWorkspaceApi.get(token, workspace.id);
      if (seq !== generation.current || !foregroundRef.current) return;
      if (discuss) {
        const context = workspaceDiscussionContext(latest, step.id, agentId);
        onDiscuss?.(context);
      } else onOpenWorkspace?.(latest);
    } catch (issue) {
      if (seq === generation.current && foregroundRef.current)
        setError(
          issue instanceof Error
            ? issue.message
            : textFor(
                language,
                '无法读取原任务，请检查授权后重试。',
                'Unable to read the task. Review access and retry.',
              ),
        );
    } finally {
      if (seq === generation.current) {
        pending.current = false;
        setBusy(false);
      }
    }
  };
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
      <Text style={[s.label, { color: palette.secondaryText }]}>
        {textFor(
          language,
          `来自任务：${workspace.goal} · 第 ${step.round} 轮`,
          `Task: ${workspace.goal} · Round ${step.round}`,
        )}
      </Text>
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
      {step.result?.kind === 'text_result' && token && foreground ? (
        <View style={s.body} testID="workspace-contribution-body">
          <WorkspaceTextResult
            artifact={step.result}
            token={token}
            workspaceId={workspace.id}
            foreground={foreground}
            disabled={false}
            refreshKey={step.round}
            palette={palette}
            language={language}
          />
        </View>
      ) : null}
      <View style={s.actions}>
        {onOpenWorkspace && token ? (
          <WorkspaceButton
            palette={palette}
            variant="ghost"
            disabled={busy || !foreground}
            label={textFor(language, '查看原任务', 'View original task')}
            onPress={() => read(false)}
          />
        ) : null}
        {canDiscuss ? (
          <WorkspaceButton
            palette={palette}
            variant="secondary"
            disabled={busy || !foreground}
            label={textFor(language, '就此继续聊', 'Discuss this contribution')}
            onPress={() => read(true)}
          />
        ) : null}
      </View>
      {error ? (
        <WorkspaceState palette={palette} tone="error" title={error} />
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
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
