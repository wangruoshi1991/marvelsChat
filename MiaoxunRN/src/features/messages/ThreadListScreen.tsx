import React, { useCallback, useEffect, useMemo, useRef } from 'react';
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
import { ArrowLeft, ChevronDown, Plus, Search } from 'lucide-react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { AgentDTO } from '../../models/api';
import { AITaskDTO } from '../../models/aiTask';
import { displayText, textFor } from '../../shared/i18n';
import { isLightPalette, Palette } from '../../shared/theme';
import { workspacePalette } from '../../shared/workspacePalette';
import { isV6Palette } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
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
import { AgentWorkspace } from '../../models/agentWorkspace';
import { agentReplyPresentation } from './agentReplyPresentation';
import { messageTextPreview } from './messageTextPresentation';
import type { UIPreferences } from '../ui/uiPreferenceTypes';
import { useStablePanResponder } from '../../shared/gestures/useStablePanResponder';
import {
  componentUIPreference,
  gestureUIPreference,
  isUIModuleVisible,
  uiButtonSlot,
  uiFontSize,
  uiRowGap,
} from '../ui/uiPreferences';

function pullDirectionMatches(
  direction: 'left' | 'right' | 'up' | 'down',
  dx: number,
  dy: number,
  distance: number,
) {
  const horizontal = Math.abs(dx) > Math.abs(dy) * 1.4;
  const vertical = Math.abs(dy) > Math.abs(dx) * 1.4;
  if (direction === 'left') return dx <= -distance && horizontal;
  if (direction === 'right') return dx >= distance && horizontal;
  if (direction === 'up') return dy <= -distance && vertical;
  return dy >= distance && vertical;
}

function pullVelocityMatches(
  direction: 'left' | 'right' | 'up' | 'down',
  vx: number,
  vy: number,
  threshold: number,
) {
  const horizontal = Math.abs(vx) > Math.abs(vy) * 1.4;
  const vertical = Math.abs(vy) > Math.abs(vx) * 1.4;
  if (direction === 'left') return vx <= -threshold && horizontal;
  if (direction === 'right') return vx >= threshold && horizontal;
  if (direction === 'up') return vy <= -threshold && vertical;
  return vy >= threshold && vertical;
}

