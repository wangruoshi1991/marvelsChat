import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ArrowLeft, ArrowUpRight, RefreshCw } from 'lucide-react-native';
import { AgentDTO } from '../../models/api';
import { AITaskDTO } from '../../models/aiTask';
import { aiTaskApi, AITaskEvent } from '../../services/api/aiTaskApi';
import { MiaoxunApiError } from '../../services/api/http';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  WorkspacePanel,
  WorkspaceState,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { ContextReference, TaskStatus } from '../ai/AIInteraction';
import { AgentIconAvatar } from '../messages/AgentIconAvatar';
import { Language } from '../session/sessionTypes';
import { workspacePalette } from '../../shared/workspacePalette';
import { isXunPalette } from '../../shared/xunPalette';
import { taskAgentDisplayName } from './MiaoTaskAgent';

type Props = {
  token: string;
  task: AITaskDTO;
  agents: AgentDTO[];
  palette: Palette;
  language: Language;
  onClose: () => void;
  onOpenSource: (task: AITaskDTO) => void;
};

const eventLabels: Record<string, [string, string]> = {
  queued: ['任务已排队', 'Task queued'],
  validating: ['核对引用与授权', 'Checking references and access'],
  generating: ['生成内容', 'Generating content'],
  searching: ['查找素材', 'Searching media'],
  awaiting_confirmation: ['等待确认', 'Awaiting confirmation'],
  completed: ['任务已完成', 'Task completed'],
  failed: ['执行失败', 'Execution failed'],
  cancelled: ['任务已取消', 'Task cancelled'],
  interrupted: ['执行中断', 'Execution interrupted'],
};

