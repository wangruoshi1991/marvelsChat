import React, { useCallback, useMemo, useRef } from 'react';
import {
  Animated,
  FlatList,
  Image,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {
  Defs,
  LinearGradient as SvgLinearGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import { messageIconAssets } from '../../assets/icons';
import { AgentDTO } from '../../models/api';
import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes } from '../../shared/theme';
import {
  ChatThread,
  Language,
  useMiaoxunSession,
} from '../session/useMiaoxunSession';
import { NoticeList } from './NoticeList';
import { MessageTab, UserAvatarRenderer } from './messageTypes';
import { relativeTimeText } from './messageUtils';
import { AgentIconAvatar } from './AgentIconAvatar';
import { resolveMessagePalette } from './messagePalette';

const chatSwipeOpenThreshold = -72;
const mutedUnreadColor = '#A8A8B0';

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
  const agent = thread.agentId
    ? agents.find(item => item.key === thread.agentId)
    : null;
  const agentIdentity = agent?.identity || null;
  const translateX = useRef(new Animated.Value(0)).current;
  const openedRef = useRef(false);
  const windowSize = useWindowDimensions();
  const isLightPalette = palette.text === palettes.light.text;
  const threadTitleColor = isLightPalette ? '#000000' : palette.text;
  const threadSecondaryColor = isLightPalette
    ? 'rgba(0,0,0,0.6)'
    : palette.secondaryText;

  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [translateX]);

  const openFromSwipe = useCallback(() => {
    if (openedRef.current) {
      return;
    }
    openedRef.current = true;
    Animated.timing(translateX, {
      toValue: -Math.max(windowSize.width, 320),
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      onOpenThread(thread);
      translateX.setValue(0);
      openedRef.current = false;
    });
  }, [onOpenThread, thread, translateX, windowSize.width]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35,
        onPanResponderMove: (_event, gesture) => {
          translateX.setValue(
            Math.max(
              Math.min(gesture.dx, 0),
              -Math.max(windowSize.width, 320) * 0.46,
            ),
          );
        },
        onPanResponderRelease: (_event, gesture) => {
          if (
            (gesture.dx <= chatSwipeOpenThreshold || gesture.vx <= -0.55) &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
          ) {
            openFromSwipe();
            return;
          }
          resetPosition();
        },
        onPanResponderTerminate: resetPosition,
      }),
    [openFromSwipe, resetPosition, translateX, windowSize.width],
  );

  return (
    <Animated.View
      {...panResponder.panHandlers}
      style={[
        { borderBottomColor: palette.border, transform: [{ translateX }] },
      ]}
    >
      <Pressable
        onPress={() => onOpenThread(thread)}
        style={[styles.threadRow, { borderBottomColor: palette.border }]}
      >
        <View style={styles.threadAvatarWrap}>
          {thread.agentId ? (
            <AgentIconAvatar
              agentId={thread.agentId}
              category={agent?.category}
              identity={agentIdentity}
              palette={palette}
            />
          ) : (
            renderUserAvatar({
              text: thread.avatarText,
              config: thread.avatarConfig || undefined,
            })
          )}
          {thread.unreadCount > 0 ? (
            <View
              style={[
                styles.unread,
                styles.threadAvatarUnread,
                {
                  backgroundColor: thread.muted
                    ? mutedUnreadColor
                    : palette.rose,
                  borderColor: palette.background,
                },
              ]}
            >
              <Text style={styles.unreadText}>
                {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.threadMain}>
          <Text
            numberOfLines={1}
            style={[styles.threadTitle, { color: threadTitleColor }]}
          >
            {displayText(language, thread.title)}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.threadPreview, { color: threadSecondaryColor }]}
          >
            {displayText(language, thread.lastContent) ||
              textFor(language, '暂无消息', 'No messages yet')}
          </Text>
        </View>
        <View style={styles.threadTrailing}>
          <Text style={[styles.threadTime, { color: threadSecondaryColor }]}>
            {relativeTimeText(thread.lastMessageAt)}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function ThreadListScreen({
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
}: {
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
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
  onAcceptFriendRequest: (requestId: string) => Promise<void>;
  onRejectFriendRequest: (requestId: string) => Promise<void>;
}) {
  const messagePalette = useMemo(
    () => resolveMessagePalette(palette),
    [palette],
  );
  const isLightPalette = palette.text === palettes.light.text;
  const unreadChatCount = useMemo(
    () => threads.reduce((total, thread) => total + thread.unreadCount, 0),
    [threads],
  );

  return (
    <View
      style={[styles.screen, { backgroundColor: messagePalette.background }]}
    >
      <View
        style={[
          styles.messageTopBar,
          {
            backgroundColor: messagePalette.soft,
            borderBottomColor: messagePalette.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '新建', 'New')}
          onPress={onOpenMessageActions}
          style={styles.messageHeaderIcon}
        >
          <Image
            source={messageIconAssets.actionAdd}
            style={styles.messageHeaderAddIcon}
            resizeMode="contain"
          />
        </Pressable>

        <View style={styles.messageTabGroup}>
          {[
            {
              label: textFor(language, '聊天', 'Chats'),
              value: 'chat' as const,
              badge: unreadChatCount,
            },
            {
              label: textFor(language, '通知', 'Notices'),
              value: 'notice' as const,
              badge: unreadNoticeCount,
            },
          ].map(option => {
            const selected = selectedMessageTab === option.value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="button"
                onPress={() => onSelectMessageTab(option.value)}
                style={styles.messageTabButton}
              >
                <Text
                  style={[
                    styles.messageTabText,
                    {
                      color: selected
                        ? messagePalette.text
                        : messagePalette.secondaryText,
                    },
                    selected && styles.messageTabTextActive,
                  ]}
                >
                  {option.label}
                </Text>
                {option.badge && option.badge > 0 ? (
                  <View
                    style={[
                      styles.messageTabBadge,
                      { backgroundColor: messagePalette.rose },
                    ]}
                  >
                    <Text style={styles.messageTabBadgeText}>
                      {option.badge > 99 ? '99+' : option.badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '搜索', 'Search')}
          onPress={onOpenSearch}
          style={styles.messageHeaderIcon}
        >
          <Image
            source={messageIconAssets.actionSearchContacts}
            style={styles.messageHeaderSearchIcon}
            resizeMode="contain"
          />
        </Pressable>
      </View>

      <View style={styles.messageContent}>
        {selectedMessageTab === 'chat' ? (
          <FlatList
            data={threads}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.threadList}
            style={styles.messageListViewport}
            renderItem={({ item }) => (
              <ThreadSwipeRow
                thread={item}
                palette={messagePalette}
                language={language}
                agents={agents}
                renderUserAvatar={renderUserAvatar}
                onOpenThread={onOpenThread}
              />
            )}
          />
        ) : (
          <NoticeList
            palette={messagePalette}
            language={language}
            notices={notices}
            onMarkNotificationRead={onMarkNotificationRead}
            onAcceptFriendRequest={onAcceptFriendRequest}
            onRejectFriendRequest={onRejectFriendRequest}
          />
        )}

        {isLightPalette ? (
          <View pointerEvents="none" style={styles.messageBottomFade}>
            <Svg height="100%" width="100%">
              <Defs>
                <SvgLinearGradient
                  id="messageBottomFade"
                  x1="0"
                  x2="0"
                  y1="0"
                  y2="1"
                >
                  <Stop offset="0" stopColor="#FFFFFF" />
                  <Stop offset="1" stopColor="#F1EFFA" />
                </SvgLinearGradient>
              </Defs>
              <Rect fill="url(#messageBottomFade)" height="100%" width="100%" />
            </Svg>
          </View>
        ) : null}
      </View>
    </View>
  );
}