function ThreadSwipeRow({
  thread,
  palette,
  language,
  agents,
  renderUserAvatar,
  onOpenThread,
  uiPreferences,
}: {
  thread: ChatThread;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  renderUserAvatar: UserAvatarRenderer;
  onOpenThread: (thread: ChatThread) => void;
  uiPreferences?: UIPreferences;
}) {
  const v6Theme = isV6Palette(palette);
  const xunTheme = isXunPalette(palette);
  const badgeText = v6Theme ? '#092f32' : palette.surface;
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
  useEffect(() => {
    // A bootstrap refresh can update a retained row while it is off-screen.
    // Do not carry its previous action-sheet swipe into the new snapshot.
    opened.current = false;
    translateX.stopAnimation();
    translateX.setValue(0);
  }, [thread.id, thread.muted, thread.pinned, thread.unreadCount, translateX]);
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
  const time = (
    <Text
      numberOfLines={1}
      style={[
        s.time,
        xunTheme && s.xunTime,
        xunTheme ? s.xunTimeColor : { color: palette.secondaryText },
      ]}
    >
      {relativeTimeText(thread.lastMessageAt)}
    </Text>
  );
  const unreadBadge =
    thread.unreadCount > 0 ? (
      <View
        style={[
          s.badge,
          xunTheme && s.xunUnread,
          {
            backgroundColor: thread.muted
              ? palette.secondaryText
              : v6Theme
              ? palette.mint
              : xunTheme
              ? '#ff484f'
              : palette.text,
          },
        ]}
      >
        <Text
          style={[
            s.badgeText,
            xunTheme && s.xunUnreadText,
            { color: badgeText },
          ]}
        >
          {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
        </Text>
      </View>
    ) : null;
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
          v6Theme && s.v6Thread,
          xunTheme && s.xunThread,
          xunTheme && thread.pinned && s.xunPinned,
          {
            backgroundColor: pressed
              ? palette.soft
              : v6Theme
              ? 'transparent'
              : xunTheme
              ? thread.pinned
                ? '#e7ebf2'
                : 'transparent'
              : palette.surface,
            borderColor: v6Theme || xunTheme ? 'transparent' : palette.border,
            borderRadius: uiPreferences?.surfaces.messages.cardRadius ?? 7,
          },
        ]}
      >
        {thread.agentId ? (
          <View style={s.agentAvatar}>
            <View style={xunTheme ? undefined : s.scaledAvatar}>
              <AgentIconAvatar
                agentId={thread.agentId}
                identity={
                  agent?.identity || {
                    status: 'unavailable',
                    code: 'AGENT_IDENTITY_CONTRACT_ERROR',
                    message: 'Agent identity contract unavailable.',
                  }
                }
                palette={palette}
                size={xunTheme ? 44 : undefined}
                variant={xunTheme ? 'xun' : undefined}
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
        <View style={[s.threadMain, xunTheme && s.xunThreadMain]}>
          <View style={xunTheme ? s.xunThreadTitleRow : undefined}>
            <Text
              numberOfLines={1}
              style={[
                s.threadTitle,
                xunTheme && s.xunThreadTitle,
                {
                  color: palette.text,
                  fontSize: uiFontSize(uiPreferences, 15),
                },
              ]}
            >
              {displayText(language, thread.title)}
            </Text>
            {xunTheme ? time : null}
          </View>
          <Text
            numberOfLines={1}
            style={[
              s.preview,
              xunTheme && s.xunPreview,
              xunTheme && thread.unreadCount > 0 && s.xunUnreadPreview,
              {
                color: palette.secondaryText,
                fontSize: uiFontSize(uiPreferences, 12),
              },
            ]}
          >
            {displayText(language, preview) ||
              textFor(language, '暂无消息', 'No messages yet')}
          </Text>
        </View>
        {xunTheme ? (
          unreadBadge
        ) : (
          <View style={s.trailing}>
            {time}
            {unreadBadge}
          </View>
        )}
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
  selectedMessageTab,
  renderUserAvatar,
  onOpenThread,
  onOpenMessageActions,
  messageActionsOpen: _messageActionsOpen = false,
  onOpenSearch,
  onSelectMessageTab,
  onMarkNotificationRead,
  onAcceptFriendRequest,
  onRejectFriendRequest,
  onOpenSecondFloor,
  onOpenTask,
  onOpenWorkspace,
  onOpenAgentParticipant,
  uiPreferences,
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
  onOpenMessageActions: (anchorTop?: number, pullHintVisible?: boolean) => void;
  messageActionsOpen?: boolean;
  onOpenSearch: () => void;
  onSelectMessageTab: (tab: MessageTab) => void;
  onMarkNotificationRead: (id: string) => Promise<void>;
  onAcceptFriendRequest: (id: string) => Promise<void>;
  onRejectFriendRequest: (id: string) => Promise<void>;
  onOpenSecondFloor?: () => void;
  onOpenTask?: (task: AITaskDTO) => void;
  onOpenWorkspace?: (workspace: AgentWorkspace) => void;
  onOpenAgentParticipant?: (
    workspace: AgentWorkspace,
    step: AgentWorkspace['steps'][number],
  ) => void;
  uiPreferences?: UIPreferences;
}) {
  const assist = useAIAssist();
  const v6Theme = isV6Palette(palette);
  const xunTheme = isXunPalette(palette);
  const colors = useMemo(
    () => (v6Theme || xunTheme ? palette : workspacePalette(palette)),
    [palette, v6Theme, xunTheme],
  );
  // Light mode paints the page gradient behind the tabs, so the list must not
  // cover it with a flat fill; dark mode keeps its own background.
  const lightTheme = isLightPalette(palette) || xunTheme;
  const pageBackground = xunTheme
    ? colors.background
    : lightTheme
    ? 'transparent'
    : colors.background;
  const badgeBackground = v6Theme
    ? colors.mint
    : xunTheme
    ? '#00c7cb'
    : colors.text;
  const badgeText = v6Theme ? '#092f32' : xunTheme ? '#151720' : colors.surface;
  const tabsBackground = v6Theme || xunTheme ? 'transparent' : colors.soft;
  const tabsBorder = v6Theme || xunTheme ? 'transparent' : colors.border;
  const selectedTabBackground = v6Theme
    ? '#3a4257'
    : xunTheme
    ? 'transparent'
    : colors.surface;
  const topActionThemeStyle = useMemo(
    () => ({
      backgroundColor: xunTheme ? 'transparent' : colors.surface,
      borderColor: xunTheme ? 'transparent' : colors.border,
    }),
    [colors.border, colors.surface, xunTheme],
  );
  const { height, width } = useWindowDimensions();
  const newActionPreference = componentUIPreference(
    uiPreferences,
    'messages',
    'xun.threadList.newThread',
  );
  const openSecondFloorPreference = componentUIPreference(
    uiPreferences,
    'messages',
    'xun.threadList.openSecondFloor',
  );
  const messageButtonScale = uiPreferences?.surfaces.messages.buttonScale ?? 1;
  const newActionScale = Math.max(
    0.8,
    Math.min(1.3, messageButtonScale * (newActionPreference.sizeScale ?? 1)),
  );
  const messageRowGap = uiRowGap(uiPreferences, 'messages', xunTheme ? 0 : 3);
  const newActionSlot = uiButtonSlot(
    uiPreferences,
    'messages',
    'newAction',
    'xun.threadList.newThread',
  );
  const pullGesture = gestureUIPreference(
    uiPreferences,
    'messages.pullToSecondFloor',
  );
  const supportedEntranceGesture =
    pullGesture.enabled && ['down', 'right'].includes(pullGesture.direction);
  const newButton = useRef<View>(null);
  const scrollOffset = useRef(0);
  const pullStartAtTop = useRef(false);
  const opening = useRef(false);
  const pullOffset = useRef(new Animated.Value(0)).current;
  const pullOffsetX = useRef(new Animated.Value(0)).current;
  const pullCueDistance = useRef(new Animated.Value(0)).current;
  const resetPull = useCallback(() => {
    Animated.parallel([
      Animated.spring(pullOffset, {
        toValue: 0,
        useNativeDriver: true,
        speed: 22,
        bounciness: 3,
      }),
      Animated.spring(pullOffsetX, {
        toValue: 0,
        useNativeDriver: true,
        speed: 22,
        bounciness: 3,
      }),
      Animated.spring(pullCueDistance, {
        toValue: 0,
        useNativeDriver: true,
        speed: 22,
        bounciness: 3,
      }),
    ]).start();
  }, [pullCueDistance, pullOffset, pullOffsetX]);
  const resetPullState = useCallback(() => {
    // The conversation list is retained while the root tab or a modal route
    // changes. Stop an interrupted entrance animation so a later return to
    // 讯 never exposes a translated list or a stale opening lock.
    opening.current = false;
    pullStartAtTop.current = false;
    pullOffset.stopAnimation();
    pullOffsetX.stopAnimation();
    pullCueDistance.stopAnimation();
    pullOffset.setValue(0);
    pullOffsetX.setValue(0);
    pullCueDistance.setValue(0);
  }, [pullCueDistance, pullOffset, pullOffsetX]);
  const pullResponder = useStablePanResponder(
    {
      onStartShouldSetPanResponderCapture: () => {
        pullStartAtTop.current = scrollOffset.current <= 0;
        return false;
      },
      onMoveShouldSetPanResponderCapture: (_event, gesture) =>
        Boolean(onOpenSecondFloor) &&
        supportedEntranceGesture &&
        !opening.current &&
        !assist.isActive &&
        selectedMessageTab === 'chat' &&
        pullStartAtTop.current &&
        (pullDirectionMatches(
          pullGesture.direction,
          gesture.dx,
          gesture.dy,
          10,
        ) ||
          pullVelocityMatches(
            pullGesture.direction,
            gesture.vx,
            gesture.vy,
            0.1,
          )),
      onPanResponderMove: (_event, gesture) =>
        (() => {
          const horizontal =
            pullGesture.direction === 'left' ||
            pullGesture.direction === 'right';
          const movement = horizontal ? gesture.dx : gesture.dy;
          const offset = Math.max(-150, Math.min(150, movement * 0.72));
          if (horizontal) {
            pullOffsetX.setValue(offset);
            pullOffset.setValue(0);
          } else {
            pullOffset.setValue(offset);
            pullOffsetX.setValue(0);
          }
          pullCueDistance.setValue(Math.abs(offset));
        })(),
      onPanResponderRelease: (_event, gesture) => {
        if (
          pullGesture.enabled &&
          (pullDirectionMatches(
            pullGesture.direction,
            gesture.dx,
            gesture.dy,
            pullGesture.distance,
          ) ||
            pullVelocityMatches(
              pullGesture.direction,
              gesture.vx,
              gesture.vy,
              pullGesture.velocityThreshold,
            ))
        ) {
          opening.current = true;
          const horizontal =
            pullGesture.direction === 'left' ||
            pullGesture.direction === 'right';
          const target =
            pullGesture.direction === 'left'
              ? -width
              : pullGesture.direction === 'right'
              ? width
              : pullGesture.direction === 'up'
              ? -height
              : height;
          Animated.parallel([
            Animated.timing(pullOffsetX, {
              toValue: horizontal ? target : 0,
              duration: pullGesture.animationMs,
              useNativeDriver: true,
            }),
            Animated.timing(pullOffset, {
              toValue: horizontal ? 0 : target,
              duration: pullGesture.animationMs,
              useNativeDriver: true,
            }),
            Animated.timing(pullCueDistance, {
              toValue: Math.max(width, height),
              duration: pullGesture.animationMs,
              useNativeDriver: true,
            }),
          ]).start(({ finished }) => {
            opening.current = false;
            if (finished) onOpenSecondFloor?.();
          });
        } else resetPull();
      },
      onPanResponderTerminate: resetPull,
    },
    active,
  );
  React.useEffect(() => {
    scrollOffset.current = 0;
    resetPullState();
  }, [active, resetPullState, selectedMessageTab]);
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
            opacity: pullCueDistance.interpolate({
              inputRange: [0, 28, 80],
              outputRange: [0, 0.5, 1],
              extrapolate: 'clamp',
            }),
            transform: [
              {
                rotate:
                  pullGesture.direction === 'up'
                    ? '180deg'
                    : pullGesture.direction === 'left'
                    ? '-90deg'
                    : pullGesture.direction === 'right'
                    ? '90deg'
                    : '0deg',
              },
            ],
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
            transform: [
              { translateX: pullOffsetX },
              { translateY: pullOffset },
            ],
          },
        ]}
      >
        <View
          style={[
            s.topBar,
            xunTheme && s.xunTopBar,
            { gap: Math.max(4, messageRowGap) },
          ]}
        >
          {!noticeMode &&
          !supportedEntranceGesture &&
          onOpenSecondFloor &&
          openSecondFloorPreference.visible !== false ? (
            <Pressable
              testID="second-floor-fallback-entry"
              accessibilityRole="button"
              accessibilityLabel={
                openSecondFloorPreference.label ||
                textFor(language, '打开二楼', 'Open second floor')
              }
              onPress={onOpenSecondFloor}
              style={[s.iconButton, s.secondFloorFallback]}
            >
              <Text
                style={{
                  color: colors.text,
                  fontSize: uiFontSize(uiPreferences, 12),
                }}
              >
                {openSecondFloorPreference.label ||
                  textFor(language, '二楼', 'Second floor')}
              </Text>
            </Pressable>
          ) : null}
          {noticeMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                '返回对话',
                'Back to conversations',
              )}
              hitSlop={4}
              onPress={() => onSelectMessageTab('chat')}
              style={[
                s.iconButton,
                { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <ArrowLeft size={20} color={colors.text} />
            </Pressable>
          ) : !xunTheme ? (
            <View style={s.topBarSpacer} />
          ) : null}
          {noticeMode ? (
            <Text
              accessibilityRole="header"
              style={[s.noticeTitle, { color: colors.text }]}
            >
              {textFor(language, '通知', 'Notices')}
            </Text>
          ) : isUIModuleVisible(uiPreferences, 'messages', 'tabs') ? (
            <View
              style={[
                s.switch,
                xunTheme && s.xunSwitch,
                {
                  backgroundColor: tabsBackground,
                  borderColor: tabsBorder,
                },
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
                      xunTheme && s.xunSwitchButton,
                      selected && {
                        backgroundColor: selectedTabBackground,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.switchText,
                        xunTheme &&
                          (selected
                            ? s.xunSwitchText
                            : s.xunSwitchInactiveText),
                        {
                          color: selected ? colors.text : colors.secondaryText,
                          fontSize: uiFontSize(
                            uiPreferences,
                            xunTheme ? 16 : 14,
                          ),
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
                      <View
                        style={[
                          s.badge,
                          xunTheme && s.xunTabBadge,
                          {
                            backgroundColor: xunTheme
                              ? selected
                                ? '#00c7cb'
                                : '#cddfe4'
                              : badgeBackground,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            s.badgeText,
                            xunTheme && s.xunTabBadgeText,
                            { color: badgeText },
                          ]}
                        >
                          {unread > 99 ? '99+' : unread}
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          {noticeMode ? (
            <View style={s.topBarSpacer} />
          ) : newActionPreference.visible !== false ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                newActionPreference.label || textFor(language, '新建', 'New')
              }
              ref={newButton}
              accessibilityActions={
                onOpenSecondFloor && openSecondFloorPreference.visible !== false
                  ? [
                      {
                        name: 'openSecondFloor',
                        label:
                          openSecondFloorPreference.label ||
                          textFor(language, '打开二楼', 'Open second floor'),
                      },
                    ]
                  : undefined
              }
              onAccessibilityAction={event => {
                if (
                  event.nativeEvent.actionName === 'openSecondFloor' &&
                  openSecondFloorPreference.visible !== false
                )
                  onOpenSecondFloor?.();
              }}
              hitSlop={4}
              onPress={() => {
                if (!newButton.current) {
                  onOpenMessageActions(undefined, false);
                  return;
                }
                newButton.current.measureInWindow(
                  (_x, y, _width, buttonHeight) =>
                    onOpenMessageActions(y + buttonHeight - 6, false),
                );
              }}
              style={[
                s.iconButton,
                xunTheme &&
                  (newActionSlot === undefined ||
                    newActionSlot === 'topRight') &&
                  s.xunTopAction,
                newActionSlot === 'headerRight' && s.headerRightAction,
                newActionSlot === 'topRight' && s.topRightAction,
                topActionThemeStyle,
                s.minimumTouchTarget,
                {
                  width: Math.max(
                    newActionPreference.label ? 64 : 44,
                    44 * newActionScale,
                  ),
                  height: Math.max(44, 44 * newActionScale),
                  borderRadius:
                    uiPreferences?.surfaces.messages.buttonRadius ?? 7,
                },
              ]}
            >
              {newActionPreference.icon ? (
                <Text
                  style={[
                    s.newActionIcon,
                    { color: colors.text, fontSize: 17 * newActionScale },
                  ]}
                >
                  {newActionPreference.icon}
                </Text>
              ) : xunTheme ? (
                <Svg
                  height={25 * newActionScale}
                  viewBox="0 0 24 24"
                  width={25 * newActionScale}
                >
                  <Path
                    d="M12 4v16M4 12h16"
                    fill="none"
                    stroke={colors.text}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.3}
                  />
                </Svg>
              ) : (
                <Plus size={20 * newActionScale} color={colors.text} />
              )}
              {newActionPreference.label ? (
                <Text
                  numberOfLines={1}
                  style={[
                    s.newActionLabel,
                    {
                      color: colors.text,
                      fontSize: uiFontSize(uiPreferences, 10),
                    },
                  ]}
                >
                  {newActionPreference.label}
                </Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>
        {!noticeMode &&
        (!xunTheme || selectedMessageTab === 'chat') &&
        isUIModuleVisible(uiPreferences, 'messages', 'composer') ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={textFor(
              language,
              '搜索对话、任务或Agent',
              'Search conversations, tasks, or agents',
            )}
            onPress={onOpenSearch}
            style={[
              s.searchBar,
              {
                backgroundColor: colors.surface,
                borderColor: colors.border,
                borderRadius: uiPreferences?.surfaces.messages.cardRadius ?? 30,
              },
            ]}
          >
            {xunTheme ? (
              <Svg height={20} viewBox="0 0 24 24" width={20}>
                <Circle
                  cx={10}
                  cy={10}
                  fill="none"
                  r={6}
                  stroke="#a5b7bd"
                  strokeWidth={1.9}
                />
                <Path
                  d="m15 15 5 5"
                  fill="none"
                  stroke="#a5b7bd"
                  strokeLinecap="round"
                  strokeWidth={1.9}
                />
              </Svg>
            ) : (
              <Search size={20} color={colors.secondaryText} />
            )}
            <Text
              style={[
                s.searchPlaceholder,
                {
                  color: colors.secondaryText,
                  fontSize: uiFontSize(uiPreferences, 13),
                },
              ]}
            >
              {textFor(
                language,
                '搜索对话、任务或Agent',
                'Search conversations, tasks, or agents',
              )}
            </Text>
          </Pressable>
        ) : null}
        {selectedMessageTab === 'chat' &&
        isUIModuleVisible(uiPreferences, 'messages', 'threadList') ? (
          <FlatList
            // Recreate swipe rows when the retained 讯 surface is revisited
            // or its tab changes. Each row owns an animated swipe offset and
            // must not carry an open action state into a different surface.
            key={`chat-list:${selectedMessageTab}:${
              active ? 'active' : 'inactive'
            }`}
            onScroll={event => {
              scrollOffset.current = event.nativeEvent.contentOffset.y;
            }}
            scrollEventThrottle={16}
            showsVerticalScrollIndicator={false}
            data={visibleThreads}
            keyExtractor={item => item.id}
            contentContainerStyle={[
              s.list,
              xunTheme && s.xunList,
              { gap: messageRowGap },
            ]}
            style={s.screen}
            ListEmptyComponent={
              <View style={s.empty}>
                <Text style={{ color: colors.secondaryText }}>
                  {textFor(language, '还没有对话', 'No conversations yet')}
                </Text>
                <Text style={[s.preview, { color: colors.secondaryText }]}>
                  {textFor(
                    language,
                    '点击右上角 + 新建对话，或前往我页添加 Agent。',
                    'Tap + to start a conversation, or add an agent in Me.',
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
                uiPreferences={uiPreferences}
              />
            )}
          />
        ) : selectedMessageTab === 'tasks' &&
          isUIModuleVisible(uiPreferences, 'messages', 'taskInbox') ? (
          <AITaskInbox
            token={token}
            active={active}
            palette={colors}
            language={language}
            agents={agents}
            onOpenTask={task => onOpenTask?.(task)}
            onOpenWorkspace={onOpenWorkspace}
            onOpenAgentParticipant={onOpenAgentParticipant}
          />
        ) : noticeMode ? (
          <NoticeList
            palette={colors}
            language={language}
            notices={notices}
            onMarkNotificationRead={onMarkNotificationRead}
            onAcceptFriendRequest={onAcceptFriendRequest}
            onRejectFriendRequest={onRejectFriendRequest}
          />
        ) : (
          <View testID="messages-module-hidden" style={s.empty}>
            <Text style={{ color: colors.secondaryText }}>
              {textFor(
                language,
                '此模块已隐藏，可在设置中恢复默认界面。',
                'This section is hidden. Restore the default interface in Settings.',
              )}
            </Text>
          </View>
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
  topBarSpacer: { width: 40, height: 40 },
  xunTopBar: { height: 62, paddingTop: 3, paddingBottom: 0 },
  xunTopAction: {
    position: 'absolute',
    top: 16,
    right: 25,
    width: 25,
    height: 25,
    borderWidth: 0,
  },
  topRightAction: {
    alignSelf: 'flex-end',
  },
  headerRightAction: {
    marginLeft: 'auto',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  newActionIcon: { fontSize: 17 },
  minimumTouchTarget: { minWidth: 44, minHeight: 44 },
  newActionLabel: { maxWidth: '100%' },
  secondFloorFallback: {
    minWidth: 44,
    minHeight: 44,
    width: 'auto',
    paddingHorizontal: 8,
    maxWidth: 120,
  },
  switch: {
    flex: 1,
    flexDirection: 'row',
    gap: 3,
    borderWidth: 1,
    borderRadius: 7,
    padding: 3,
  },
  xunSwitch: {
    borderWidth: 0,
    padding: 0,
    gap: 23,
    justifyContent: 'center',
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
  xunSwitchButton: {
    flex: 0,
    minHeight: 34,
    borderRadius: 0,
    paddingHorizontal: 2,
  },
  switchText: { fontSize: 14, fontWeight: '600' },
  // The native rendering needs one point over V15's browser value to retain
  // the same visual size on device; the selected tab keeps the stronger tier.
  // V20 `.x3-tab`: 16px regular, with a modest 650 active weight. Native
  // only exposes the standard 600 tier, which keeps the same visual density.
  xunSwitchText: { fontSize: 16, lineHeight: 21, fontWeight: '600' },
  xunSwitchInactiveText: { fontSize: 16, lineHeight: 21, fontWeight: '400' },
  searchBar: {
    minHeight: 44,
    marginHorizontal: 14,
    marginTop: 9,
    marginBottom: 11,
    paddingHorizontal: 17,
    borderWidth: 1,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  searchPlaceholder: { fontSize: 13 },
  noticeTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  list: { paddingHorizontal: 4, paddingBottom: 90, gap: 3 },
  xunList: { paddingHorizontal: 0, paddingBottom: 90, gap: 0 },
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
  v6Thread: {
    borderWidth: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
  },
  xunThread: {
    alignItems: 'flex-start',
    borderWidth: 0,
    borderRadius: 0,
    minHeight: 79,
    paddingTop: 17,
    paddingBottom: 0,
    gap: 16,
  },
  xunPinned: { backgroundColor: '#e7ebf2' },
  xunThreadMain: {
    gap: 0,
    borderBottomColor: '#d4dde5',
    borderBottomWidth: 1,
    paddingBottom: 17,
  },
  xunThreadTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  xunThreadTitle: {
    flex: 1,
    lineHeight: 19.5,
    marginBottom: 8,
  },
  xunPreview: { lineHeight: 16.8, paddingRight: 5 },
  xunUnreadPreview: { paddingRight: 27 },
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
  xunTime: { flexShrink: 0, fontSize: 12 },
  xunTimeColor: { color: '#727272' },
  badge: {
    minWidth: 18,
    minHeight: 18,
    paddingHorizontal: 5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { fontSize: 10, fontWeight: '700' },
  xunUnread: {
    position: 'absolute',
    right: 14,
    top: 44,
    minWidth: 24,
    minHeight: 17,
    height: 17,
    borderRadius: 12,
  },
  xunUnreadText: { fontSize: 11, fontWeight: '400' },
  xunTabBadge: {
    position: 'absolute',
    right: -16,
    top: -1,
    minWidth: 25,
    height: 17,
    minHeight: 17,
    paddingHorizontal: 5,
    borderRadius: 15,
  },
  xunTabBadgeText: { fontSize: 12, fontWeight: '600' },
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
