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

import {AgentDTO} from '../../models/api';
import { recognizeSpeechOnce } from '../../services/speechToText';
import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes } from '../../shared/theme';
import {ChatHeader} from '../../shared/ui';
import {
  ChatMessage,
  ChatThread,
  Language,
} from '../session/useMiaoxunSession';
import {ThreadListScreen} from './ThreadListScreen';
import {
  AgentAvatarRenderer,
  MessageTab,
  UserAvatarRenderer,
} from './messageTypes';
import {ChatComposer} from './ChatComposer';
import {ChatMessageItem} from './ChatMessageItem';
import {ChatMessageMenu} from './ChatMessageMenu';

export type {AgentAvatarRenderer, MessageTab, UserAvatarRenderer};

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
  renderAgentAvatar,
  onBack,
  onSend,
  onDeleteMessage,
  onRecallMessage,
  onActionError,
  onOpenPeerProfile,
}: {
  palette: Palette;
  language: Language;
  currentUserId: string;
  currentUserName: string;
  thread: ChatThread;
  agents: AgentDTO[];
  renderUserAvatar: UserAvatarRenderer;
  renderAgentAvatar: AgentAvatarRenderer;
  onBack: () => void;
  onSend: (
    content: string,
    retryMessageId?: string,
    replyToMessageId?: string | null,
  ) => void | Promise<void | boolean>;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onRecallMessage: (messageId: string) => void | Promise<void>;
  onActionError: (message: string) => void;
  onOpenPeerProfile?: () => void;
}) {
  const [draft, setDraft] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isRecognizingSpeech, setIsRecognizingSpeech] = useState(false);
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
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const chatTranslateX = useRef(new Animated.Value(0)).current;
  const windowSize = useWindowDimensions();
  const isDarkPalette = palette.text === palettes.dark.text;
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
  const renderMessage = ({item, index}: {item: ChatMessage; index: number}) => (
    <ChatMessageItem
      item={item}
      previousMessage={index > 0 ? thread.messages[index - 1] : null}
      palette={palette}
      language={language}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      thread={thread}
      agents={agents}
      isDarkPalette={isDarkPalette}
      renderUserAvatar={renderUserAvatar}
      renderAgentAvatar={renderAgentAvatar}
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
    const showSubscription = Keyboard.addListener('keyboardDidShow', () => {
      scrollToBottom(true);
      setTimeout(() => scrollToBottom(true), 80);
    });
    const frameSubscription = Keyboard.addListener(
      'keyboardDidChangeFrame',
      () => {
        scrollToBottom(true);
      },
    );

    return () => {
      showSubscription.remove();
      frameSubscription.remove();
    };
  }, []);

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
      style={[styles.chatScreen, { backgroundColor: palette.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Animated.View
        {...closeSwipeResponder.panHandlers}
        style={[
          styles.chatSwipeSurface,
          { transform: [{ translateX: chatTranslateX }] },
        ]}
      >
        <ChatHeader
          palette={palette}
          language={language}
          title={displayText(language, thread.title)}
          onBack={onBack}
          onOpenProfile={thread.peerAiId ? onOpenPeerProfile : undefined}
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
            palette={palette}
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
          palette={palette}
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
    </KeyboardAvoidingView>
  );
}
