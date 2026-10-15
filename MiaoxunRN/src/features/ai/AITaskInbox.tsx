import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ChevronRight, RefreshCw } from 'lucide-react-native';
import { AgentDTO } from '../../models/api';
import { AITaskDTO } from '../../models/aiTask';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { AgentIconAvatar } from '../messages/AgentIconAvatar';
import { Language } from '../session/sessionTypes';
import { TaskStatus } from './AIInteraction';
import { useAITasks } from './useAITasks';

type AITaskInboxProps = {
  token: string;
  active: boolean;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  onOpenTask: (task: AITaskDTO) => void;
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
}: AITaskInboxProps) {
  const { tasks, loading, hasLoaded, error, refresh } = useAITasks({
    token,
    active,
  });
  const initialLoading = Boolean(token) && !hasLoaded && !error;
  return (
    <FlatList
      testID="ai-task-inbox"
      data={tasks}
      keyExtractor={task => task.id}
      style={[s.list, { backgroundColor: palette.background }]}
      contentContainerStyle={s.content}
      ListHeaderComponent={
        token ? (
          <View style={s.header}>
            <View style={s.headerRow}>
              <Text style={[s.caption, { color: palette.secondaryText }]}>
                {textFor(language, '最近任务', 'Recent tasks')}
              </Text>
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
                    ? '相册查询和建站任务会显示在这里。'
                    : '你的任务状态和成果会随账号保存。',
                  token
                    ? 'Album searches and site tasks will appear here.'
                    : 'Task progress and results are saved to your account.',
                )}
              </Text>
            </>
          ) : null}
        </View>
      }
      renderItem={({ item: task }) => {
        const agent = agents.find(item => item.key === task.agentId);
        const agentName =
          agent?.name ||
          textFor(
            language,
            task.kind === 'site_draft' ? '建站 Agent' : '相册管理 Agent',
            task.kind === 'site_draft' ? 'Site Agent' : 'Album Agent',
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
                category={agent?.category}
                identity={agent?.identity || null}
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
  header: { paddingHorizontal: 9, paddingBottom: 8 },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
