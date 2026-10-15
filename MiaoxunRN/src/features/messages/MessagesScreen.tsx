import type { AssistMessageSource } from '../assist/assistMessageSource';
import type { AIContextReference } from '../../models/aiTask';
import { AITaskCard, Artifact } from '../ai/AIInteraction';
import { useAITasks } from '../ai/useAITasks';
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
  Keyboard,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  Pressable,
  Text,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AgentDTO, AvatarConfigDTO } from '../../models/api';
import { AgentWorkspace } from '../../models/agentWorkspace';
import { recognizeSpeechOnce } from '../../services/speechToText';
import { displayText, publicPresenceText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes } from '../../shared/theme';
import { ChatHeader } from '../../shared/ui';
import { useAIAssist } from '../assist/AIAssistProvider';
import { AIAssistPoint } from '../assist/aiAssistTypes';
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
import { messageMenuGeometry } from './messageMenuGeometry';
import { AlbumAssistantStatus } from './AlbumAssistantStatus';
import { keyboardBottomInset } from './keyboardGeometry';
import { missingContextScopes } from '../ai/assistContext';
import { agentScopeListLabel } from '../agents/agentPresentation';
import { agentReplyPresentation } from './agentReplyPresentation';
import { pendingButlerClarification } from './butlerClarification';

export type { MessageTab, UserAvatarRenderer };

export type ChatDraftSnapshot = {
  text: string;
  references: AIContextReference[];
  source?: AssistMessageSource;
  replyToMessageId?: string;
  butlerContextReset?: boolean;
};

const recallWindowMs = 60 * 1000;
const chatSwipeCloseThreshold = -84;

export function MessagesScreen(
  props: React.ComponentProps<typeof ThreadListScreen>,
) {
  return <ThreadListScreen {...props} />;
}

