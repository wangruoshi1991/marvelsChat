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
import { displayText, textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceState, workspaceTokens } from '../../shared/workspaceUi';
import { useAITasks } from '../ai/useAITasks';
import { taskPhaseLabel, taskStatusLabel } from '../ai/taskPresentation';
import { MiaoTaskCard } from './MiaoTaskCard';
import { MiaoCardViewState } from './miaoCardState';
import { miaoFeedEntryId, miaoFeedRows, MiaoFeedEntry } from './miaoFeedRows';
import { relativeTimeText } from '../messages/messageUtils';
export { MiaoTaskAgent } from './MiaoTaskAgent';
import { Language } from '../session/sessionTypes';
import { v6Palette } from '../../shared/v6Palette';
import type { UIPreferences } from '../ui/uiPreferenceTypes';
import { isUIModuleVisible, uiFontSize, uiRowGap } from '../ui/uiPreferences';

export function MiaoTaskFeed({
  token,
  active,
  palette,
  language,
  agents,
  waterfall,
  voiceMenuExpanded = false,
  onOpenTask,
  onOpenWorkspace,
  onOpenAgentParticipant,
  uiPreferences,
}: {
  token: string;
  active: boolean;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  waterfall: boolean;
  voiceMenuExpanded?: boolean;
  onOpenTask: (task: AITaskDTO) => void;
  onOpenWorkspace?: (workspace: AgentWorkspace) => void;
  onOpenAgentParticipant?: (
    workspace: AgentWorkspace,
    step: AgentWorkspace['steps'][number],
  ) => void;
  uiPreferences?: UIPreferences;
}) {
  const colors = v6Palette(palette);
  const { width, fontScale } = useWindowDimensions();
  const miaoRowGap = uiRowGap(uiPreferences, 'miao');
  const feedVisible = isUIModuleVisible(uiPreferences, 'miao', 'taskFeed');
  const { tasks, hasLoaded, error, refresh } = useAITasks({
    token,
    active: active && feedVisible,
  });
  const collaboration = useAgentWorkspaces({
    token,
    active: active && feedVisible && Boolean(onOpenWorkspace),
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
  }, [active, token, feedVisible]);
  const refreshManually = async () => {
    if (!token || !active || !feedVisible || manualRequest.current) return;
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
  // Local presentation belongs to the account and entry, not the row. Row
  // regrouping or polling snapshots must not collapse an expanded card.
  const currentToken = useRef(token);
  currentToken.current = token;
  const [presentation, setPresentation] = useState<{
    token: string;
    states: Record<string, MiaoCardViewState>;
  }>({ token, states: {} });
  useEffect(() => {
    setPresentation({ token, states: {} });
  }, [token]);
  const cardStates = presentation.token === token ? presentation.states : {};
  const updateCardState = (id: string, next: MiaoCardViewState) => {
    if (currentToken.current !== token) return;
    setPresentation(previous => ({
      token,
      states: {
        ...(previous.token === token ? previous.states : {}),
        [id]: next,
      },
    }));
  };
  const rows = miaoFeedRows(entries, columns, cardStates);
  const renderEntry = (item: MiaoFeedEntry, grid: boolean) => {
    if (item.kind === 'workspace')
      return (
        <AgentWorkspaceCard
          viewState={cardStates[miaoFeedEntryId(item)] || 'summary'}
          onViewStateChange={next =>
            updateCardState(miaoFeedEntryId(item), next)
          }
          workspace={item.task}
          token={token}
          active={active}
          agents={agents}
          palette={colors}
          language={language}
          grid={grid}
          uiPreferences={uiPreferences}
          onOpen={() => onOpenWorkspace?.(item.task)}
          onOpenParticipant={step => onOpenAgentParticipant?.(item.task, step)}
        />
      );
    const task = item.task;
    return (
      <MiaoTaskCard
        viewState={cardStates[miaoFeedEntryId(item)] || 'summary'}
        onViewStateChange={next => updateCardState(miaoFeedEntryId(item), next)}
        active={active}
        testID={`miao-task-${task.id}`}
        object={{
          kind: 'ai-task',
          id: task.id,
          title: task.goal,
          scene: {
            page: 'miao.feed',
            label: textFor(language, '妙 · 任务动态', 'Miao · Task activity'),
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
        updatedLabel={displayText(language, relativeTimeText(task.updatedAt))}
        detail={
          task.status === 'cancelled'
            ? null
            : task.status === 'running'
            ? taskPhaseLabel(task.phase, language)
            : task.artifacts[0]?.title
        }
        participantIds={[task.agentId]}
        agents={agents}
        grid={grid}
        failed={Boolean(task.error)}
        uiPreferences={uiPreferences}
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
  };
  if (!feedVisible) {
    return (
      <View
        testID="miao-task-feed-hidden"
        style={[s.empty, { backgroundColor: colors.background }]}
      >
        <Text
          style={{
            color: colors.secondaryText,
            fontSize: uiFontSize(uiPreferences, 14),
          }}
        >
          {textFor(
            language,
            '此模块已隐藏，可在设置中恢复默认界面。',
            'This section is hidden. Restore the default interface in Settings.',
          )}
        </Text>
      </View>
    );
  }
  return (
    <FlatList
      testID="miao-task-feed"
      accessibilityLabel={textFor(
        language,
        'Agent 任务动态',
        'Agent task activity',
      )}
      data={rows}
      keyExtractor={row => row.key}
      numColumns={1}
      style={[
        s.screen,
        { backgroundColor: colors.background },
        voiceMenuExpanded && s.voiceMenuExpanded,
      ]}
      contentContainerStyle={[
        s.content,
        columns === 2 && s.gridContent,
        { gap: miaoRowGap },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={manualRefreshing}
          onRefresh={refreshManually}
          tintColor={colors.secondaryText}
        />
      }
      // Keep the V20 page title above the live task feed; errors remain
      // explicit below it rather than replacing the page context.
      ListHeaderComponent={
        <View>
          <Text
            style={[
              s.title,
              { color: colors.text, fontSize: uiFontSize(uiPreferences, 19) },
            ]}
          >
            {textFor(language, '任务实时动态', 'Live task activity')}
          </Text>
          {loadError ? (
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
          ) : null}
        </View>
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
                '告诉 Agent 你想做什么，执行进展与成果会留在这里。',
                'Tell an Agent what you want to do. Follow task progress and results here.',
              )}
            />
          ) : null}
        </View>
      }
      ListFooterComponent={
        tasks.length === 30 || collaboration.workspaces.length === 30 ? (
          <Text style={[s.footer, { color: colors.secondaryText }]}>
            {textFor(
              language,
              '分别显示最近 30 项 Agent 任务和历史任务',
              'Showing up to 30 recent Agent tasks and 30 legacy tasks',
            )}
          </Text>
        ) : null
      }
      renderItem={({ item: row }) => (
        <View testID="miao-feed-row" style={[s.row, { gap: miaoRowGap }]}>
          {row.entries.map(entry => (
            <View key={miaoFeedEntryId(entry)} style={s.cell}>
              {renderEntry(entry, !row.fullWidth)}
            </View>
          ))}
          {!row.fullWidth && row.entries.length === 1 ? (
            <View style={s.cell} />
          ) : null}
        </View>
      )}
    />
  );
}

/** Prototype `.task-card + .task-card { margin-top: 3px }` for the 1-column feed. */
function TaskCardGap() {
  return <View style={s.gap} />;
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  voiceMenuExpanded: { opacity: 0.72 },
  // V20 `.home-briefs`: 8px top, 13px sides. Cards carry their own 18px
  // padding, while the title has its separate 17px inset.
  content: {
    flexGrow: 1,
    paddingTop: 8,
    paddingHorizontal: 13,
    paddingBottom: 180,
  },
  title: {
    fontSize: 19,
    lineHeight: 27,
    fontWeight: '600',
    marginHorizontal: 17,
    marginBottom: 14,
  },
  gridContent: { gap: workspaceTokens.space.sm },
  row: { flexDirection: 'row', alignItems: 'flex-start' },
  cell: { flex: 1, minWidth: 0 },
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
