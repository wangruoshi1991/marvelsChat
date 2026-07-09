import React, {useCallback, useMemo, useRef} from 'react';
import {
  Animated,
  FlatList,
  PanResponder,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import {Plus, Search} from 'lucide-react-native';

import {AgentDTO} from '../../models/api';
import {displayText, publicPresenceText, textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {IconButton, SegmentedControl} from '../../shared/ui';
import {
  ChatThread,
  Language,
  useMiaoxunSession,
} from '../session/useMiaoxunSession';
import {NoticeList} from './NoticeList';
import {AgentAvatarRenderer, MessageTab, UserAvatarRenderer} from './messageTypes';
import {relativeTimeText, resolveAgentIdentity} from './messageUtils';

const chatSwipeOpenThreshold = -72;

function ThreadSwipeRow({
  thread,
  palette,
  language,
  agents,
  renderUserAvatar,
  renderAgentAvatar,
  onOpenThread,
}: {
  thread: ChatThread;
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  renderUserAvatar: UserAvatarRenderer;
  renderAgentAvatar: AgentAvatarRenderer;
  onOpenThread: (thread: ChatThread) => void;
}) {
  const agentIdentity = thread.agentId
    ? resolveAgentIdentity(agents, thread.agentId)
    : null;
  const translateX = useRef(new Animated.Value(0)).current;
  const openedRef = useRef(false);
  const windowSize = useWindowDimensions();

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
        {borderBottomColor: palette.border, transform: [{translateX}]},
      ]}>
      <Pressable
        onPress={() => onOpenThread(thread)}
        style={[styles.threadRow, {borderBottomColor: palette.border}]}>
        {thread.agentId
          ? renderAgentAvatar({identity: agentIdentity})
          : renderUserAvatar({
              text: thread.avatarText,
              config: thread.avatarConfig || undefined,
            })}
        <View style={styles.threadMain}>
          <View style={styles.threadTitleRow}>
            <Text style={[styles.threadTitle, {color: palette.text}]}>
              {displayText(language, thread.title)}
            </Text>
            <Text style={[styles.threadTime, {color: palette.secondaryText}]}>
              {relativeTimeText(thread.lastMessageAt)}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={[styles.threadPreview, {color: palette.secondaryText}]}>
            {displayText(language, thread.lastContent) ||
              textFor(language, '暂无消息', 'No messages yet')}
          </Text>
          <Text style={[styles.threadStatus, {color: palette.mint}]}>
            {thread.peerUserId
              ? publicPresenceText(language, thread.peerPresenceStatus)
              : displayText(language, thread.status) ||
                (thread.agentId
                  ? textFor(language, 'Agent 会话', 'Agent chat')
                  : textFor(language, '会话', 'Chat'))}
          </Text>
        </View>
        {thread.unreadCount > 0 ? (
          <View style={[styles.unread, {backgroundColor: palette.rose}]}>
            <Text style={styles.unreadText}>{thread.unreadCount}</Text>
          </View>
        ) : null}
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
  renderAgentAvatar,
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
  renderAgentAvatar: AgentAvatarRenderer;
  onOpenThread: (thread: ChatThread) => void;
  onOpenMessageActions: () => void;
  onOpenSearch: () => void;
  onSelectMessageTab: (tab: MessageTab) => void;
  onMarkNotificationRead: (notificationId: string) => Promise<void>;
  onAcceptFriendRequest: (requestId: string) => Promise<void>;
  onRejectFriendRequest: (requestId: string) => Promise<void>;
}) {
  return (
    <View style={[styles.screen, {backgroundColor: palette.background}]}>
      <View style={[styles.topBar, {borderBottomColor: palette.border}]}>
        <IconButton
          icon={Plus}
          palette={palette}
          variant="soft"
          onPress={onOpenMessageActions}
        />
        <SegmentedControl
          fill
          palette={palette}
          value={selectedMessageTab}
          options={[
            {label: textFor(language, '聊天', 'Chats'), value: 'chat'},
            {
              label: textFor(language, '通知', 'Notices'),
              value: 'notice',
              badge: unreadNoticeCount,
            },
          ]}
          onChange={onSelectMessageTab}
        />
        <IconButton
          icon={Search}
          palette={palette}
          variant="soft"
          onPress={onOpenSearch}
        />
      </View>

      {selectedMessageTab === 'chat' ? (
        <FlatList
          data={threads}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.threadList}
          renderItem={({item}) => (
            <ThreadSwipeRow
              thread={item}
              palette={palette}
              language={language}
              agents={agents}
              renderUserAvatar={renderUserAvatar}
              renderAgentAvatar={renderAgentAvatar}
              onOpenThread={onOpenThread}
            />
          )}
        />
      ) : (
        <NoticeList
          palette={palette}
          language={language}
          notices={notices}
          onMarkNotificationRead={onMarkNotificationRead}
          onAcceptFriendRequest={onAcceptFriendRequest}
          onRejectFriendRequest={onRejectFriendRequest}
        />
      )}
    </View>
  );
}
