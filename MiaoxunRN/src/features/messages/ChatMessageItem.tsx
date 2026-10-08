import React, { useRef } from 'react';
import { Share, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Bot, Copy, ExternalLink, LayoutGrid } from 'lucide-react-native';

import { AgentDTO, AvatarConfigDTO } from '../../models/api';
import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { AIAssistGestureSurface } from '../assist/AIAssistGestureSurface';
import { useAIAssist } from '../assist/AIAssistProvider';
import {
  AIAssistAction,
  AIAssistObjectReference,
  AIAssistPoint,
} from '../assist/aiAssistTypes';
import {
  ChatMessage,
  ChatThread,
  Language,
} from '../session/useMiaoxunSession';
import { UserAvatarRenderer } from './messageTypes';
import { AgentIconAvatar } from './AgentIconAvatar';
import { chatLayoutStyles } from './chatLayoutStyles';
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
  currentUserAvatarConfig,
  thread,
  agents,
  isDarkPalette,
  renderUserAvatar,
  onOpenMessageMenu,
  onRetrySend,
  onActionMessage,
}: {
  item: ChatMessage;
  previousMessage: ChatMessage | null;
  palette: Palette;
  language: Language;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarConfig?: AvatarConfigDTO;
  thread: ChatThread;
  agents: AgentDTO[];
  isDarkPalette: boolean;
  renderUserAvatar: UserAvatarRenderer;
  onOpenMessageMenu: (
    item: ChatMessage,
    isMine: boolean,
    point: AIAssistPoint,
    messageFrame: { x: number; y: number; width: number; height: number },
  ) => void;
  onRetrySend: (message: ChatMessage) => void;
  onActionMessage: (message: string) => void;
}) {
  const assist = useAIAssist();
  const touchPoint = useRef<AIAssistPoint>({ x: 0, y: 0 });
  const messageBlockRef = useRef<View>(null);
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
  const assistObject: AIAssistObjectReference = {
    kind: 'chat-message',
    id: item.id,
    title: textFor(language, '聊天消息', 'Chat message'),
    metadata: { content: item.content, threadId: thread.id },
  };
  const assistActions: AIAssistAction[] = [
    {
      direction: 'up',
      label: textFor(language, '分享', 'Share'),
      Icon: ExternalLink,
      accent: palette.mint,
      onSelect: () => {
        assist.dismiss();
        Share.share({ message: item.content }).catch(error => {
          onActionMessage(
            error instanceof Error
              ? error.message
              : textFor(language, '分享失败', 'Sharing failed'),
          );
        });
      },
    },
    {
      direction: 'right',
      label: textFor(language, '妙管家', 'Butler'),
      Icon: Bot,
      accent: palette.mint,
      onSelect: object => assist.askButler(object),
    },
    {
      direction: 'down',
      label: textFor(language, '复制', 'Copy'),
      Icon: Copy,
      accent: palette.mint,
      onSelect: () => {
        assist.dismiss();
        Clipboard.setString(item.content);
        onActionMessage(textFor(language, '消息已复制', 'Message copied'));
      },
    },
    {
      direction: 'left',
      label: textFor(language, '更多', 'More'),
      Icon: LayoutGrid,
      accent: palette.mint,
      onSelect: () => {
        assist.dismiss();
        messageBlockRef.current?.measureInWindow((x, y, width, height) => {
          onOpenMessageMenu(item, isMine, touchPoint.current, {
            x,
            y,
            width,
            height,
          });
        });
      },
    },
  ];

  if (item.recalledAt) {
    return (
      <View style={styles.messageBlock}>
        <View style={styles.recalledMessageWrap}>
          <Text
            style={[
              styles.recalledMessageText,
              { color: palette.secondaryText },
            ]}
          >
            {isMine
              ? textFor(language, '你撤回了一条消息', 'You recalled a message')
              : textFor(language, '对方撤回了一条消息', 'Message recalled')}
          </Text>
        </View>
      </View>
    );
  }

  const cardBackground = isDarkPalette
    ? isMine
      ? palette.soft
      : palette.surface
    : isMine
    ? '#F0EBFD'
    : '#FFFFFF';
  const cardBorder = isDarkPalette ? palette.border : '#F0EBFD';
  const replyBackground = isDarkPalette ? palette.background : '#F8F7FD';
  const replyAccent = isDarkPalette ? palette.mint : '#2012D9';
  const bubble = (
    <View style={chatLayoutStyles.content}>
      <View
        onTouchStart={event => {
          touchPoint.current = {
            x: event.nativeEvent.pageX,
            y: event.nativeEvent.pageY,
          };
        }}
      >
        <AIAssistGestureSurface
          actions={assistActions}
          object={assistObject}
          palette={palette}
          style={[
            chatLayoutStyles.card,
            {
              backgroundColor: cardBackground,
              borderColor: cardBorder,
            },
            item.localStatus === 'failed' && styles.bubbleFailed,
          ]}
          testID={`chat-message-assist-${item.id}`}
          onPress={
            item.localStatus === 'failed' ? () => onRetrySend(item) : undefined
          }
        >
          {replyTo ? (
            <View
              style={[
                styles.replyPreview,
                {
                  backgroundColor: replyBackground,
                  borderLeftColor: replyAccent,
                },
              ]}
            >
              <Text
                style={[
                  styles.replyPreviewName,
                  { color: palette.secondaryText },
                ]}
              >
                {displayText(language, String(replyTo.senderName || ''))}
              </Text>
              <Text
                style={[
                  styles.replyPreviewContent,
                  { color: palette.secondaryText },
                ]}
                numberOfLines={1}
              >
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
            testID={`chat-message-content-${item.id}`}
            style={[chatLayoutStyles.body, { color: palette.text }]}
          >
            {displayText(language, item.content)}
          </Text>
        </AIAssistGestureSurface>
      </View>
      {item.localStatus ? (
        <View
          style={[styles.messageMetaRow, isMine && styles.messageMetaRowMine]}
        >
          {item.localStatus === 'sending' ? (
            <Text
              style={[styles.messageStatus, { color: palette.secondaryText }]}
            >
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
  const messageRow = (
    <View style={chatLayoutStyles.message}>
      <View
        style={[chatLayoutStyles.sender, isMine && chatLayoutStyles.senderMine]}
      >
        {isMine ? (
          renderUserAvatar({
            text: currentUserName.slice(0, 1),
            config: currentUserAvatarConfig,
            small: true,
            size: 36,
          })
        ) : shouldShowAgentIcon && thread.agentId ? (
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
        ) : (
          renderUserAvatar({
            text: item.senderName.slice(0, 1),
            config: thread.avatarConfig || undefined,
            small: true,
            size: 36,
          })
        )}
        {!isMine ? (
          <Text
            numberOfLines={1}
            style={[
              chatLayoutStyles.senderName,
              { color: palette.secondaryText },
            ]}
          >
            {displayText(language, item.senderName)}
          </Text>
        ) : null}
      </View>
      {bubble}
    </View>
  );

  return (
    <View ref={messageBlockRef} collapsable={false} style={styles.messageBlock}>
      {showTimeSeparator ? (
        <View style={styles.messageTimeSeparator}>
          <Text
            style={[
              styles.messageTimeSeparatorText,
              { color: palette.secondaryText },
            ]}
          >
            {messageTimeText(item.createdAt)}
          </Text>
        </View>
      ) : null}
      {messageRow}
    </View>
  );
}