function eventTime(value: string, language: Language) {
  return new Date(value).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// A new account or task gets a fresh component immediately, including before
// effects run. The list snapshot is never shown as another account's detail.
export function MiaoTaskWorkspace(props: Props) {
  return (
    <TaskWorkspaceContent key={`${props.token}:${props.task.id}`} {...props} />
  );
}

function TaskWorkspaceContent({
  token,
  task: initialTask,
  agents,
  palette,
  language,
  onClose,
  onOpenSource,
}: Props) {
  const colors = workspacePalette(palette);
  const [task, setTask] = useState<AITaskDTO | null>(null);
  const [events, setEvents] = useState<AITaskEvent[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [decisionError, setDecisionError] = useState('');
  const [foreground, setForeground] = useState(
    AppState.currentState !== 'background' &&
      AppState.currentState !== 'inactive',
  );
  const current = useRef<AITaskDTO | null>(null);
  const cursor = useRef(0);
  const sequence = useRef(0);
  const alive = useRef(false);
  const pendingDecision = useRef(false);
  const isForeground = useRef(foreground);
  isForeground.current = foreground;

  const acceptTask = useCallback(
    (incoming: AITaskDTO) => {
      if (incoming.id !== initialTask.id)
        throw new Error('任务与请求不一致，请重新打开。');
      if (current.current && incoming.revision < current.current.revision)
        return current.current;
      current.current = incoming;
      setTask(incoming);
      return incoming;
    },
    [initialTask.id],
  );

  const refresh = useCallback(async () => {
    if (
      !token ||
      !alive.current ||
      !isForeground.current ||
      pendingDecision.current
    )
      return;
    const requestSequence = ++sequence.current;
    const active = () => alive.current && requestSequence === sequence.current;
    setLoading(true);
    try {
      const latest = await aiTaskApi.get(token, initialTask.id);
      if (!active()) return;
      acceptTask(latest);
      const after = cursor.current;
      const page = await aiTaskApi.events(token, initialTask.id, after);
      if (!active()) return;
      acceptTask(page.task);
      setEvents(previous => {
        const bySequence = new Map(
          previous.map(event => [event.sequence, event]),
        );
        page.events.forEach(event => bySequence.set(event.sequence, event));
        return [...bySequence.values()].sort((a, b) => a.sequence - b.sequence);
      });
      cursor.current = page.nextSequence;
      setHasMore(page.hasMore);
      setError('');
    } catch (issue) {
      if (!active()) return;
      if (
        issue instanceof MiaoxunApiError &&
        [401, 403, 404].includes(issue.status || 0)
      ) {
        current.current = null;
        cursor.current = 0;
        setTask(null);
        setEvents([]);
        setHasMore(false);
      }
      setError(
        issue instanceof Error
          ? issue.message
          : textFor(
              language,
              '暂时无法读取任务，请重试。',
              'Unable to load the task. Try again.',
            ),
      );
    } finally {
      if (active()) setLoading(false);
    }
  }, [acceptTask, initialTask.id, language, token]);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      sequence.current += 1;
    };
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      isForeground.current = state === 'active';
      setForeground(state === 'active');
      if (state !== 'active') {
        sequence.current += 1;
        setLoading(false);
      }
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!token || !foreground) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      await refresh();
      if (active) timer = setTimeout(poll, 3000);
    };
    poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
      sequence.current += 1;
    };
  }, [foreground, initialTask.revision, refresh, token]);

  const cancel = async () => {
    if (
      !token ||
      !alive.current ||
      !isForeground.current ||
      pendingDecision.current ||
      !current.current?.allowedActions.includes('cancel')
    )
      return;
    pendingDecision.current = true;
    const decisionSequence = ++sequence.current;
    const active = () => alive.current && sequence.current === decisionSequence;
    setLoading(false);
    setBusy(true);
    setDecisionError('');
    try {
      // Cancellation uses a fresh revision. A queued task may already be running.
      const latest = await aiTaskApi.get(token, initialTask.id);
      if (!active() || !isForeground.current) return;
      const accepted = acceptTask(latest);
      if (
        accepted.revision !== latest.revision ||
        !latest.allowedActions.includes('cancel')
      ) {
        setDecisionError(
          textFor(
            language,
            '任务状态已更新，当前不能取消。',
            'The task changed and can no longer be cancelled.',
          ),
        );
        return;
      }
      const updated = await aiTaskApi.decide(token, latest, 'cancel');
      if (!active()) return;
      acceptTask(updated);
      setError('');
    } catch (issue) {
      if (!active()) return;
      setDecisionError(
        issue instanceof Error
          ? issue.message
          : textFor(
              language,
              '取消失败，请刷新查看当前状态。',
              'Cancellation failed. Refresh to check the current state.',
            ),
      );
    } finally {
      pendingDecision.current = false;
      if (alive.current) {
        setBusy(false);
        refresh();
      }
    }
  };

  const agent = task
    ? agents.find(item => item.key === task.agentId)
    : undefined;
  const sourceLabel = textFor(
    language,
    task?.kind === 'site_draft' ? '打开建站预览' : '查看原对话',
    task?.kind === 'site_draft' ? 'Open site preview' : 'View conversation',
  );
  if (!foreground) {
    return (
      <View
        testID="miao-task-workspace-background"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[s.screen, { backgroundColor: colors.background }]}
      />
    );
  }
  return (
    <View
      testID="miao-task-workspace"
      style={[s.screen, { backgroundColor: colors.background }]}
    >
      <View
        style={[
          s.header,
          isXunPalette(palette) && s.headerXun,
          { borderBottomColor: colors.border },
        ]}
      >
        <WorkspaceButton
          palette={colors}
          variant="ghost"
          label={textFor(language, '返回妙页', 'Back to Miao')}
          icon={
            <ArrowLeft
              size={isXunPalette(palette) ? 20 : 22}
              color={colors.text}
            />
          }
          iconOnly
          onPress={onClose}
        />
        <Text
          accessibilityRole="header"
          style={[s.heading, { color: colors.text }]}
        >
          {textFor(language, '任务', 'Task')}
        </Text>
        <WorkspaceButton
          palette={colors}
          variant="ghost"
          label={textFor(language, '刷新任务进展', 'Refresh task activity')}
          disabled={loading || busy || !foreground || !token}
          busy={loading}
          onPress={refresh}
          icon={
            <RefreshCw
              size={isXunPalette(palette) ? 18 : 19}
              color={colors.secondaryText}
            />
          }
          iconOnly
        />
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {error ? (
          <WorkspaceState palette={colors} title={error} tone="error" />
        ) : null}
        {!token ? (
          <WorkspaceState
            palette={colors}
            title={textFor(
              language,
              '登录后查看任务',
              'Sign in to view this task',
            )}
          />
        ) : !task && !error ? (
          <WorkspaceState
            palette={colors}
            busy={loading}
            title={textFor(language, '正在读取任务…', 'Loading task…')}
          />
        ) : null}
        {task ? (
          <>
            <WorkspacePanel palette={colors} style={s.participants}>
              <View style={s.agent}>
                <AgentIconAvatar
                  agentId={task.agentId}
                  identity={
                    agent?.identity || {
                      status: 'unavailable',
                      code: 'AGENT_IDENTITY_CONTRACT_ERROR',
                      message: 'Agent identity contract unavailable.',
                    }
                  }
                  palette={colors}
                  variant={isXunPalette(palette) ? 'xun' : undefined}
                />
                <Text style={[s.agentName, { color: colors.secondaryText }]}>
                  {taskAgentDisplayName(agent, language)}
                </Text>
              </View>
            </WorkspacePanel>
            <View style={[s.goalBubble, { backgroundColor: colors.soft }]}>
              <Text style={[s.goal, { color: colors.text }]}>
                {task.goal.trim() ||
                  textFor(
                    language,
                    task.kind === 'agent_message'
                      ? '原消息已删除或撤回'
                      : '任务目标不可用',
                    task.kind === 'agent_message'
                      ? 'Original message unavailable'
                      : 'Task goal unavailable',
                  )}
              </Text>
              <ContextReference
                references={task.contextRefs}
                palette={colors}
                language={language}
              />
            </View>
            <WorkspacePanel palette={colors} style={s.activity}>
              <TaskStatus task={task} palette={colors} language={language} />
              {task.artifacts.map(artifact => (
                <View
                  key={`${artifact.kind}:${artifact.id}`}
                  style={[s.artifact, { borderTopColor: colors.border }]}
                >
                  <Text style={[s.body, { color: colors.text }]}>
                    {artifact.title ||
                      textFor(language, '任务成果', 'Task result')}
                  </Text>
                </View>
              ))}
              {task.status === 'awaiting_confirmation' ? (
                <Text style={[s.body, { color: colors.secondaryText }]}>
                  {textFor(
                    language,
                    '请打开建站预览，查看完整草稿后再决定是否保存。',
                    'Open the site preview and review the full draft before deciding whether to save it.',
                  )}
                </Text>
              ) : null}
              <WorkspaceButton
                testID="miao-task-open-source"
                palette={colors}
                variant="secondary"
                label={sourceLabel}
                disabled={busy}
                onPress={() => {
                  if (!pendingDecision.current && current.current)
                    onOpenSource(current.current);
                }}
                icon={<ArrowUpRight size={18} color={colors.text} />}
              />
            </WorkspacePanel>
            {events.length ? (
              <View style={s.timeline}>
                <Text style={[s.caption, { color: colors.secondaryText }]}>
                  {textFor(language, '任务进展', 'Activity')}
                </Text>
                {events.map(event => (
                  <View key={event.sequence} style={s.event}>
                    <View style={[s.dot, { backgroundColor: colors.border }]} />
                    <Text style={[s.eventLabel, { color: colors.text }]}>
                      {eventLabels[event.phase]
                        ? textFor(language, ...eventLabels[event.phase])
                        : textFor(language, '状态已更新', 'Status updated')}
                    </Text>
                    <Text style={[s.time, { color: colors.secondaryText }]}>
                      {eventTime(event.createdAt, language)}
                    </Text>
                  </View>
                ))}
                {hasMore ? (
                  <WorkspaceButton
                    palette={colors}
                    variant="ghost"
                    disabled={loading || busy}
                    busy={loading}
                    onPress={refresh}
                    label={textFor(
                      language,
                      '读取后续进展',
                      'Load more activity',
                    )}
                  />
                ) : null}
              </View>
            ) : null}
            {decisionError ? (
              <WorkspaceState
                palette={colors}
                title={decisionError}
                tone="error"
              />
            ) : null}
            {task.allowedActions.includes('cancel') ? (
              <WorkspaceButton
                testID="miao-task-cancel"
                palette={colors}
                variant="secondary"
                disabled={busy || !foreground}
                busy={busy}
                onPress={cancel}
                label={textFor(
                  language,
                  busy ? '正在取消…' : '取消任务',
                  busy ? 'Cancelling…' : 'Cancel task',
                )}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: workspaceTokens.space.sm,
    minHeight: 52,
  },
  // V15's Xun detail routes keep the title bar compact, leaving the task
  // card to carry the visual weight below it.
  headerXun: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderBottomWidth: 0,
  },
  heading: {
    ...workspaceTokens.typography.heading,
    flex: 1,
    textAlign: 'center',
  },
  content: {
    padding: workspaceTokens.space.lg,
    paddingBottom: 32,
    gap: workspaceTokens.space.lg,
  },
  participants: { padding: workspaceTokens.space.lg, flexDirection: 'row' },
  agent: { maxWidth: 132, alignItems: 'center', gap: workspaceTokens.space.sm },
  agentName: { ...workspaceTokens.typography.caption, textAlign: 'center' },
  goalBubble: {
    padding: workspaceTokens.space.lg,
    borderRadius: workspaceTokens.radius.panel,
    borderTopRightRadius: workspaceTokens.space.xs,
    marginLeft: 28,
    gap: workspaceTokens.space.sm,
  },
  goal: workspaceTokens.typography.body,
  activity: {
    padding: workspaceTokens.space.lg,
    borderTopLeftRadius: workspaceTokens.space.xs,
    gap: workspaceTokens.space.md,
    marginRight: workspaceTokens.space.lg,
  },
  body: workspaceTokens.typography.body,
  artifact: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: workspaceTokens.space.md,
  },
  timeline: {
    paddingHorizontal: workspaceTokens.space.xs,
    gap: workspaceTokens.space.md,
  },
  caption: workspaceTokens.typography.caption,
  event: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: workspaceTokens.space.sm,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  eventLabel: { ...workspaceTokens.typography.caption, flex: 1 },
  time: {
    ...workspaceTokens.typography.caption,
    maxWidth: '43%',
    textAlign: 'right',
  },
});
