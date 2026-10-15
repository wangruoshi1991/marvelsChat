import { Artifact, ContextReference } from '../ai/AIInteraction';
import React, { useRef } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { Bot, Copy, ExternalLink, LayoutGrid } from 'lucide-react-native';

import { AgentDTO, AvatarConfigDTO } from '../../models/api';
import { AgentWorkspace } from '../../models/agentWorkspace';
import {
  messageWorkspaceId,
  WorkspaceMessageAction,
} from './WorkspaceMessageAction';
import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, productColors } from '../../shared/theme';
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
import { AlbumAssistantResults } from './AlbumAssistantResults';
import { agentReplyPresentation } from './agentReplyPresentation';
import { ChatMessageText } from './ChatMessageText';
import {
  messageTimeText,
  resolveAgentIdentity,
  shouldShowMessageTimeSeparator,
} from './messageUtils';

export function ChatMessageItem({
  token,
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
  onOpenAgentAccess,
  onOpenWorkspace,
  onActionMessage,
}: {
  token?: string;
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
  onOpenAgentAccess?: () => void;
  onOpenWorkspace?: (workspace: AgentWorkspace) => void;
  onActionMessage: (message: string) => void;
}) {
  const assist = useAIAssist();
  const workspaceId = messageWorkspaceId(item, thread.agentId);
  const presentedMessageContent = displayText(
    language,
    agentReplyPresentation(item, thread.agentId, language),
  );
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
          messageId?: unknown;
          senderName?: unknown;
          content?: unknown;
          recalledAt?: unknown;
        })
      : null;
  const quotedMessage = thread.messages.find(
    message => message.id === replyTo?.messageId,
  );
  const presentedReplyContent =
    quotedMessage && quotedMessage.content === replyTo?.content
      ? agentReplyPresentation(quotedMessage, thread.agentId, language)
      : String(replyTo?.content || '');
  const assistObject: AIAssistObjectReference = {
    kind: 'chat-message',
    id: item.id,
    title: textFor(language, '聊天消息', 'Chat message'),
    metadata: { content: presentedMessageContent, threadId: thread.id },
  };
  const assistActions: AIAssistAction[] = [
    {
      direction: 'up',
      label: textFor(language, '分享', 'Share'),
      Icon: ExternalLink,
      accent: palette.mint,
      onSelect: () => {
        assist.dismiss();
        Share.share({ message: presentedMessageContent }).catch(error => {
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
        Clipboard.setString(presentedMessageContent);
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
          onOpenMessageMenu(
            { ...item, content: presentedMessageContent },
            isMine,
            touchPoint.current,
            {
              x,
              y,
              width,
              height,
            },
          );
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
    ? productColors.border
    : '#FFFFFF';
  const cardBorder = isDarkPalette ? palette.border : productColors.border;
  const replyBackground = isDarkPalette
    ? palette.background
    : productColors.background;
  const replyAccent = isDarkPalette ? palette.mint : productColors.accent;
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
                  : displayText(language, presentedReplyContent)}
              </Text>
            </View>
          ) : null}
          <ContextReference
            references={item.metadata?.contextRefs || []}
            palette={palette}
            language={language}
          />
          <ChatMessageText
            testID={`chat-message-content-${item.id}`}
            style={[chatLayoutStyles.body, { color: palette.text }]}
            formatted={item.senderType === 'agent'}
            palette={palette}
          >
            {presentedMessageContent}
          </ChatMessageText>
        </AIAssistGestureSurface>
      </View>
      {token && workspaceId && onOpenWorkspace ? (
        <WorkspaceMessageAction
          key={`${token}:${currentUserId}:${thread.id}:${item.id}:${workspaceId}`}
          token={token}
          workspaceId={workspaceId}
          palette={palette}
          language={language}
          onOpen={onOpenWorkspace}
        />
      ) : null}
      {token &&
      thread.agentId === 'album-manager' &&
      item.senderType === 'agent' &&
      typeof item.metadata?.albumAssistant === 'object' &&
      item.metadata.albumAssistant !== null &&
      'outcome' in item.metadata.albumAssistant &&
      item.metadata.albumAssistant.outcome === 'found' ? (
        <Artifact
          artifact={{
            kind: 'message',
            id: item.id,
            threadId: thread.id,
            title: textFor(language, '找到的素材', 'Matching media'),
          }}
          palette={palette}
          language={language}
        >
          <AlbumAssistantResults
            token={token}
            threadId={thread.id}
            messageId={item.id}
            palette={palette}
            language={language}
          />
        </Artifact>
      ) : null}
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
            <View style={failureStyles.content}>
              <Text style={styles.messageStatusFailed}>
                {item.localFailure?.message ||
                  textFor(
                    language,
                    '发送失败，点击重试',
                    'Failed, tap to retry',
                  )}
              </Text>
              {onOpenAgentAccess &&
              ['AI_CONTEXT_SCOPE_REQUIRED', 'AI_ACCESS_REVOKED'].includes(
                item.localFailure?.code || '',
              ) ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={textFor(
                    language,
                    '查看授权',
                    'Review access',
                  )}
                  onPress={onOpenAgentAccess}
                >
                  <Text style={{ color: palette.text }}>
                    {textFor(language, '查看授权', 'Review access')}
                  </Text>
                </Pressable>
              ) : (
                <Text style={{ color: palette.secondaryText }}>
                  {textFor(
                    language,
                    '确认后点击消息重试',
                    'Tap the message to retry when ready',
                  )}
                </Text>
              )}
            </View>
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

const failureStyles = StyleSheet.create({ content: { flexShrink: 1, gap: 4 } });
