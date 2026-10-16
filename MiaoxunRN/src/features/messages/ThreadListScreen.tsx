import React, { useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  Plus,
  Search,
} from 'lucide-react-native';
import { AgentDTO } from '../../models/api';
import { AITaskDTO } from '../../models/aiTask';
import { displayText, textFor } from '../../shared/i18n';
import { isLightPalette, Palette } from '../../shared/theme';
import { workspacePalette } from '../../shared/workspacePalette';
import {
  ChatThread,
  Language,
  useMiaoxunSession,
} from '../session/useMiaoxunSession';
import { NoticeList } from './NoticeList';
import { MessageTab, UserAvatarRenderer } from './messageTypes';
import { relativeTimeText } from './messageUtils';
import { AgentIconAvatar } from './AgentIconAvatar';
import { useAIAssist } from '../assist/AIAssistProvider';
import { AITaskInbox } from '../ai/AITaskInbox';
import { agentReplyPresentation } from './agentReplyPresentation';
import { messageTextPreview } from './messageTextPresentation';

function ThreadSwipeRow({
  thread,
  palette,
  language,
  agents,
  renderUserAvatar,
  onOpenThread,
}: {
  thread: ChatThread;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  renderUserAvatar: UserAvatarRenderer;
  onOpenThread: (thread: ChatThread) => void;
}) {
  const agent = agents.find(item => item.key === thread.agentId);
  const latestMessage = thread.messages[thread.messages.length - 1];
  const previewMessage =
    latestMessage &&
    !latestMessage.deletedAt &&
    !latestMessage.recalledAt &&
    latestMessage.content === thread.lastContent
      ? latestMessage
      : null;
  const presentedContent = previewMessage
    ? agentReplyPresentation(previewMessage, thread.agentId, language)
    : thread.lastContent;
  const preview =
    previewMessage?.senderType === 'agent'
      ? messageTextPreview(presentedContent)
      : presentedContent;
  const translateX = useRef(new Animated.Value(0)).current;
  const opened = useRef(false);
  const { width } = useWindowDimensions();
  const reset = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [translateX]);
  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35,
        onPanResponderMove: (_event, gesture) =>
          translateX.setValue(Math.max(Math.min(gesture.dx, 0), -width * 0.46)),
        onPanResponderRelease: (_event, gesture) => {
          if (
            (gesture.dx <= -72 || gesture.vx <= -0.55) &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
          ) {
            if (opened.current) return;
            opened.current = true;
            Animated.timing(translateX, {
              toValue: -width,
              duration: 180,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) onOpenThread(thread);
              translateX.setValue(0);
              opened.current = false;
            });
          } else reset();
        },
        onPanResponderTerminate: reset,
      }),
    [onOpenThread, reset, thread, translateX, width],
  );
  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={{ transform: [{ translateX }] }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={displayText(language, thread.title)}
        onPress={() => onOpenThread(thread)}
        style={({ pressed }) => [
          s.thread,
          {
            backgroundColor: pressed ? palette.soft : palette.surface,
            borderColor: palette.border,
          },
        ]}
      >
        {thread.agentId ? (
          <View style={s.agentAvatar}>
            <View style={s.scaledAvatar}>
              <AgentIconAvatar
                agentId={thread.agentId}
                category={agent?.category}
                identity={agent?.identity || null}
                palette={palette}
              />
            </View>
          </View>
        ) : (
          renderUserAvatar({
            text: thread.avatarText,
            config: thread.avatarConfig || undefined,
            size: 44,
          })
        )}
        <View style={s.threadMain}>
          <Text
            numberOfLines={1}
            style={[s.threadTitle, { color: palette.text }]}
          >
            {displayText(language, thread.title)}
          </Text>
          <Text
            numberOfLines={1}
            style={[s.preview, { color: palette.secondaryText }]}
          >
            {displayText(language, preview) ||
              textFor(language, '暂无消息', 'No messages yet')}
          </Text>
        </View>
        <View style={s.trailing}>
          <Text style={[s.time, { color: palette.secondaryText }]}>
            {relativeTimeText(thread.lastMessageAt)}
          </Text>
          {thread.unreadCount > 0 ? (
            <View
              style={[
                s.badge,
                {
                  backgroundColor: thread.muted
                    ? palette.secondaryText
                    : palette.text,
                },
              ]}
            >
              <Text style={[s.badgeText, { color: palette.surface }]}>
                {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ThreadListScreen({
  token = '',
  active = true,
  palette,
  language,
  threads,
  agents,
  notices,
  unreadNoticeCount,
  selectedMessageTab,
  renderUserAvatar,
  onOpenThread,
  onOpenMessageActions,
  onOpenSearch,
  onSelectMessageTab,
  onMarkNotificationRead,
  onAcceptFriendRequest,
  onRejectFriendRequest,
  onOpenSecondFloor,
  onOpenTask,
}: {
  token?: string;
  active?: boolean;
  palette: Palette;
  language: Language;
  threads: ChatThread[];
  agents: AgentDTO[];
  notices: ReturnType<typeof useMiaoxunSession>['notices'];
  unreadNoticeCount: number;
  selectedMessageTab: MessageTab;
  renderUserAvatar: UserAvatarRenderer;
  onOpenThread: (thread: ChatThread) => void;
  onOpenMessageActions: () => void;
  onOpenSearch: () => void;
  onSelectMessageTab: (tab: MessageTab) => void;
  onMarkNotificationRead: (id: string) => Promise<void>;
  onAcceptFriendRequest: (id: string) => Promise<void>;
  onRejectFriendRequest: (id: string) => Promise<void>;
  onOpenSecondFloor?: () => void;
  onOpenTask?: (task: AITaskDTO) => void;
}) {
  const assist = useAIAssist();
  const colors = useMemo(() => workspacePalette(palette), [palette]);
  // Light mode paints the page gradient behind the tabs, so the list must not
  // cover it with a flat fill; dark mode keeps its own background.
  const lightTheme = isLightPalette(palette);
  const pageBackground = lightTheme ? 'transparent' : colors.background;
  const { height } = useWindowDimensions();
  const scrollOffset = useRef(0);
  const pullStartAtTop = useRef(false);
  const opening = useRef(false);
  const pullOffset = useRef(new Animated.Value(0)).current;
  const resetPull = useCallback(() => {
    Animated.spring(pullOffset, {
      toValue: 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 3,
    }).start();
  }, [pullOffset]);
  const pullResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: () => {
          pullStartAtTop.current = scrollOffset.current <= 0;
          return false;
        },
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          Boolean(onOpenSecondFloor) &&
          !opening.current &&
          !assist.isActive &&
          selectedMessageTab === 'chat' &&
          pullStartAtTop.current &&
          gesture.dy > 12 &&
          gesture.dy > Math.abs(gesture.dx) * 1.4,
        onPanResponderMove: (_event, gesture) =>
          pullOffset.setValue(Math.min(132, Math.max(0, gesture.dy * 0.56))),
        onPanResponderRelease: (_event, gesture) => {
          if (
            gesture.dy * 0.56 >= 86 &&
            gesture.dy > Math.abs(gesture.dx) * 1.4
          ) {
            opening.current = true;
            Animated.timing(pullOffset, {
              toValue: height,
              duration: 240,
              useNativeDriver: true,
            }).start(({ finished }) => {
              opening.current = false;
              if (finished) onOpenSecondFloor?.();
            });
          } else resetPull();
        },
        onPanResponderTerminate: resetPull,
      }),
    [
      assist.isActive,
      height,
      onOpenSecondFloor,
      pullOffset,
      resetPull,
      selectedMessageTab,
    ],
  );
  React.useEffect(() => {
    scrollOffset.current = 0;
  }, [selectedMessageTab]);
  const visibleThreads = threads.filter(
    thread => thread.agentId !== 'media-retrieval',
  );
  const unread = visibleThreads.reduce(
    (total, thread) => total + thread.unreadCount,
    0,
  );
  const noticeMode = selectedMessageTab === 'notice';
  return (
    <View
      {...pullResponder.panHandlers}
      testID="messages-pull-surface"
      style={[s.screen, { backgroundColor: pageBackground }]}
    >
      <Animated.View
        pointerEvents="none"
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={[
          s.pullCue,
          {
            opacity: pullOffset.interpolate({
              inputRange: [0, 28, 80],
              outputRange: [0, 0.5, 1],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <ChevronDown color={colors.secondaryText} size={18} />
      </Animated.View>
      <Animated.View
        style={[
          s.screen,
          {
            backgroundColor: pageBackground,
            transform: [{ translateY: pullOffset }],
          },
        ]}
      >
        <View style={s.topBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              noticeMode ? '返回对话' : '新建',
              noticeMode ? 'Back to conversations' : 'New',
            )}
            accessibilityActions={
              onOpenSecondFloor && !noticeMode
                ? [
                    {
                      name: 'openSecondFloor',
                      label: textFor(language, '打开二楼', 'Open second floor'),
                    },
                  ]
                : undefined
            }
            onAccessibilityAction={event => {
              if (event.nativeEvent.actionName === 'openSecondFloor')
                onOpenSecondFloor?.();
            }}
            hitSlop={4}
            onPress={() =>
              noticeMode ? onSelectMessageTab('chat') : onOpenMessageActions()
            }
            style={[
              s.iconButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            {noticeMode ? (
              <ArrowLeft size={20} color={colors.text} />
            ) : (
              <Plus size={20} color={colors.text} />
            )}
          </Pressable>
          {noticeMode ? (
            <Text
              accessibilityRole="header"
              style={[s.noticeTitle, { color: colors.text }]}
            >
              {textFor(language, '通知', 'Notices')}
            </Text>
          ) : (
            <View
              style={[
                s.switch,
                { backgroundColor: colors.soft, borderColor: colors.border },
              ]}
            >
              {(['chat', 'tasks'] as const).map(tab => {
                const selected = selectedMessageTab === tab;
                return (
                  <Pressable
                    key={tab}
                    accessibilityRole="tab"
                    accessibilityState={{ selected }}
                    onPress={() => onSelectMessageTab(tab)}
                    style={[
                      s.switchButton,
                      selected && { backgroundColor: colors.surface },
                    ]}
                  >
                    <Text
                      style={[
                        s.switchText,
                        {
                          color: selected ? colors.text : colors.secondaryText,
                        },
                      ]}
                    >
                      {textFor(
                        language,
                        tab === 'chat' ? '对话' : '任务',
                        tab === 'chat' ? 'Chats' : 'Tasks',
                      )}
                    </Text>
                    {tab === 'chat' && unread > 0 ? (
                      <View style={[s.badge, { backgroundColor: colors.text }]}>
                        <Text style={[s.badgeText, { color: colors.surface }]}>
                          {unread > 99 ? '99+' : unread}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(language, '搜索', 'Search')}
            hitSlop={4}
            onPress={onOpenSearch}
            style={[
              s.iconButton,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Search size={20} color={colors.text} />
          </Pressable>
        </View>
        {selectedMessageTab === 'chat' ? (
          <FlatList
            onScroll={event => {
              scrollOffset.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            data={visibleThreads}
            keyExtractor={item => item.id}
            contentContainerStyle={s.list}
            style={s.screen}
            ListHeaderComponent={
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={textFor(
                  language,
                  `应用通知，${unreadNoticeCount}条未读`,
                  `App notices, ${unreadNoticeCount} unread`,
                )}
                onPress={() => onSelectMessageTab('notice')}
                style={[
                  s.noticeRow,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Bell size={18} color={colors.secondaryText} />
                <Text style={[s.noticeLabel, { color: colors.secondaryText }]}>
                  {textFor(language, '应用通知', 'App notices')}
                </Text>
                {unreadNoticeCount > 0 ? (
                  <View style={[s.badge, { backgroundColor: colors.text }]}>
                    <Text style={[s.badgeText, { color: colors.surface }]}>
                      {unreadNoticeCount > 99 ? '99+' : unreadNoticeCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            }
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={{ color: colors.secondaryText }}>
                  {textFor(language, '还没有对话', 'No conversations yet')}
                </Text>
                <Text style={[s.preview, { color: colors.secondaryText }]}>
                  {textFor(
                    language,
                    '从左上角发起聊天，或前往我页添加 Agent。',
                    'Start a chat or add an agent in Me.',
                  )}
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <ThreadSwipeRow
                thread={item}
                palette={colors}
                language={language}
                agents={agents}
                renderUserAvatar={renderUserAvatar}
                onOpenThread={onOpenThread}
              />
            )}
          />
        ) : selectedMessageTab === 'tasks' ? (
          <AITaskInbox
            token={token}
            active={active}
            palette={colors}
            language={language}
            agents={agents}
            onOpenTask={task => onOpenTask?.(task)}
          />
        ) : (
          <NoticeList
            palette={colors}
            language={language}
            notices={notices}
            onMarkNotificationRead={onMarkNotificationRead}
            onAcceptFriendRequest={onAcceptFriendRequest}
            onRejectFriendRequest={onRejectFriendRequest}
          />
        )}
      </Animated.View>
    </View>
  );
}
const s = StyleSheet.create({
  screen: { flex: 1 },
  pullCue: { position: 'absolute', top: 22, alignSelf: 'center' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 14,
    paddingBottom: 10,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  switch: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    borderWidth: 1,
    borderRadius: 7,
    padding: 3,
  },
  switchButton: {
    flex: 1,
    minHeight: 34,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 5,
  },
  switchText: { fontSize: 14, fontWeight: '600' },
  noticeTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  list: { paddingHorizontal: 4, paddingBottom: 90, gap: 3 },
  thread: {
    minHeight: 76,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    borderWidth: 1,
    borderRadius: 7,
  },
  agentAvatar: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scaledAvatar: { transform: [{ scale: 44 / 54 }] },
  threadMain: { flex: 1, minWidth: 0, gap: 6 },
  threadTitle: { fontSize: 15, fontWeight: '600' },
  preview: { fontSize: 12, lineHeight: 18 },
  trailing: {
    minWidth: 30,
    alignItems: 'flex-end',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
    gap: 4,
  },
  time: { fontSize: 10 },
  badge: {
    minWidth: 18,
    minHeight: 18,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  noticeRow: {
    minHeight: 46,
    paddingHorizontal: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 7,
    borderWidth: 1,
  },
  noticeLabel: { flex: 1, fontSize: 12 },
  empty: { alignItems: 'center', padding: 28, paddingTop: 60, gap: 8 },
});
