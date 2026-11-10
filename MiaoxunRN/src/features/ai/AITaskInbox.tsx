import React from 'react';
import {
  ActivityIndicator,
  SectionList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronRight, RefreshCw } from 'lucide-react-native';
import { AgentDTO } from '../../models/api';
import { AITaskDTO } from '../../models/aiTask';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { useAgentWorkspaces } from '../workspaces/useAgentWorkspaces';
import { AgentWorkspaceCard } from '../workspaces/AgentWorkspaceCard';
import {
  workspaceCardPresentation,
  workspaceStatusLabel,
} from '../workspaces/workspacePresentation';
import { workspaceAssistContext } from '../assist/workspaceAssistContext';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { isXunPalette } from '../../shared/xunPalette';
import { AgentIconAvatar } from '../messages/AgentIconAvatar';
import { Language } from '../session/sessionTypes';
import { taskAgentDisplayName } from '../miao/MiaoTaskAgent';
import { TaskStatus } from './AIInteraction';
import { taskPhaseLabel, taskStatusLabel } from './taskPresentation';
import { useAITasks } from './useAITasks';
import { XunTaskCard } from './XunTaskCard';

type AITaskInboxProps = {
  token: string;
  active: boolean;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  onOpenTask: (task: AITaskDTO) => void;
  onOpenWorkspace?: (workspace: AgentWorkspace) => void;
  onOpenAgentParticipant?: (
    workspace: AgentWorkspace,
    step: AgentWorkspace['steps'][number],
  ) => void;
};

type InboxEntry =
  | { kind: 'task'; task: AITaskDTO }
  | { kind: 'workspace'; task: AgentWorkspace };

const inboxSection = (status: string) => {
  if (status === 'waiting_input' || status === 'awaiting_confirmation')
    return 'attention';
  if (['queued', 'running', 'cancelling'].includes(status)) return 'following';
  if (['succeeded', 'failed', 'cancelled', 'interrupted'].includes(status))
    return 'history';
  return 'other';
};

