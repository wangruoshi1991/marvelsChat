import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  FlatList,
  GestureResponderEvent,
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentDTO } from '../../models/api';
import { recognizeSpeechOnce } from '../../services/speechToText';
import { displayText, publicPresenceText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes } from '../../shared/theme';
import { ChatHeader } from '../../shared/ui';
import {
  ChatMessage,
  ChatThread,
  Language,
} from '../session/useMiaoxunSession';
import { ThreadListScreen } from './ThreadListScreen';
import { MessageTab, UserAvatarRenderer } from './messageTypes';
import { ChatComposer } from './ChatComposer';
import { ChatMessageItem } from './ChatMessageItem';
import { ChatMessageMenu } from './ChatMessageMenu';
import { resolveMessagePalette } from './messagePalette';
import { ThreadSettingsSheet } from './ThreadSettingsSheet';
import { isThreadOnline } from './messageUtils';

export type { MessageTab, UserAvatarRenderer };

const recallWindowMs = 60 * 1000;
const chatSwipeCloseThreshold = -84;

export function MessagesScreen(
  props: React.ComponentProps<typeof ThreadListScreen>,
) {
  return <ThreadListScreen {...props} />;
}

export function ChatScreen({
  palette,
  language,
  currentUserId,
  currentUserName,
  thread,
  agents,
  renderUserAvatar,
  onBack,
  onSend,
  onDeleteMessage,
  onRecallMessage,
  onSetMuted,
  onActionError,
  onOpenPeerProfile,
  initialDraft,
  onInitialDraftConsumed,
}: {
  palette: Palette;
  language: Language;
  currentUserId: string;
  currentUserName: string;
  thread: ChatThread;
  agents: AgentDTO[];
  renderUserAvatar: UserAvatarRenderer;
  onBack: () => void;
  onSend: (
    content: string,
    retryMessageId?: string,
    replyToMessageId?: string | null,
  ) => void | Promise<void | boolean>;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onRecallMessage: (messageId: string) => void | Promise<void>;
  onSetMuted: (muted: boolean) => Promise<void>;
  onActionError: (message: string) => void;
  onOpenPeerProfile?: () => void;
  initialDraft?: string;
  onInitialDraftConsumed?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecognizingSpeech, setIsRecognizingSpeech] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(
    null,
  );
  const [messageMenuPosition, setMessageMenuPosition] = useState<{
    x: number;
    y: number;
    isMine: boolean;
  } | null>(null);
  const messageInlineMenuArrowLeft = messageMenuPosition?.isMine ? 232 : 34;
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const [isThreadSettingsOpen, setIsThreadSettingsOpen] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const chatTranslateX = useRef(new Animated.Value(0)).current;
  const windowSize = useWindowDimensions();
  const messagePalette = useMemo(
    () => resolveMessagePalette(palette),
    [palette],
  );
  const isDarkPalette = messagePalette.text === palettes.dark.text;
  const canConfigureThread =
    Boolean(thread.peerUserId) || thread.kind === 'group';
  const threadAgent = thread.agentId
    ? agents.find(agent => agent.key === thread.agentId) || null
    : null;
  const threadOnline = isThreadOnline(thread, threadAgent);
  const presenceSubtitle = thread.agentId
    ? textFor(
        language,
        threadOnline ? '在线' : '离线',
        threadOnline ? 'Online' : 'Offline',
      )
    : thread.peerUserId
    ? publicPresenceText(language, thread.peerPresenceStatus)
    : '';
  const isSelectedMessageMine =
    selectedMessage?.senderType === 'user' &&
    (typeof selectedMessage.metadata?.senderUserId !== 'string' ||
      selectedMessage.metadata.senderUserId === currentUserId);
  const scrollToBottom = (animated: boolean) => {
    requestAnimationFrame(() => {
      listRef.current?.scrollToEnd({ animated });
    });
  };
  const closeMessageMenu = useCallback(() => {
    setSelectedMessage(null);
    setMessageMenuPosition(null);
  }, []);
  const resetChatSwipe = useCallback(() => {
    Animated.spring(chatTranslateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 5,
    }).start();
  }, [chatTranslateX]);
  const closeFromSwipe = useCallback(() => {
    Keyboard.dismiss();
    closeMessageMenu();
    Animated.timing(chatTranslateX, {
      toValue: -Math.max(windowSize.width, 320),
      duration: 160,
      useNativeDriver: true,
    }).start(() => {
      chatTranslateX.setValue(0);
      onBack();
    });
  }, [chatTranslateX, closeMessageMenu, onBack, windowSize.width]);
  const closeSwipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35,
        onPanResponderMove: (_event, gesture) => {
          chatTranslateX.setValue(
            Math.max(
              Math.min(gesture.dx, 0),
              -Math.max(windowSize.width, 320) * 0.72,
            ),
          );
        },
        onPanResponderRelease: (_event, gesture) => {
          if (
            (gesture.dx <= chatSwipeCloseThreshold || gesture.vx <= -0.55) &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
          ) {
            closeFromSwipe();
            return;
          }
          resetChatSwipe();
        },
        onPanResponderTerminate: resetChatSwipe,
      }),
    [chatTranslateX, closeFromSwipe, resetChatSwipe, windowSize.width],
  );
  const openMessageMenu = (
    item: ChatMessage,
    isMine: boolean,
    event: GestureResponderEvent,
  ) => {
    const menuWidth = isMine ? 284 : 220;
    const left = Math.min(
      Math.max(event.nativeEvent.pageX - (isMine ? menuWidth - 42 : 42), 12),
      Math.max(12, windowSize.width - menuWidth - 12),
    );
    setSelectedMessage(item);
    setMessageMenuPosition({
      x: left,
      y: Math.max(78, event.nativeEvent.pageY - 78),
      isMine,
    });
  };
  const canRecallSelectedMessage = (() => {
    if (
      !selectedMessage ||
      !isSelectedMessageMine ||
      selectedMessage.id.startsWith('local-') ||
      !selectedMessage.createdAt
    ) {
      return false;
    }
    const createdAt = Date.parse(selectedMessage.createdAt);
    return !Number.isNaN(createdAt) && Date.now() - createdAt <= recallWindowMs;
  })();
  const renderMessage = ({
    item,
    index,
  }: {
    item: ChatMessage;
    index: number;
  }) => (
    <ChatMessageItem
      item={item}
      previousMessage={index > 0 ? thread.messages[index - 1] : null}
      palette={messagePalette}
      language={language}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      thread={thread}
      agents={agents}
      isDarkPalette={isDarkPalette}
      renderUserAvatar={renderUserAvatar}
      onOpenMessageMenu={openMessageMenu}
      onRetrySend={message => {
        if (message.localStatus !== 'failed') {
          return;
        }
        Promise.resolve(onSend(message.content, message.id)).catch(
          () => undefined,
        );
      }}
    />
  );

  useEffect(() => {
    scrollToBottom(false);
    const afterPaint = setTimeout(() => scrollToBottom(false), 80);
    return () => clearTimeout(afterPaint);
  }, [thread.id, thread.messages.length]);

  useEffect(() => {
    if (!initialDraft) {
      return;
    }
    setDraft(initialDraft);
    onInitialDraftConsumed?.();
  }, [initialDraft, onInitialDraftConsumed]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', event => {
      if (Platform.OS === 'ios') {
        setKeyboardInset(
          Math.max(0, event.endCoordinates.height - safeAreaInsets.bottom),
        );
      }
      scrollToBottom(true);
      setTimeout(() => scrollToBottom(true), 80);
    });
    const frameSubscription = Keyboard.addListener(
      'keyboardDidChangeFrame',
      event => {
        if (Platform.OS === 'ios') {
          setKeyboardInset(
            Math.max(0, event.endCoordinates.height - safeAreaInsets.bottom),
          );
        }
        scrollToBottom(true);
      },
    );
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardInset(0);
    });

    return () => {
      showSubscription.remove();
      frameSubscription.remove();
      hideSubscription.remove();
    };
  }, [safeAreaInsets.bottom]);

  const send = () => {
    const content = draft.trim();
    if (!content || isSending) {
      return;
    }
    setDraft('');
    setIsSending(true);
    const targetId = replyTarget?.id || null;
    setReplyTarget(null);
    Promise.resolve(onSend(content, undefined, targetId)).finally(() =>
      setIsSending(false),
    );
  };

  const recognizeSpeech = () => {
    if (isRecognizingSpeech) {
      return;
    }

    Keyboard.dismiss();
    closeMessageMenu();
    setIsRecognizingSpeech(true);
    Promise.resolve(recognizeSpeechOnce(language))
      .then(text => {
        setDraft(current => {
          const trimmed = current.trimEnd();
          return trimmed ? `${trimmed} ${text}` : text;
        });
        setTimeout(() => scrollToBottom(true), 80);
      })
      .catch(error => {
        onActionError(
          error instanceof Error
            ? error.message
            : textFor(language, '语音识别失败', 'Speech recognition failed'),
        );
      })
      .finally(() => setIsRecognizingSpeech(false));
  };

  return (
    <KeyboardAvoidingView
      style={[
        styles.chatScreen,
        { backgroundColor: messagePalette.background },
      ]}
      enabled={false}
    >
      <Animated.View
        {...closeSwipeResponder.panHandlers}
        style={[
          styles.chatSwipeSurface,
          {
            marginBottom: keyboardInset,
            transform: [{ translateX: chatTranslateX }],
          },
        ]}
      >
        <ChatHeader
          palette={messagePalette}
          language={language}
          title={displayText(language, thread.title)}
          subtitle={presenceSubtitle}
          subtitleStatus={
            presenceSubtitle ? (threadOnline ? 'online' : 'offline') : undefined
          }
          onBack={onBack}
          onOpenSettings={
            canConfigureThread ? () => setIsThreadSettingsOpen(true) : undefined
          }
        />
        <FlatList
          ref={listRef}
          data={thread.messages}
          keyExtractor={item => item.id}
          contentContainerStyle={styles.messages}
          initialNumToRender={Math.max(thread.messages.length, 12)}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          ListFooterComponent={<View style={styles.messageFooterSpacer} />}
          onLayout={() => scrollToBottom(false)}
          renderItem={renderMessage}
        />
        {selectedMessage && messageMenuPosition ? (
          <ChatMessageMenu
            palette={messagePalette}
            language={language}
            selectedMessage={selectedMessage}
            position={messageMenuPosition}
            arrowLeft={messageInlineMenuArrowLeft}
            canRecall={canRecallSelectedMessage}
            onClose={closeMessageMenu}
            onReply={setReplyTarget}
            onDeleteMessage={onDeleteMessage}
            onRecallMessage={onRecallMessage}
            onActionMessage={onActionError}
          />
        ) : null}
        <ChatComposer
          palette={messagePalette}
          language={language}
          threadTitle={thread.title}
          draft={draft}
          isSending={isSending}
          isRecognizingSpeech={isRecognizingSpeech}
          replyTarget={replyTarget}
          onChangeDraft={setDraft}
          onClearReplyTarget={() => setReplyTarget(null)}
          onFocusInput={() => {
            scrollToBottom(true);
            setTimeout(() => scrollToBottom(true), 80);
          }}
          onRecognizeSpeech={recognizeSpeech}
          onSend={send}
        />
      </Animated.View>
      <ThreadSettingsSheet
        visible={isThreadSettingsOpen}
        muted={Boolean(thread.muted)}
        palette={messagePalette}
        language={language}
        onClose={() => setIsThreadSettingsOpen(false)}
        onSetMuted={onSetMuted}
        onOpenProfile={thread.peerAiId ? onOpenPeerProfile : undefined}
        onActionError={onActionError}
      />
    </KeyboardAvoidingView>
  );
}
