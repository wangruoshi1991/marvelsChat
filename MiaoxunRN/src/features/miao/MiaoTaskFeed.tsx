import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { useAgentWorkspaces } from '../workspaces/useAgentWorkspaces';
import { AgentWorkspaceCard } from '../workspaces/AgentWorkspaceCard';
import { AgentDTO } from '../../models/api';
import { AITaskDTO } from '../../models/aiTask';
import { textFor } from '../../shared/i18n';
import { isLightPalette, Palette } from '../../shared/theme';
import { WorkspaceState, workspaceTokens } from '../../shared/workspaceUi';
import { workspacePalette } from '../../shared/workspacePalette';
import { useAITasks } from '../ai/useAITasks';
import { taskPhaseLabel, taskStatusLabel } from '../ai/taskPresentation';
import { MiaoTaskCard } from './MiaoTaskCard';
export { MiaoTaskAgent } from './MiaoTaskAgent';
import { Language } from '../session/sessionTypes';

export function MiaoTaskFeed({
  token,
  active,
  palette,
  language,
  agents,
  waterfall,
  onOpenTask,
  onOpenWorkspace,
}: {
  token: string;
  active: boolean;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  waterfall: boolean;
  onOpenTask: (task: AITaskDTO) => void;
  onOpenWorkspace?: (workspace: AgentWorkspace) => void;
}) {
  const colors = workspacePalette(palette);
  // Light mode paints the page gradient behind the tabs, so the feed must not
  // cover it with a flat fill; dark mode keeps its own background.
  const feedBackground = isLightPalette(palette)
    ? 'transparent'
    : colors.background;
  const { width, fontScale } = useWindowDimensions();
  const { tasks, hasLoaded, error, refresh } = useAITasks({
    token,
    active,
  });
  const collaboration = useAgentWorkspaces({
    token,
    active: active && Boolean(onOpenWorkspace),
  });
  const entries = [
    ...tasks.map(task => ({ kind: 'task' as const, task })),
    ...collaboration.workspaces.map(workspace => ({
      kind: 'workspace' as const,
      task: workspace,
    })),
  ].sort((a, b) => b.task.createdAt.localeCompare(a.task.createdAt));
  const allLoaded = hasLoaded && (!onOpenWorkspace || collaboration.loaded);
  const loadError = error || collaboration.error;
  const [manualRefreshing, setManualRefreshing] = useState(false);
  const manualRequest = useRef<symbol | null>(null);
  useEffect(() => {
    manualRequest.current = null;
    setManualRefreshing(false);
    return () => {
      manualRequest.current = null;
    };
  }, [active, token]);
  const refreshManually = async () => {
    if (!token || !active || manualRequest.current) return;
    const request = Symbol('manual-task-refresh');
    manualRequest.current = request;
    setManualRefreshing(true);
    try {
      // The task hook owns fetch errors. Its background polling must never
      // activate the native pull-to-refresh control or move the task feed.
      await Promise.all([refresh(), collaboration.refresh()]);
    } finally {
      if (manualRequest.current === request) {
        manualRequest.current = null;
        setManualRefreshing(false);
      }
    }
  };
  // Large text retains one column rather than squeezing task content.
  const columns = waterfall && width >= 360 && fontScale <= 1.3 ? 2 : 1;
  return (
    <FlatList
      key={columns}
      testID="miao-task-feed"
      accessibilityLabel={textFor(
        language,
        'Agent 任务动态',
        'Agent task activity',
      )}
      data={entries}
      keyExtractor={entry => `${entry.kind}:${entry.task.id}`}
      numColumns={columns}
      style={[s.screen, { backgroundColor: feedBackground }]}
      contentContainerStyle={[s.content, columns === 2 && s.gridContent]}
      columnWrapperStyle={columns === 2 ? s.columns : undefined}
      refreshControl={
        <RefreshControl
          refreshing={manualRefreshing}
          onRefresh={refreshManually}
          tintColor={colors.secondaryText}
        />
      }
      // Prototype `page-miao` starts straight at the first task card: no page
      // title. Only a read failure still needs a block above the feed.
      ListHeaderComponent={
        loadError ? (
          <View style={s.error} accessibilityLiveRegion="polite">
            <WorkspaceState
              palette={colors}
              tone="error"
              title={loadError}
              retryLabel={textFor(
                language,
                '重试读取任务',
                'Retry loading tasks',
              )}
              onRetry={() => {
                refresh();
                collaboration.refresh();
              }}
            />
          </View>
        ) : null
      }
      ItemSeparatorComponent={columns === 1 ? TaskCardGap : null}
      ListEmptyComponent={
        <View style={s.empty} accessibilityLiveRegion="polite">
          {!allLoaded && !loadError ? (
            <WorkspaceState
              palette={colors}
              busy
              title={textFor(language, '正在读取任务…', 'Loading tasks…')}
            />
          ) : !loadError ? (
            <WorkspaceState
              palette={colors}
              title={textFor(
                language,
                '还没有任务动态',
                'No task activity yet',
              )}
              description={textFor(
                language,
                '告诉妙管家你想做什么，进展与成果会留在这里。',
                'Tell the assistant what you want to do. Follow the work and results here.',
              )}
            />
          ) : null}
        </View>
      }
      ListFooterComponent={
        tasks.length === 30 ? (
          <Text style={[s.footer, { color: colors.secondaryText }]}>
            {textFor(
              language,
              '显示最近 30 项任务',
              'Showing the latest 30 tasks',
            )}
          </Text>
        ) : null
      }
      renderItem={({ item }) => {
        if (item.kind === 'workspace')
          return (
            <AgentWorkspaceCard
              workspace={item.task}
              agents={agents}
              palette={colors}
              language={language}
              grid={columns === 2}
              onOpen={() => onOpenWorkspace?.(item.task)}
            />
          );
        const task = item.task;
        return (
          <MiaoTaskCard
            testID={`miao-task-${task.id}`}
            object={{
              kind: 'ai-task',
              id: task.id,
              title: task.goal,
              scene: {
                page: 'miao.feed',
                label: textFor(
                  language,
                  '妙 · 任务动态',
                  'Miao · Task activity',
                ),
                module: {
                  key: 'task-feed',
                  label: textFor(language, '任务动态', 'Task activity'),
                },
                task: {
                  id: task.id,
                  goal: task.goal,
                  status: task.status,
                  phase: task.phase,
                  agentId: task.agentId,
                  revision: task.revision,
                  inputMessageId: task.inputMessageId,
                },
              },
            }}
            goal={
              task.goal.trim() ||
              textFor(
                language,
                '原任务内容已不可用',
                'Original task content is unavailable',
              )
            }
            status={taskStatusLabel(task.status, language)}
            detail={
              task.status === 'cancelled'
                ? null
                : task.status === 'running'
                ? taskPhaseLabel(task.phase, language)
                : task.artifacts[0]?.title
            }
            participantIds={[task.agentId]}
            agents={agents}
            grid={columns === 2}
            failed={Boolean(task.error)}
            palette={colors}
            language={language}
            openLabel={textFor(language, '查看任务', 'View task')}
            accessibilityLabel={
              task.goal.trim() ||
              textFor(
                language,
                '原任务内容已不可用',
                'Original task content is unavailable',
              )
            }
            onOpen={() => onOpenTask(task)}
          />
        );
      }}
    />
  );
}

/** Prototype `.task-card + .task-card { margin-top: 3px }` for the 1-column feed. */
function TaskCardGap() {
  return <View style={s.gap} />;
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  // Prototype `.task-feed`: 28px top, 4px sides — each card carries its own
  // 18px padding, so the feed itself stays nearly edge to edge.
  content: {
    flexGrow: 1,
    paddingTop: 28,
    paddingHorizontal: 4,
    paddingBottom: 180,
  },
  gridContent: { gap: workspaceTokens.space.sm },
  columns: { gap: workspaceTokens.space.sm },
  // Prototype `.task-card + .task-card { margin-top: 3px }`.
  gap: { height: 3 },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
    gap: 9,
  },
  error: { padding: workspaceTokens.space.md },
  footer: { fontSize: 11, textAlign: 'center', paddingTop: 18 },
});