function updatedTime(value: string, language: Language) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AITaskInbox({
  token,
  active,
  palette,
  language,
  agents,
  onOpenTask,
  onOpenWorkspace,
  onOpenAgentParticipant,
}: AITaskInboxProps) {
  const legacy = useAITasks({
    token,
    active,
  });
  const collaboration = useAgentWorkspaces({
    token,
    active: active && Boolean(onOpenWorkspace),
  });
  const error = legacy.error || collaboration.error;
  const xunTheme = isXunPalette(palette);
  const loading =
    legacy.loading ||
    Boolean(onOpenWorkspace && !collaboration.loaded && !error);
  const refresh = () =>
    Promise.all([legacy.refresh(), collaboration.refresh()]);
  const entries: InboxEntry[] = [
    ...legacy.tasks.map(task => ({ kind: 'task' as const, task })),
    ...collaboration.workspaces.map(workspace => ({
      kind: 'workspace' as const,
      task: workspace,
    })),
  ].sort(
    (a, b) =>
      (xunTheme ? b.task.updatedAt.localeCompare(a.task.updatedAt) : 0) ||
      b.task.createdAt.localeCompare(a.task.createdAt) ||
      `${a.kind}:${a.task.id}`.localeCompare(`${b.kind}:${b.task.id}`),
  );
  const sections = xunTheme
    ? (
        [
          ['attention', textFor(language, '待你确认', 'Needs your attention')],
          ['following', textFor(language, '正在跟进', 'In progress')],
          ['history', textFor(language, '历史任务', 'Task history')],
          ['other', textFor(language, '其他任务', 'Other tasks')],
        ] as const
      )
        .map(([key, title]) => ({
          key,
          title,
          data: entries.filter(
            entry => inboxSection(entry.task.status) === key,
          ),
        }))
        .filter(section => section.data.length > 0)
    : entries.length
    ? [{ key: 'recent', title: '', data: entries }]
    : [];
  const initialLoading =
    Boolean(token) &&
    (!legacy.hasLoaded || (onOpenWorkspace && !collaboration.loaded)) &&
    !error;
  return (
    <SectionList
      testID="ai-task-inbox"
      sections={sections}
      stickySectionHeadersEnabled={false}
      keyExtractor={entry => `${entry.kind}:${entry.task.id}`}
      style={[s.list, { backgroundColor: palette.background }]}
      contentContainerStyle={[s.content, xunTheme && s.contentXun]}
      ListHeaderComponent={
        token ? (
          <View style={s.header}>
            <View style={[s.headerRow, xunTheme && s.headerRowXun]}>
              {!xunTheme ? (
                <Text style={[s.caption, { color: palette.secondaryText }]}>
                  {textFor(language, '最近任务', 'Recent tasks')}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={textFor(
                  language,
                  error ? '重试读取任务' : '刷新任务',
                  error ? 'Retry loading tasks' : 'Refresh tasks',
                )}
                accessibilityState={{ disabled: loading, busy: loading }}
                disabled={loading}
                onPress={refresh}
                style={({ pressed }) => [
                  s.refresh,
                  { opacity: pressed || loading ? 0.55 : 1 },
                ]}
              >
                <RefreshCw size={14} color={palette.secondaryText} />
                <Text style={[s.caption, { color: palette.secondaryText }]}>
                  {textFor(
                    language,
                    error ? '重试' : '刷新',
                    error ? 'Retry' : 'Refresh',
                  )}
                </Text>
              </Pressable>
            </View>
            {error ? (
              <Text
                accessibilityRole="alert"
                style={[s.error, { color: palette.rose }]}
              >
                {error}
              </Text>
            ) : null}
          </View>
        ) : null
      }
      ListEmptyComponent={
        <View style={s.empty} accessibilityLiveRegion="polite">
          {initialLoading ? (
            <>
              <ActivityIndicator color={palette.secondaryText} />
              <Text style={[s.body, { color: palette.secondaryText }]}>
                {textFor(language, '正在读取任务…', 'Loading tasks…')}
              </Text>
            </>
          ) : !error ? (
            <>
              <Text style={[s.emptyTitle, { color: palette.text }]}>
                {textFor(
                  language,
                  token ? '还没有任务' : '登录后查看任务',
                  token ? 'No tasks yet' : 'Sign in to view tasks',
                )}
              </Text>
              <Text style={[s.emptyDetail, { color: palette.secondaryText }]}>
                {textFor(
                  language,
                  token
                    ? 'Agent 执行任务、进展和成果会显示在这里。'
                    : '你的任务状态和成果会随账号保存。',
                  token
                    ? 'Agent tasks, progress and results will appear here.'
                    : 'Task progress and results are saved to your account.',
                )}
              </Text>
            </>
          ) : null}
        </View>
      }
      ListFooterComponent={
        legacy.tasks.length === 30 || collaboration.workspaces.length === 30 ? (
          <Text style={[s.caption, { color: palette.secondaryText }]}>
            {textFor(
              language,
              '分别显示最近 30 项 Agent 任务和历史任务',
              'Showing up to 30 recent Agent tasks and 30 legacy tasks',
            )}
          </Text>
        ) : null
      }
      renderSectionHeader={({ section }) =>
        xunTheme ? (
          <Text
            accessibilityRole="header"
            testID={`task-section-${section.key}`}
            style={[
              s.sectionTitle,
              section.key !== sections[0]?.key && s.laterSectionTitle,
              { color: palette.text },
            ]}
          >
            {section.title}
          </Text>
        ) : null
      }
      renderItem={({ item }) => {
        if (item.kind === 'workspace') {
          if (xunTheme) {
            const workspace = item.task;
            const presentation = workspaceCardPresentation(workspace, language);
            const participantIds = [
              ...new Set(workspace.steps.map(step => step.agentId)),
            ];
            const participants = participantIds.map(id => ({
              id,
              agent: agents.find(candidate => candidate.key === id),
              displayName: taskAgentDisplayName(
                agents.find(candidate => candidate.key === id),
                language,
              ),
            }));
            const status = workspaceStatusLabel(
              workspace.status,
              language,
              workspace.executionMode,
            );
            const detail =
              presentation.detail ||
              presentation.attention ||
              presentation.outcome?.title ||
              workspace.summary ||
              null;
            const extraDetails = [
              ...presentation.activities.map(activity => {
                const name = taskAgentDisplayName(
                  agents.find(candidate => candidate.key === activity.agentId),
                  language,
                );
                return `${name} · ${activity.description}`;
              }),
              presentation.attention && presentation.attention !== detail
                ? presentation.attention
                : null,
              presentation.outcome && presentation.outcome.title !== detail
                ? `${presentation.outcome.label}：${presentation.outcome.title}`
                : null,
            ].filter(Boolean) as string[];
            const actionVariant =
              workspace.status === 'waiting_input' ||
              workspace.status === 'awaiting_confirmation'
                ? 'primary'
                : 'secondary';
            const statusTone = workspace.error
              ? 'error'
              : workspace.status === 'running'
              ? 'progress'
              : workspace.status === 'waiting_input' ||
                workspace.status === 'awaiting_confirmation' ||
                workspace.status === 'queued'
              ? 'attention'
              : 'neutral';
            return (
              <XunTaskCard
                testID={`miao-workspace-${workspace.id}`}
                palette={palette}
                status={status}
                statusTone={statusTone}
                time={updatedTime(workspace.updatedAt, language)}
                participants={participants}
                goal={workspace.goal}
                description={detail}
                openLabel={
                  workspace.executionMode === 'direct'
                    ? textFor(language, '查看任务', 'View task')
                    : textFor(language, '查看协作', 'View workspace')
                }
                accessibilityLabel={[
                  workspace.goal,
                  status,
                  detail,
                  ...extraDetails,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                accessibilityHint={textFor(
                  language,
                  '打开协作任务，查看进展和成果',
                  'Open the workspace to review progress and results',
                )}
                actionVariant={actionVariant}
                context={{
                  object: workspaceAssistContext(workspace, agents, language),
                  language,
                }}
                onOpen={() => onOpenWorkspace?.(workspace)}
              >
                {extraDetails.length ? (
                  <View style={s.xunDetails}>
                    {extraDetails.map((line, index) => (
                      <Text
                        key={`${index}:${line}`}
                        numberOfLines={2}
                        style={[s.xunDetail, { color: palette.secondaryText }]}
                      >
                        {line}
                      </Text>
                    ))}
                  </View>
                ) : null}
              </XunTaskCard>
            );
          }
          return (
            <AgentWorkspaceCard
              workspace={item.task}
              token={token}
              active={active}
              agents={agents}
              palette={palette}
              language={language}
              grid={false}
              onOpen={() => onOpenWorkspace?.(item.task)}
              onOpenParticipant={step =>
                onOpenAgentParticipant?.(item.task, step)
              }
            />
          );
        }
        const task = item.task;
        const agent = agents.find(entry => entry.key === task.agentId);
        const agentName =
          agent?.name ||
          textFor(
            language,
            task.kind === 'site_draft' ? '建站 Agent' : '执行 Agent',
            task.kind === 'site_draft' ? 'Site Agent' : 'Task agent',
          );
        const goal =
          task.goal.trim() ||
          textFor(
            language,
            task.kind === 'agent_message'
              ? '原消息已删除或撤回'
              : '任务目标不可用',
            task.kind === 'agent_message'
              ? 'Original message unavailable'
              : 'Task goal unavailable',
          );
        if (xunTheme) {
          const description = [
            task.error?.message,
            task.status === 'running'
              ? taskPhaseLabel(task.phase, language)
              : task.status === 'interrupted'
              ? textFor(
                  language,
                  '执行已中断，不会自动重试。请核对现有成果后重新发起。',
                  'Execution was interrupted and will not retry automatically. Review any results before starting again.',
                )
              : null,
            ...task.artifacts.map(artifact => artifact.title),
          ]
            .filter(Boolean)
            .join('\n');
          const statusTone =
            task.error || task.status === 'interrupted'
              ? 'error'
              : task.status === 'running' || task.status === 'succeeded'
              ? 'progress'
              : task.status === 'queued' ||
                task.status === 'awaiting_confirmation'
              ? 'attention'
              : 'neutral';
          return (
            <XunTaskCard
              testID={`ai-task-inbox-${task.id}`}
              palette={palette}
              status={taskStatusLabel(task.status, language)}
              statusTone={statusTone}
              time={updatedTime(task.updatedAt, language)}
              participants={[
                { id: task.agentId, agent, displayName: agentName },
              ]}
              goal={goal}
              description={description}
              openLabel={
                task.status === 'awaiting_confirmation'
                  ? textFor(language, '查看并确认', 'Review and confirm')
                  : task.status === 'running'
                  ? textFor(language, '查看进度', 'View progress')
                  : textFor(language, '查看任务', 'View task')
              }
              accessibilityLabel={[
                goal,
                taskStatusLabel(task.status, language),
                description,
              ]
                .filter(Boolean)
                .join(' · ')}
              accessibilityHint={textFor(
                language,
                task.kind === 'site_draft'
                  ? '打开建站工作区，查看任务和草稿'
                  : '打开原会话，查看任务和回复',
                task.kind === 'site_draft'
                  ? 'Open the site workspace to review the task and draft'
                  : 'Open the conversation to review the task and reply',
              )}
              actionVariant={
                task.status === 'awaiting_confirmation'
                  ? 'primary'
                  : 'secondary'
              }
              onOpen={() => onOpenTask(task)}
            />
          );
        }
        return (
          <Pressable
            testID={`ai-task-inbox-${task.id}`}
            accessibilityRole="button"
            accessibilityHint={textFor(
              language,
              task.kind === 'site_draft'
                ? '打开建站工作区，查看任务和草稿'
                : '打开原会话，查看任务和回复',
              task.kind === 'site_draft'
                ? 'Open the site workspace to review the task and draft'
                : 'Open the conversation to review the task and reply',
            )}
            onPress={() => onOpenTask(task)}
            style={({ pressed }) => [
              s.card,
              {
                backgroundColor: pressed ? palette.soft : palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={s.metadata}>
              <AgentIconAvatar
                agentId={task.agentId}
                identity={
                  agent?.identity || {
                    status: 'unavailable',
                    code: 'AGENT_IDENTITY_CONTRACT_ERROR',
                    message: 'Agent identity contract unavailable.',
                  }
                }
                palette={palette}
                small
              />
              <Text
                numberOfLines={1}
                style={[s.agentName, { color: palette.secondaryText }]}
              >
                {agentName}
              </Text>
              <Text style={[s.time, { color: palette.secondaryText }]}>
                {updatedTime(task.updatedAt, language)}
              </Text>
            </View>
            <Text numberOfLines={3} style={[s.goal, { color: palette.text }]}>
              {goal}
            </Text>
            <View style={s.statusRow}>
              <View style={s.status}>
                <TaskStatus
                  task={task}
                  palette={palette}
                  language={language}
                  compact
                />
              </View>
              <ChevronRight size={16} color={palette.secondaryText} />
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const s = StyleSheet.create({
  list: { flex: 1 },
  content: { paddingHorizontal: 4, paddingBottom: 80, gap: 3, flexGrow: 1 },
  contentXun: { paddingHorizontal: 13, gap: 11 },
  header: { paddingHorizontal: 9, paddingBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerRowXun: { justifyContent: 'flex-end' },
  sectionTitle: { fontSize: 14, lineHeight: 20, marginTop: 2, marginBottom: 1 },
  laterSectionTitle: { marginTop: 18 },
  refresh: {
    minHeight: 44,
    minWidth: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  caption: { fontSize: 12, lineHeight: 18 },
  error: { fontSize: 13, lineHeight: 19, paddingBottom: 5 },
  card: { padding: 12, borderWidth: 1, borderRadius: 7, gap: 9 },
  metadata: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  agentName: { flex: 1, fontSize: 12, lineHeight: 18 },
  time: { fontSize: 11, lineHeight: 17, flexShrink: 1, textAlign: 'right' },
  goal: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  status: { flex: 1 },
  xunDetails: { gap: 6, marginBottom: 15 },
  xunDetail: { fontSize: 12, lineHeight: 19 },
  body: { fontSize: 14, lineHeight: 21 },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    gap: 10,
  },
  emptyTitle: { fontSize: 17, lineHeight: 24, fontWeight: '600' },
  emptyDetail: { fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