export function ChatScreen({
  token,
  onAuthorizeAlbumAI,
  palette,
  language,
  currentUserId,
  currentUserName,
  currentUserAvatarConfig,
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
  initialContextRefs,
  initialAssistSource,
  initialReplyToMessageId,
  initialButlerContextReset,
  agentGrantedScopes,
  onOpenAgentAccess,
  onOpenWorkspace,
  onPreserveDraftForAccess,
  onRefreshThread,
  onInitialDraftConsumed,
}: {
  token?: string;
  onAuthorizeAlbumAI?: () => Promise<unknown>;
  palette: Palette;
  language: Language;
  currentUserId: string;
  currentUserName: string;
  currentUserAvatarConfig?: AvatarConfigDTO;
  thread: ChatThread;
  agents: AgentDTO[];
  renderUserAvatar: UserAvatarRenderer;
  onBack: () => void;
  onSend: (
    content: string,
    retryMessageId?: string,
    replyToMessageId?: string | null,
    contextRefs?: AIContextReference[],
    assistSource?: AssistMessageSource,
    butlerContextReset?: boolean,
  ) => void | Promise<void | boolean>;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onRecallMessage: (messageId: string) => void | Promise<void>;
  onSetMuted: (muted: boolean) => Promise<void>;
  onActionError: (message: string) => void;
  onOpenPeerProfile?: () => void;
  initialDraft?: string;
  initialContextRefs?: AIContextReference[];
  initialAssistSource?: AssistMessageSource;
  initialReplyToMessageId?: string;
  initialButlerContextReset?: boolean;
  agentGrantedScopes?: string[];
  onOpenAgentAccess?: () => void;
  onOpenWorkspace?: (workspace: AgentWorkspace) => void;
  onPreserveDraftForAccess?: (draft: ChatDraftSnapshot) => void;
  onRefreshThread?: () => Promise<void>;
  onInitialDraftConsumed?: () => void;
}) {
  const assist = useAIAssist();
  const [draft, setDraft] = useState('');
  const [contextRefs, setContextRefs] = useState<AIContextReference[]>([]);
  const [assistSource, setAssistSource] = useState<AssistMessageSource>();
  const submitting = useRef(false);
  const clarification = useMemo(
    () => pendingButlerClarification(thread),
    [thread],
  );
  const handledClarification = useRef<string | null>(null);
  const draftEdited = useRef(false);
  const continuingClarification = useRef(false);
  const contextReset = useRef(false);
  const contextWarning = (references: AIContextReference[]) => {
    const missingScopes = agentGrantedScopes
      ? missingContextScopes(references, agentGrantedScopes)
      : [];
    return missingScopes.length
      ? textFor(
          language,
          `读取所选内容需要${agentScopeListLabel(missingScopes, language)}授权`,
          `Selected content requires access: ${agentScopeListLabel(
            missingScopes,
            language,
          )}`,
        )
      : undefined;
  };
  const contextAccessWarning = contextWarning(contextRefs);
  const tasks = useAITasks({
    token: token || '',
    active: Boolean(thread.agentId),
    kind: 'agent_message',
    threadId: thread.id,
    onTaskReady: onRefreshThread,
  });
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
    arrowPlacement: 'top' | 'bottom';
    arrowLeft: number;
  } | null>(null);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);
  const preserveDraftForAccess = () =>
    onPreserveDraftForAccess?.({
      text: draft,
      references: contextRefs.map(reference => ({ ...reference })),
      ...(assistSource ? { source: { ...assistSource } } : {}),
      ...(replyTarget ? { replyToMessageId: replyTarget.id } : {}),
      ...(contextReset.current ? { butlerContextReset: true } : {}),
    });
  const openAgentAccess = onOpenAgentAccess
    ? () => {
        preserveDraftForAccess();
        onOpenAgentAccess();
      }
    : undefined;
  const [isThreadSettingsOpen, setIsThreadSettingsOpen] = useState(false);
  const isChatInteractionBlocked = assist.isActive || Boolean(selectedMessage);
  const interactionBlockedRef = useRef(isChatInteractionBlocked);
  interactionBlockedRef.current = isChatInteractionBlocked;
  const listRef = useRef<FlatList<ChatMessage>>(null);
  const messageAreaRef = useRef<View>(null);
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
  const isSelectedMessageMine = Boolean(messageMenuPosition?.isMine);
  const scrollToBottom = (animated: boolean) => {
    requestAnimationFrame(() => {
      if (interactionBlockedRef.current) {
        return;
      }
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
          !interactionBlockedRef.current &&
          gesture.dx < -8 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35,
        onPanResponderMove: (_event, gesture) => {
          if (interactionBlockedRef.current) {
            return;
          }
          chatTranslateX.setValue(
            Math.max(
              Math.min(gesture.dx, 0),
              -Math.max(windowSize.width, 320) * 0.72,
            ),
          );
        },
        onPanResponderRelease: (_event, gesture) => {
          if (interactionBlockedRef.current) {
            resetChatSwipe();
            return;
          }
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
    point: AIAssistPoint,
    messageFrame: { x: number; y: number; width: number; height: number },
  ) => {
    messageAreaRef.current?.measureInWindow((x, y, width, height) => {
      setSelectedMessage(item);
      setMessageMenuPosition(
        messageMenuGeometry(point, isMine, messageFrame, {
          x,
          y,
          width,
          height,
        }),
      );
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
      token={token}
      item={item}
      previousMessage={index > 0 ? thread.messages[index - 1] : null}
      palette={messagePalette}
      language={language}
      currentUserId={currentUserId}
      currentUserName={currentUserName}
      currentUserAvatarConfig={currentUserAvatarConfig}
      thread={thread}
      agents={agents}
      isDarkPalette={isDarkPalette}
      renderUserAvatar={renderUserAvatar}
      onOpenMessageMenu={openMessageMenu}
      onActionMessage={onActionError}
      onOpenAgentAccess={openAgentAccess}
      onOpenWorkspace={onOpenWorkspace}
      onRetrySend={message => {
        if (message.localStatus !== 'failed') {
          return;
        }
        const warning = contextWarning(message.metadata?.contextRefs || []);
        if (warning) {
          onActionError(warning);
          openAgentAccess?.();
          return;
        }
        const replyToMessageId = message.metadata?.replyTo;
        const replyId =
          replyToMessageId &&
          typeof replyToMessageId === 'object' &&
          'messageId' in replyToMessageId &&
          typeof replyToMessageId.messageId === 'string'
            ? replyToMessageId.messageId
            : null;
        Promise.resolve(
          onSend(
            message.content,
            message.id,
            replyId,
            message.metadata?.contextRefs || [],
            message.metadata?.assistSource,
            ...(message.metadata?.butlerContextReset === true
              ? ([true] as const)
              : []),
          ),
        ).catch(() => undefined);
      }}
    />
  );

  useEffect(() => {
    if (assist.isActive) {
      closeMessageMenu();
      resetChatSwipe();
    }
  }, [assist.isActive, closeMessageMenu, resetChatSwipe]);

  useEffect(() => {
    scrollToBottom(false);
    const afterPaint = setTimeout(() => scrollToBottom(false), 80);
    return () => clearTimeout(afterPaint);
  }, [thread.id, thread.messages.length]);

  useEffect(() => {
    if (
      !initialDraft &&
      !initialContextRefs?.length &&
      !initialAssistSource &&
      !initialReplyToMessageId &&
      !initialButlerContextReset
    ) {
      return;
    }
    draftEdited.current = Boolean(
      initialDraft?.trim() ||
        initialContextRefs?.length ||
        initialReplyToMessageId ||
        initialButlerContextReset,
    );
    contextReset.current = initialButlerContextReset === true;
    continuingClarification.current = Boolean(
      clarification &&
        initialContextRefs?.length === clarification.references.length &&
        initialContextRefs.every((reference, index) => {
          const original = clarification.references[index];
          return (
            reference.kind === original.kind &&
            reference.id === original.id &&
            reference.version === original.version
          );
        }),
    );
    setDraft(initialDraft || '');
    setContextRefs(initialContextRefs || []);
    setAssistSource(initialAssistSource);
    const restoredReply = thread.messages.find(
      message => message.id === initialReplyToMessageId,
    );
    setReplyTarget(
      restoredReply
        ? {
            ...restoredReply,
            content: displayText(
              language,
              agentReplyPresentation(restoredReply, thread.agentId, language),
            ),
          }
        : null,
    );
    onInitialDraftConsumed?.();
  }, [
    clarification,
    initialContextRefs,
    initialDraft,
    initialAssistSource,
    initialReplyToMessageId,
    initialButlerContextReset,
    onInitialDraftConsumed,
    thread.messages,
    thread.agentId,
    language,
  ]);

  useEffect(() => {
    if (!clarification) {
      if (continuingClarification.current && !draftEdited.current) {
        setContextRefs([]);
        setAssistSource(undefined);
        continuingClarification.current = false;
        contextReset.current = false;
      }
      return;
    }
    if (handledClarification.current === clarification.messageId) return;
    handledClarification.current = clarification.messageId;
    if (draftEdited.current) return;
    setContextRefs(clarification.references);
    setAssistSource(clarification.source);
    continuingClarification.current = true;
    contextReset.current = false;
  }, [clarification]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', event => {
      if (Platform.OS === 'ios') {
        setKeyboardInset(
          keyboardBottomInset(
            event.endCoordinates,
            windowSize.height,
            safeAreaInsets.bottom,
          ),
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
            keyboardBottomInset(
              event.endCoordinates,
              windowSize.height,
              safeAreaInsets.bottom,
            ),
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
  }, [safeAreaInsets.bottom, windowSize.height]);

  const send = () => {
    const content = draft.trim();
    if (!content || submitting.current || contextAccessWarning) {
      return;
    }
    submitting.current = true;
    setDraft('');
    const selectedReferences = contextRefs;
    const selectedSource = assistSource;
    const submittedReset = contextReset.current;
    draftEdited.current = false;
    continuingClarification.current = false;
    contextReset.current = false;
    setContextRefs([]);
    setAssistSource(undefined);
    setIsSending(true);
    const targetId = replyTarget?.id || null;
    setReplyTarget(null);
    Promise.resolve(
      onSend(
        content,
        undefined,
        targetId,
        selectedReferences,
        selectedSource,
        ...(submittedReset ? ([true] as const) : []),
      ),
    )
      .then(() => tasks.refresh())
      .catch(error =>
        onActionError(error instanceof Error ? error.message : '消息发送失败'),
      )
      .finally(() => {
        submitting.current = false;
        setIsSending(false);
      });
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
        draftEdited.current = true;
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
        {thread.agentId === 'album-manager' && token && onAuthorizeAlbumAI ? (
          <AlbumAssistantStatus
            token={token}
            palette={messagePalette}
            language={language}
            onAuthorize={async () => {
              preserveDraftForAccess();
              return onAuthorizeAlbumAI();
            }}
            onError={onActionError}
          />
        ) : null}
        <View
          ref={messageAreaRef}
          collapsable={false}
          onLayout={closeMessageMenu}
          style={styles.chatMessageArea}
        >
          <FlatList
            ref={listRef}
            style={styles.chatMessageList}
            data={thread.messages}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.messages}
            initialNumToRender={Math.max(thread.messages.length, 12)}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            scrollEnabled={!isChatInteractionBlocked}
            ListFooterComponent={
              <View>
                {tasks.error || tasks.decisionError ? (
                  <View>
                    <Text
                      accessibilityRole="alert"
                      style={{ color: palette.rose }}
                    >
                      {tasks.error || tasks.decisionError}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => {
                        tasks.refresh();
                      }}
                      style={taskStyles.refresh}
                    >
                      <Text style={{ color: palette.text }}>
                        {textFor(language, '刷新任务', 'Refresh tasks')}
                      </Text>
                    </Pressable>
                  </View>
                ) : null}
                {tasks.tasks.map(task => (
                  <AITaskCard
                    key={task.id}
                    task={task}
                    palette={messagePalette}
                    language={language}
                    busy={tasks.pendingTaskId !== null}
                    onDecision={operation => {
                      tasks.decide(task, operation);
                    }}
                    renderArtifact={artifact => (
                      <Artifact
                        artifact={artifact}
                        palette={messagePalette}
                        language={language}
                        onPreview={() => {
                          const index = thread.messages.findIndex(
                            message => message.id === artifact.id,
                          );
                          if (index >= 0)
                            listRef.current?.scrollToIndex({
                              index,
                              animated: true,
                            });
                          else {
                            onRefreshThread?.().catch(error =>
                              onActionError(error.message),
                            );
                            onActionError(
                              textFor(
                                language,
                                '正在刷新对话成果，请稍后查看。',
                                'Refreshing conversation results. Please check again.',
                              ),
                            );
                          }
                        }}
                      />
                    )}
                  />
                ))}
                <View style={styles.messageFooterSpacer} />
              </View>
            }
            onScrollToIndexFailed={info =>
              listRef.current?.scrollToOffset({
                offset: info.averageItemLength * info.index,
                animated: true,
              })
            }
            onLayout={() => scrollToBottom(false)}
            renderItem={renderMessage}
          />
          {selectedMessage && messageMenuPosition ? (
            <ChatMessageMenu
              palette={messagePalette}
              language={language}
              selectedMessage={selectedMessage}
              position={messageMenuPosition}
              arrowLeft={messageMenuPosition.arrowLeft}
              canRecall={canRecallSelectedMessage}
              onClose={closeMessageMenu}
              onReply={setReplyTarget}
              onDeleteMessage={onDeleteMessage}
              onRecallMessage={onRecallMessage}
              onActionMessage={onActionError}
            />
          ) : null}
        </View>
        <ChatComposer
          palette={messagePalette}
          language={language}
          threadTitle={thread.title}
          threadId={thread.id}
          draft={draft}
          isSending={isSending}
          isRecognizingSpeech={isRecognizingSpeech}
          replyTarget={replyTarget}
          contextRefs={contextRefs}
          assistSource={assistSource}
          contextAccessWarning={contextAccessWarning}
          onOpenAgentAccess={openAgentAccess}
          onRemoveContextReference={index => {
            draftEdited.current = true;
            setContextRefs(current => {
              const next = current.filter(
                (_, itemIndex) => index !== itemIndex,
              );
              if (
                continuingClarification.current &&
                next.length < current.length
              )
                contextReset.current = true;
              return next;
            });
          }}
          onChangeDraft={value => {
            draftEdited.current = true;
            setDraft(value);
          }}
          onClearReplyTarget={() => setReplyTarget(null)}
          onFocusInput={() => {
            assist.dismiss();
            closeMessageMenu();
            scrollToBottom(true);
            setTimeout(() => scrollToBottom(true), 80);
          }}
          onRecognizeSpeech={recognizeSpeech}
          onSend={send}
          onActionMessage={onActionError}
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

const taskStyles = StyleSheet.create({
  refresh: { minHeight: 44, padding: 12 },
});
