import type { AssistMessageSource } from '../assist/assistMessageSource';
import {
  isContextReference,
  type AIContextReference,
} from '../../models/aiTask';
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
import {
  WorkspaceContinuationDraft,
  WorkspaceDiscussionContext,
} from '../../models/workspaceContext';
import { WorkspaceContextCard } from './WorkspaceContextCard';
import {
  prepareSpeechRecognition,
  recognizeSpeechOnce,
  startSpeechRecognition,
  SpeechPermissionPreparation,
  SpeechRecognitionSession,
} from '../../services/speechToText';
import { displayText, publicPresenceText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { isLightPalette, Palette } from '../../shared/theme';
import { ChatHeader } from '../../shared/ui';
import { useAIAssist } from '../assist/AIAssistProvider';
import {
  AIAssistObjectReference,
  AIAssistPoint,
} from '../assist/aiAssistTypes';
import {
  ChatMessage,
  ChatThread,
  Language,
} from '../session/useMiaoxunSession';
import { ThreadListScreen } from './ThreadListScreen';
import { MessageTab, UserAvatarRenderer } from './messageTypes';
import { ChatComposer, ComposerTool } from './ChatComposer';
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
import { pendingConversationClarification } from './butlerClarification';
import { usesAgentDispatch } from '../../models/agentDispatch';
import { WorkspaceContributionCard } from './WorkspaceContributionCard';
import { useWorkspaceContributions } from './useWorkspaceContributions';
import type { WorkspaceContribution } from './WorkspaceContributionCard';

export type { MessageTab, UserAvatarRenderer };

export type ComposerPreparationResult =
  | AIContextReference
  | { reference?: AIContextReference; draftText?: string }
  | null;

export type ChatDraftSnapshot = {
  text: string;
  references: AIContextReference[];
  source?: AssistMessageSource;
  replyToMessageId?: string;
  butlerContextReset?: boolean;
  agentContextReset?: boolean;
  workspaceContext?: WorkspaceDiscussionContext;
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
  initialAgentContextReset,
  initialWorkspaceContext,
  agentGrantedScopes,
  onOpenAgentAccess,
  onOpenWorkspace,
  onPreserveDraftForAccess,
  onRefreshThread,
  onInitialDraftConsumed,
  onPrepareComposerTool,
  workspaceContribution,
  onConfirmUIPreferences,
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
    workspaceContext?: WorkspaceDiscussionContext,
    agentContextReset?: boolean,
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
  initialAgentContextReset?: boolean;
  initialWorkspaceContext?: WorkspaceDiscussionContext;
  agentGrantedScopes?: string[];
  onOpenAgentAccess?: () => void;
  onOpenWorkspace?: (
    workspace: AgentWorkspace,
    draft?: WorkspaceContinuationDraft,
  ) => void;
  onPreserveDraftForAccess?: (draft: ChatDraftSnapshot) => void;
  onRefreshThread?: () => Promise<void>;
  onInitialDraftConsumed?: () => void;
  /** Runs a real picker/upload and returns a server-backed context reference. */
  onPrepareComposerTool?: (
    tool: ComposerTool,
  ) => Promise<ComposerPreparationResult>;
  workspaceContribution?: WorkspaceContribution;
  onConfirmUIPreferences?: (
    id: string,
    baseRevision: number,
  ) => Promise<unknown>;
}) {
  const assist = useAIAssist();
  const professional = usesAgentDispatch(thread.agentId);
  const contributions = useWorkspaceContributions(
    token,
    thread.agentId && thread.agentId !== 'miaoxun-butler'
      ? thread.agentId
      : undefined,
  );
  const initialContextReset = professional
    ? initialAgentContextReset
    : initialButlerContextReset;
  const [draft, setDraft] = useState('');
  const [contextRefs, setContextRefs] = useState<AIContextReference[]>([]);
  const [assistSource, setAssistSource] = useState<AssistMessageSource>();
  const [workspaceContext, setWorkspaceContext] =
    useState<WorkspaceDiscussionContext>();
  const [contextResetNotice, setContextResetNotice] = useState(false);
  const submitting = useRef(false);
  const clarification = useMemo(
    () => pendingConversationClarification(thread),
    [thread],
  );
  const handledClarification = useRef<string | null>(null);
  const draftEdited = useRef(false);
  const continuingClarification = useRef(false);
  const contextReset = useRef(false);
  const contextGeneration = useRef(0);
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
  const speechSessionRef = useRef<SpeechRecognitionSession | null>(null);
  const speechPermissionRef = useRef<SpeechPermissionPreparation | null>(null);
  const speechFinishRequestedRef = useRef(false);
  const speechPrefixRef = useRef('');
  // The composer grows when Butler shortcuts, context references, or a reply
  // preview are visible. Reserve that measured height in the message list so
  // the final bubble can still scroll above the composer instead of being
  // covered by it.
  const [composerHeight, setComposerHeight] = useState(0);
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
  const preserveDraftForAccess = useCallback(
    () =>
      onPreserveDraftForAccess?.({
        text: draft,
        references: contextRefs.map(reference => ({ ...reference })),
        ...(assistSource ? { source: { ...assistSource } } : {}),
        ...(replyTarget ? { replyToMessageId: replyTarget.id } : {}),
        ...(contextReset.current
          ? professional
            ? { agentContextReset: true }
            : { butlerContextReset: true }
          : {}),
        ...(workspaceContext
          ? { workspaceContext: { ...workspaceContext } }
          : {}),
      }),
    [
      assistSource,
      contextRefs,
      draft,
      onPreserveDraftForAccess,
      replyTarget,
      workspaceContext,
      professional,
    ],
  );
  const closeChat = useCallback(() => {
    if (workspaceContext || contextReset.current) preserveDraftForAccess();
    onBack();
  }, [onBack, preserveDraftForAccess, workspaceContext]);
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
  const isDarkPalette = !isLightPalette(messagePalette);
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
  const scrollToBottom = useCallback((animated: boolean) => {
    requestAnimationFrame(() => {
      if (interactionBlockedRef.current) {
        return;
      }
      listRef.current?.scrollToEnd({ animated });
    });
  }, []);
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
      closeChat();
    });
  }, [chatTranslateX, closeChat, closeMessageMenu, windowSize.width]);
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
      onConfirmUIPreferences={onConfirmUIPreferences}
      onOpenAgentAccess={openAgentAccess}
      onOpenWorkspace={onOpenWorkspace}
      onRestoreWorkspaceContext={context => {
        if (contextRefs.length || replyTarget) {
          onActionError(
            textFor(
              language,
              '请先移除其他素材或取消回复，再讨论原任务。',
              'Remove other references or the reply before discussing this task.',
            ),
          );
          return;
        }
        draftEdited.current = true;
        continuingClarification.current = false;
        contextReset.current = false;
        contextGeneration.current += 1;
        setContextResetNotice(false);
        setWorkspaceContext(context);
      }}
      onEditWorkspaceDiscussion={message => {
        const context = message.metadata?.workspaceContext;
        if (!context || draft.trim() || contextRefs.length || replyTarget) {
          onActionError(
            textFor(
              language,
              '请先处理当前输入，再重新编辑这条讨论。',
              'Finish the current draft before editing this discussion.',
            ),
          );
          return;
        }
        draftEdited.current = true;
        continuingClarification.current = false;
        contextReset.current = false;
        contextGeneration.current += 1;
        setContextResetNotice(false);
        setWorkspaceContext(context);
        setDraft(message.content);
      }}
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
            ...((message.metadata?.agentContextReset === true
              ? [undefined, undefined, true]
              : message.metadata?.workspaceContext
              ? [undefined, message.metadata.workspaceContext]
              : message.metadata?.butlerContextReset === true
              ? [true]
              : []) as [boolean?, WorkspaceDiscussionContext?, boolean?]),
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
  }, [scrollToBottom, thread.id, thread.messages.length]);

  useEffect(() => {
    if (
      !initialDraft &&
      !initialContextRefs?.length &&
      !initialAssistSource &&
      !initialReplyToMessageId &&
      !initialContextReset &&
      !initialWorkspaceContext
    ) {
      return;
    }
    draftEdited.current = Boolean(
      initialDraft?.trim() ||
        initialContextRefs?.length ||
        initialReplyToMessageId ||
        initialContextReset ||
        initialWorkspaceContext,
    );
    contextReset.current =
      !initialWorkspaceContext && initialContextReset === true;
    contextGeneration.current += 1;
    if (contextReset.current)
      handledClarification.current = clarification?.messageId || null;
    setContextResetNotice(
      !initialWorkspaceContext && initialContextReset === true,
    );
    continuingClarification.current = Boolean(
      !initialWorkspaceContext &&
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
    setContextRefs(initialWorkspaceContext ? [] : initialContextRefs || []);
    setWorkspaceContext(initialWorkspaceContext);
    setAssistSource(initialAssistSource);
    const restoredReply = thread.messages.find(
      message => message.id === initialReplyToMessageId,
    );
    setReplyTarget(
      restoredReply && !initialWorkspaceContext
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
    initialContextReset,
    initialWorkspaceContext,
    onInitialDraftConsumed,
    thread.messages,
    thread.agentId,
    language,
  ]);

  useEffect(() => {
    if (workspaceContext || initialWorkspaceContext || contextReset.current)
      return;
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
    setContextResetNotice(false);
  }, [
    clarification,
    contextResetNotice,
    initialWorkspaceContext,
    workspaceContext,
  ]);

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
  }, [safeAreaInsets.bottom, scrollToBottom, windowSize.height]);

  const send = () => {
    const content = draft.trim();
    if (!content || submitting.current || contextAccessWarning) {
      return;
    }
    submitting.current = true;
    setDraft('');
    const selectedReferences = contextRefs;
    const selectedSource = assistSource;
    const selectedWorkspace = workspaceContext;
    const submittedReset = contextReset.current;
    const submittedGeneration = contextGeneration.current;
    draftEdited.current = false;
    continuingClarification.current = false;
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
        ...((submittedReset && professional
          ? [undefined, undefined, true]
          : selectedWorkspace
          ? [undefined, selectedWorkspace]
          : submittedReset
          ? [true]
          : []) as [boolean?, WorkspaceDiscussionContext?, boolean?]),
      ),
    )
      .then(result => {
        if (
          result === true &&
          submittedReset &&
          contextGeneration.current === submittedGeneration
        ) {
          contextReset.current = false;
          setContextResetNotice(false);
        }
        return tasks.refresh();
      })
      .catch(error =>
        onActionError(error instanceof Error ? error.message : '消息发送失败'),
      )
      .finally(() => {
        submitting.current = false;
        setIsSending(false);
      });
  };

  const appendRecognizedSpeech = useCallback(
    (text: string) => {
      draftEdited.current = true;
      setDraft(current => {
        const trimmed = current.trimEnd();
        return trimmed ? `${trimmed} ${text}` : text;
      });
      setTimeout(() => scrollToBottom(true), 80);
    },
    [scrollToBottom],
  );

  const recognizeSpeech = () => {
    if (isRecognizingSpeech) {
      return;
    }

    Keyboard.dismiss();
    closeMessageMenu();
    setIsRecognizingSpeech(true);
    Promise.resolve(recognizeSpeechOnce(language))
      .then(appendRecognizedSpeech)
      .catch(error => {
        onActionError(
          error instanceof Error
            ? error.message
            : textFor(language, '语音识别失败', 'Speech recognition failed'),
        );
      })
      .finally(() => setIsRecognizingSpeech(false));
  };

  const startLongSpeech = useCallback(() => {
    if (isRecognizingSpeech || speechSessionRef.current) return;
    Keyboard.dismiss();
    closeMessageMenu();
    speechFinishRequestedRef.current = false;
    speechPrefixRef.current = draft.trimEnd();
    setIsRecognizingSpeech(true);
    let permission: SpeechPermissionPreparation;
    try {
      permission = prepareSpeechRecognition();
      speechPermissionRef.current = permission;
    } catch (error) {
      setIsRecognizingSpeech(false);
      onActionError(
        error instanceof Error
          ? error.message
          : textFor(language, '语音识别失败', 'Speech recognition failed'),
      );
      return;
    }
    permission.result
      .then(() => {
        if (speechFinishRequestedRef.current) return;
        const session = startSpeechRecognition(language, update => {
          const text = update.text.trim();
          if (!text) return;
          draftEdited.current = true;
          const prefix = speechPrefixRef.current;
          setDraft(prefix ? `${prefix} ${text}` : text);
          setTimeout(() => scrollToBottom(true), 40);
        });
        speechSessionRef.current = session;
        if (speechFinishRequestedRef.current) session.finish();
        return session.result;
      })
      .then(text => {
        if (typeof text === 'string' && text.trim()) {
          const prefix = speechPrefixRef.current;
          draftEdited.current = true;
          setDraft(prefix ? `${prefix} ${text.trim()}` : text.trim());
        }
      })
      .catch(error => {
        if (!speechFinishRequestedRef.current) {
          onActionError(
            error instanceof Error
              ? error.message
              : textFor(language, '语音识别失败', 'Speech recognition failed'),
          );
        }
      })
      .finally(() => {
        speechPermissionRef.current = null;
        speechSessionRef.current = null;
        speechFinishRequestedRef.current = false;
        setIsRecognizingSpeech(false);
      });
  }, [
    closeMessageMenu,
    draft,
    isRecognizingSpeech,
    language,
    onActionError,
    scrollToBottom,
  ]);

  const finishLongSpeech = useCallback(() => {
    speechFinishRequestedRef.current = true;
    if (speechSessionRef.current) {
      speechSessionRef.current.finish();
    } else {
      speechPermissionRef.current?.cancel();
    }
  }, []);

  useEffect(
    () => () => {
      speechFinishRequestedRef.current = true;
      speechSessionRef.current?.cancel();
      speechPermissionRef.current?.cancel();
    },
    [],
  );

  const openConversationAssistant = useCallback(() => {
    // This is a local snapshot of the current conversation entry point. A
    // thread id is metadata only; it must not be sent as a chat-message
    // reference because the server reference contract requires a message id.
    const object: AIAssistObjectReference = {
      kind: 'chat-draft',
      id: null,
      title: textFor(language, '当前对话', 'Current conversation'),
      metadata: {
        threadId: thread.id,
        threadTitle: displayText(language, thread.title),
      },
    };
    assist.askButler(object);
  }, [assist, language, thread.id, thread.title]);

  const handleComposerTool = useCallback(
    (tool: ComposerTool) => {
      if (tool === '妙猜猜') {
        openConversationAssistant();
        return;
      }
      if (!onPrepareComposerTool) {
        onActionError(
          textFor(
            language,
            `“${tool}”功能暂未接通，请使用已提供的入口。`,
            `“${tool}” is not connected yet. Please use an available entry point.`,
          ),
        );
        return;
      }
      onPrepareComposerTool(tool)
        .then(result => {
          if (!result) return;
          const reference = 'reference' in result ? result.reference : result;
          if (result && 'draftText' in result && result.draftText?.trim()) {
            draftEdited.current = true;
            setDraft(current =>
              current.trim()
                ? `${current.trim()}\n${result.draftText!.trim()}`
                : result.draftText!.trim(),
            );
          }
          if (!reference) return;
          if (!isContextReference(reference)) {
            throw new Error('附件引用无效，请重试。');
          }
          draftEdited.current = true;
          setContextRefs(current =>
            current.some(
              item => item.kind === reference.kind && item.id === reference.id,
            )
              ? current
              : [...current, { ...reference }],
          );
        })
        .catch(error => {
          onActionError(
            error instanceof Error
              ? error.message
              : textFor(
                  language,
                  '附件处理失败，请重试。',
                  'Attachment failed. Try again.',
                ),
          );
        });
    },
    [language, onActionError, onPrepareComposerTool, openConversationAssistant],
  );

  return (
    <KeyboardAvoidingView
      style={[
        styles.chatScreen,
        { backgroundColor: messagePalette.background },
      ]}
      enabled={false}
    >
      <Animated.View
        style={[
          styles.chatSwipeSurface,
          {
            marginBottom: keyboardInset,
            transform: [{ translateX: chatTranslateX }],
          },
        ]}
      >
        <View
          {...closeSwipeResponder.panHandlers}
          style={styles.chatSwipeSurface}
        >
          <ChatHeader
            palette={messagePalette}
            language={language}
            title={displayText(language, thread.title)}
            subtitle={presenceSubtitle}
            subtitleStatus={
              presenceSubtitle
                ? threadOnline
                  ? 'online'
                  : 'offline'
                : undefined
            }
            onBack={closeChat}
            onOpenSettings={
              canConfigureThread
                ? () => setIsThreadSettingsOpen(true)
                : undefined
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
                  {contributions.contributions
                    .slice()
                    .sort(
                      (a, b) =>
                        Number(b.step.id === workspaceContribution?.step.id) -
                        Number(a.step.id === workspaceContribution?.step.id),
                    )
                    .map(contribution => (
                      <WorkspaceContributionCard
                        key={contribution.step.id}
                        contribution={contribution}
                        agents={agents}
                        token={token}
                        palette={messagePalette}
                        language={language}
                      />
                    ))}
                  {contributions.unavailable ? (
                    <Text
                      accessibilityRole="alert"
                      style={{ color: palette.rose }}
                    >
                      {textFor(
                        language,
                        '部分协作贡献因授权或来源变化无法读取。',
                        'Some contributions are unavailable because access or sources changed.',
                      )}
                    </Text>
                  ) : null}
                  {contributions.hasMore ? (
                    <Text style={{ color: palette.secondaryText }}>
                      {textFor(
                        language,
                        '仅显示最近 50 条协作贡献。',
                        'Showing the 50 most recent contributions.',
                      )}
                    </Text>
                  ) : null}
                  {contributions.error ? (
                    <Text
                      accessibilityRole="alert"
                      style={{ color: palette.rose }}
                    >
                      {contributions.error}
                    </Text>
                  ) : null}
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
                  <View
                    style={[
                      styles.messageFooterSpacer,
                      { height: Math.max(48, composerHeight + 12) },
                    ]}
                  />
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
                onReply={message => {
                  if (workspaceContext) {
                    onActionError(
                      textFor(
                        language,
                        '请先移除任务关联，再回复其他消息。',
                        'Remove the task context before replying to another message.',
                      ),
                    );
                    return;
                  }
                  setReplyTarget(message);
                }}
                onDeleteMessage={onDeleteMessage}
                onRecallMessage={onRecallMessage}
                onActionMessage={onActionError}
              />
            ) : null}
          </View>
        </View>
        <ChatComposer
          palette={messagePalette}
          language={language}
          threadTitle={thread.title}
          draft={draft}
          isSending={isSending}
          isRecognizingSpeech={isRecognizingSpeech}
          replyTarget={replyTarget}
          assistSource={assistSource}
          contextRefs={contextRefs}
          quickCommands={
            thread.agentId === 'miaoxun-butler'
              ? ['生成今日待办', '今晚只提醒紧急事项', '同步相关 Agent']
              : undefined
          }
          workspaceActions={
            workspaceContext && token && onOpenWorkspace ? (
              <WorkspaceContextCard
                key={`${token}:${currentUserId}:${thread.id}:${workspaceContext.id}:${workspaceContext.revision}:${workspaceContext.currentRound}`}
                token={token}
                context={workspaceContext}
                palette={messagePalette}
                language={language}
                draft={draft}
                onOpenWorkspace={onOpenWorkspace}
                onChangeContext={context => {
                  draftEdited.current = true;
                  contextGeneration.current += 1;
                  setWorkspaceContext(context);
                }}
                onRemove={() => {
                  draftEdited.current = true;
                  continuingClarification.current = false;
                  contextReset.current = true;
                  contextGeneration.current += 1;
                  handledClarification.current =
                    clarification?.messageId || null;
                  setContextResetNotice(true);
                  setContextRefs([]);
                  setReplyTarget(null);
                  setWorkspaceContext(undefined);
                }}
              />
            ) : contextResetNotice ? (
              <View
                testID="chat-context-reset-notice"
                style={taskStyles.contextResetNotice}
              >
                <Text style={{ color: palette.secondaryText }}>
                  {textFor(
                    language,
                    '移除关联后将开始新的需求，不沿用之前的素材和待续需求。',
                    'Removing this task link starts a new request without previous references or pending follow-ups.',
                  )}
                </Text>
              </View>
            ) : professional && clarification ? (
              <Pressable
                testID="chat-agent-new-request"
                accessibilityRole="button"
                accessibilityLabel={textFor(
                  language,
                  '开始新的需求',
                  'Start a new request',
                )}
                style={taskStyles.contextResetNotice}
                onPress={() => {
                  draftEdited.current = true;
                  continuingClarification.current = false;
                  contextReset.current = true;
                  contextGeneration.current += 1;
                  handledClarification.current = clarification.messageId;
                  setContextRefs([]);
                  setAssistSource(undefined);
                  setContextResetNotice(true);
                }}
              >
                <Text style={{ color: palette.secondaryText }}>
                  {textFor(
                    language,
                    '正在补充上个需求 · 点击开始新的需求',
                    'Following up on the previous request · Start a new request',
                  )}
                </Text>
              </Pressable>
            ) : undefined
          }
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
              ) {
                contextReset.current = true;
                contextGeneration.current += 1;
                setContextResetNotice(true);
              }
              return next;
            });
          }}
          onChangeDraft={value => {
            draftEdited.current = true;
            setDraft(value);
          }}
          onQuickCommand={command => {
            draftEdited.current = true;
            const normalized = command.trim();
            if (!normalized) return;
            setDraft(current => {
              const alreadyIncluded = current
                .split(/\r?\n/)
                .some(line => line.trim() === normalized);
              if (alreadyIncluded) return current;
              return current.trim() ? `${current}\n${normalized}` : normalized;
            });
          }}
          onComposerTool={handleComposerTool}
          onLayout={event => {
            const nextHeight = event.nativeEvent.layout.height;
            setComposerHeight(current =>
              Math.abs(current - nextHeight) > 1 ? nextHeight : current,
            );
          }}
          onClearReplyTarget={() => setReplyTarget(null)}
          onFocusInput={() => {
            assist.dismiss();
            closeMessageMenu();
            scrollToBottom(true);
            setTimeout(() => scrollToBottom(true), 80);
          }}
          onOpenAssistant={openConversationAssistant}
          onStartLongSpeech={startLongSpeech}
          onFinishLongSpeech={finishLongSpeech}
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

const taskStyles = StyleSheet.create({
  refresh: { minHeight: 44, padding: 12 },
  contextResetNotice: { paddingHorizontal: 16, paddingVertical: 8 },
});
