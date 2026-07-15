import React from 'react';
import {GestureResponderEvent, Pressable, Text, View} from 'react-native';

import {AgentDTO} from '../../models/api';
import {displayText, textFor} from '../../shared/i18n';
import {styles} from '../../shared/styles';
import {Palette} from '../../shared/theme';
import {ChatMessage, ChatThread, Language} from '../session/useMiaoxunSession';
import {UserAvatarRenderer} from './messageTypes';
import {AgentIconAvatar} from './AgentIconAvatar';
import {
  messageTimeText,
  resolveAgentIdentity,
  shouldShowMessageTimeSeparator,
} from './messageUtils';

export function ChatMessageItem({
  item,
  previousMessage,
  palette,
  language,
  currentUserId,
  currentUserName,
  thread,
  agents,
  isDarkPalette,
  renderUserAvatar,
  onOpenMessageMenu,
  onRetrySend,
}: {
  item: ChatMessage;
  previousMessage: ChatMessage | null;
  palette: Palette;
  language: Language;
  currentUserId: string;
  currentUserName: string;
  thread: ChatThread;
  agents: AgentDTO[];
  isDarkPalette: boolean;
  renderUserAvatar: UserAvatarRenderer;
  onOpenMessageMenu: (
    item: ChatMessage,
    isMine: boolean,
    event: GestureResponderEvent,
  ) => void;
  onRetrySend: (message: ChatMessage) => void;
}) {
  const senderUserId =
    typeof item.metadata?.senderUserId === 'string'
      ? item.metadata.senderUserId
      : item.senderType === 'user'
      ? currentUserId
      : '';
  const hasDirectPeer = Boolean(thread.peerUserId);
  const isCorruptedPeerMirror =
    hasDirectPeer &&
    item.senderType === 'user' &&
    senderUserId === currentUserId &&
    item.senderName !== currentUserName;
  const isMine =
    item.senderType === 'user' &&
    senderUserId === currentUserId &&
    !isCorruptedPeerMirror;
  const replyTo =
    item.metadata &&
    typeof item.metadata.replyTo === 'object' &&
    item.metadata.replyTo !== null
      ? (item.metadata.replyTo as {
          senderName?: unknown;
          content?: unknown;
          recalledAt?: unknown;
        })
      : null;

  if (item.recalledAt) {
    return (
      <View style={styles.messageBlock}>
        <View style={styles.recalledMessageWrap}>
          <Text
            style={[styles.recalledMessageText, {color: palette.secondaryText}]}>
            {isMine
              ? textFor(language, '你撤回了一条消息', 'You recalled a message')
              : textFor(language, '对方撤回了一条消息', 'Message recalled')}
          </Text>
        </View>
      </View>
    );
  }

  const bubble = (
    <View style={[styles.bubbleWrap, isMine && styles.bubbleWrapMine]}>
      <Text style={[styles.messageName, {color: palette.secondaryText}]}>
        {isMine
          ? textFor(language, '我', 'Me')
          : displayText(language, item.senderName)}
      </Text>
      <Pressable
        onLongPress={event => onOpenMessageMenu(item, isMine, event)}
        onPress={
          item.localStatus === 'failed' ? () => onRetrySend(item) : undefined
        }>
        {replyTo ? (
          <View
            style={[
              styles.replyPreview,
              {
                backgroundColor: palette.soft,
                borderLeftColor: palette.mint,
              },
            ]}>
            <Text
              style={[
                styles.replyPreviewName,
                {color: palette.secondaryText},
              ]}>
              {displayText(language, String(replyTo.senderName || ''))}
            </Text>
            <Text
              style={[
                styles.replyPreviewContent,
                {color: palette.secondaryText},
              ]}
              numberOfLines={1}>
              {replyTo.recalledAt
                ? textFor(
                    language,
                    '原消息已撤回',
                    'Original message recalled',
                  )
                : displayText(language, String(replyTo.content || ''))}
            </Text>
          </View>
        ) : null}
        <Text
          style={[
            styles.bubble,
            isMine
              ? styles.bubbleMineText
              : isDarkPalette
              ? styles.bubbleAgentDarkText
              : styles.bubbleAgentLightText,
            {backgroundColor: isMine ? palette.mint : palette.surface},
            item.localStatus === 'failed' && styles.bubbleFailed,
          ]}>
          {displayText(language, item.content)}
        </Text>
      </Pressable>
      {item.localStatus ? (
        <View
          style={[styles.messageMetaRow, isMine && styles.messageMetaRowMine]}>
          {item.localStatus === 'sending' ? (
            <Text style={[styles.messageStatus, {color: palette.secondaryText}]}>
              {textFor(language, '发送中', 'Sending')}
            </Text>
          ) : null}
          {item.localStatus === 'failed' ? (
            <Text style={styles.messageStatusFailed}>
              {textFor(language, '发送失败，点击重试', 'Failed, tap to retry')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
  const showTimeSeparator = shouldShowMessageTimeSeparator(
    previousMessage,
    item,
  );
  const threadAgent = thread.agentId
    ? agents.find(agent => agent.key === thread.agentId)
    : null;
  const shouldShowAgentIcon =
    Boolean(thread.agentId) && item.senderType !== 'user';
  const messageRow = isMine ? (
    <View style={styles.messageRowMine}>{bubble}</View>
  ) : (
    <View style={styles.messageRowAgent}>
      {shouldShowAgentIcon && thread.agentId
        ? (
            <AgentIconAvatar
              agentId={thread.agentId}
              category={threadAgent?.category}
              identity={
                threadAgent?.identity ||
                resolveAgentIdentity(agents, thread.agentId)
              }
              palette={palette}
              small
            />
          )
        : renderUserAvatar({
            text: item.senderName.slice(0, 1),
            config: thread.avatarConfig || undefined,
            small: true,
          })}
      {bubble}
    </View>
  );

  return (
    <View style={styles.messageBlock}>
      {showTimeSeparator ? (
        <View style={styles.messageTimeSeparator}>
          <Text
            style={[
              styles.messageTimeSeparatorText,
              {color: palette.secondaryText},
            ]}>
            {messageTimeText(item.createdAt)}
          </Text>
        </View>
      ) : null}
      {messageRow}
    </View>
  );
}
