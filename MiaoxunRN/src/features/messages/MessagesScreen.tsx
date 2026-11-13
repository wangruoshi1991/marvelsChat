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
  Modal,
  PanResponder,
  Platform,
  Pressable,
  Text,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import {
  AgentDTO,
  AvatarConfigDTO,
  StationAlbumDTO,
  StationMediaAssetDTO,
} from '../../models/api';
import {
  ContentPreview,
  ContentPreviewContext,
  ComicPublishDraft,
  contentPreviewReference,
} from '../../models/chatContentPreview';
import { useChatContentPreviews } from './useChatContentPreviews';
import { ContentPreviewMessageCard, Action } from './ContentPreviewMessageCard';
import { ComicDetailScreen } from './ComicDetailScreen';
import { MyComicsScreen } from './MyComicsScreen';
import { ComicSourcePickerSheet } from './ComicSourcePickerSheet';
import { PrivateReferenceImage } from './PrivateReferenceImage';
import { AgentWorkspace } from '../../models/agentWorkspace';
import {
  WorkspaceContinuationDraft,
  WorkspaceDiscussionContext,
} from '../../models/workspaceContext';
import { WorkspaceContextCard } from './WorkspaceContextCard';
import { useChatSpeech } from './useChatSpeech';
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
import { buildChatTimeline, ChatTimelineItem } from './chatTimeline';
import { useContributionFocus } from './useContributionFocus';
import { useChatFollow } from './useChatFollow';
import { WorkspaceContributionNotice } from './WorkspaceContributionNotice';

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
  contentPreviewContext?: ContentPreviewContext;
};

const recallWindowMs = 60 * 1000;
const chatSwipeCloseThreshold = -84;
const chatVisiblePosition = { minIndexForVisible: 1 };

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
  onPublishComic,
  albums = [],
  mediaAssets = [],
  initialContentPreviewContext,
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
    contentPreviewContext?: ContentPreviewContext,
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
  initialContentPreviewContext?: ContentPreviewContext;
  agentGrantedScopes?: string[];
  onOpenAgentAccess?: () => void;
  onPublishComic?: (draft: ComicPublishDraft) => void;
  albums?: StationAlbumDTO[];
  mediaAssets?: StationMediaAssetDTO[];
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
  const isComic = thread.agentId === 'comic-diary' && thread.kind !== 'group';
  const [comicDetail, setComicDetail] = useState<{
    comicId?: string;
    preview?: ContentPreview;
  }>();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [contentContext, setContentContext] = useState<ContentPreviewContext>();
  const [visibleMessages, setVisibleMessages] = useState<string[]>(() =>
    thread.messages.slice(-12).map(message => message.id),
  );
  const chatScope = `${token || ''}:${currentUserId}:${thread.id}`;
  const chatScopeRef = useRef(chatScope);
  chatScopeRef.current = chatScope;
  const pickerEpoch = useRef(0);
  useEffect(
    () => () => {
      pickerEpoch.current += 1;
    },
    [chatScope],
  );
  const previews = useChatContentPreviews({
    token: token || '',
    userId: currentUserId,
    threadId: thread.id,
    agentId: thread.agentId,
    messages: thread.messages,
    visibleMessageIds: visibleMessages,
    active: isComic && !comicDetail && !libraryOpen && !sourcesOpen,
  });
  const viewability = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: ChatTimelineItem }> }) =>
      setVisibleMessages(
        viewableItems.flatMap(({ item }) =>
          item.kind === 'message' ? [item.message.id] : [],
        ),
      ),
  ).current;
  const contributionAgentId =
    thread.kind !== 'group' &&
    (professional || thread.agentId === 'miaoxun-butler')
      ? thread.agentId || undefined
      : undefined;
  const contributions = useWorkspaceContributions(
    token,
    contributionAgentId,
    contributionAgentId && workspaceContribution
      ? {
          id: workspaceContribution.workspace.id,
          nodeId: workspaceContribution.step.id,
        }
      : undefined,
  );
  const timeline = useMemo(
    () => buildChatTimeline(thread.messages, contributions.contributions),
    [thread.messages, contributions.contributions],
  );
  const initialContextReset = professional
    ? initialAgentContextReset
    : initialButlerContextReset;
  const [draft, setDraft] = useState('');
  const [contextRefs, setContextRefs] = useState<AIContextReference[]>([]);
  const contextRefsRef = useRef(contextRefs);
  contextRefsRef.current = contextRefs;
  const [assistSource, setAssistSource] = useState<AssistMessageSource>();
  const [workspaceContext, setWorkspaceContext] =
    useState<WorkspaceDiscussionContext>();
  const [contextResetNotice, setContextResetNotice] = useState(false);
  const submitting = useRef(false);
  const sendAttempt = useRef(0);
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
  const {
    isRecognizing: isRecognizingSpeech,
    start: startChatSpeech,
    finish: finishLongSpeech,
    cancel: cancelChatSpeech,
  } = useChatSpeech({
    threadId: thread.id,
    token,
    language,
    onText: (text, prefix, mode) => {
      draftEdited.current = true;
      setDraft(current => {
        const before = mode === 'tap' ? current.trimEnd() : prefix;
        return before ? `${before} ${text}` : text;
      });
    },
    onError: error =>
      onActionError(
        error instanceof Error
          ? error.message
          : textFor(language, '语音识别失败', 'Speech recognition failed'),
      ),
  });
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
        ...(contentContext
          ? { contentPreviewContext: { ...contentContext } }
          : {}),
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
      contentContext,
    ],
  );
  const closeChat = useCallback(() => {
    cancelChatSpeech();
    if (workspaceContext || contextReset.current) preserveDraftForAccess();
    onBack();
  }, [onBack, preserveDraftForAccess, cancelChatSpeech, workspaceContext]);
  const openAgentAccess = onOpenAgentAccess
    ? () => {
        cancelChatSpeech();
        preserveDraftForAccess();
        onOpenAgentAccess();
      }
    : undefined;
  const [isThreadSettingsOpen, setIsThreadSettingsOpen] = useState(false);
  const isChatInteractionBlocked = assist.isActive || Boolean(selectedMessage);
  const interactionBlockedRef = useRef(isChatInteractionBlocked);
  interactionBlockedRef.current = isChatInteractionBlocked;
  const listRef = useRef<FlatList<ChatTimelineItem>>(null);
  const {
    onScroll: onChatScroll,
    shouldFollow,
    follow,
  } = useChatFollow(
    `${token}:${currentUserId}:${thread.id}:${
      workspaceContribution?.step.id || ''
    }`,
    Boolean(workspaceContribution),
  );
  const { focus: focusContribution, onScrollToIndexFailed } =
    useContributionFocus({
      scope: `${token}:${currentUserId}:${thread.id}:${
        workspaceContribution?.workspace.id || ''
      }:${workspaceContribution?.step.id || ''}`,
      index: workspaceContribution
        ? timeline.findIndex(
            item =>
              item.kind === 'contribution' &&
              item.contribution.step.id === workspaceContribution.step.id,
          )
        : -1,
      listRef,
      blocked: isChatInteractionBlocked,
    });
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
  const restoreWorkspaceContext = (context: WorkspaceDiscussionContext) => {
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
  };
  const renderMessage = ({
    item,
    index,
  }: {
    item: ChatTimelineItem;
    index: number;
  }) => {
    if (item.kind === 'contribution')
      return (
        <WorkspaceContributionCard
          contribution={item.contribution}
          agents={agents}
          token={token}
          palette={messagePalette}
          language={language}
          agentId={thread.agentId || undefined}
          onDiscuss={restoreWorkspaceContext}
          onOpenWorkspace={onOpenWorkspace}
        />
      );
    const timelineMessage = item.message;
    const previous = index > 0 ? timeline[index - 1] : undefined;
    const reference = isComic
      ? contentPreviewReference(timelineMessage, thread.id, thread.agentId)
      : null;
    const entry = reference ? previews.entries[reference.id] : undefined;
    const contentPreviewCard =
      reference && token ? (
        <ContentPreviewMessageCard
          key={`${chatScope}:${timelineMessage.id}:${reference.id}`}
          token={token}
          palette={messagePalette}
          language={language}
          {...entry}
          busy={Boolean(entry?.busy) || isSending}
          loading={!entry || entry.loading}
          onConfirm={() => {
            if (submitting.current) return;
            previews.confirm(reference.id).catch(onActionError);
          }}
          onReject={() => {
            if (submitting.current) return;
            previews.reject(reference.id).catch(onActionError);
          }}
          onRefresh={() => {
            previews.refresh(reference.id).catch(onActionError);
          }}
          onOpen={() => {
            if (entry?.preview)
              setComicDetail({
                preview: entry.preview,
                ...(entry.preview.kind === 'comic' && entry.preview.result
                  ? { comicId: entry.preview.result.comicDiaryId }
                  : {}),
              });
          }}
          onModify={() => {
            if (submitting.current || !entry?.preview) return;
            draftEdited.current = true;
            contextGeneration.current += 1;
            setContentContext({
              id: entry.preview.id,
              revision: entry.preview.revision,
            });
            setReplyTarget(null);
            setWorkspaceContext(undefined);
            contextReset.current = false;
            setContextResetNotice(false);
            setContextRefs(
              entry.preview.sources.flatMap(source =>
                source.type === 'station-photo' ||
                source.type === 'station-diary' ||
                source.type === 'chat-message'
                  ? [
                      {
                        kind: source.type,
                        id: source.id,
                        title: source.title,
                      } as AIContextReference,
                    ]
                  : [],
              ),
            );
          }}
        />
      ) : undefined;
    return (
      <ChatMessageItem
        token={token}
        item={timelineMessage}
        previousMessage={previous?.kind === 'message' ? previous.message : null}
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
        contentPreviewCard={contentPreviewCard}
        onOpenAgentAccess={openAgentAccess}
        onOpenWorkspace={onOpenWorkspace}
        onRestoreWorkspaceContext={restoreWorkspaceContext}
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
              message.metadata?.butlerContextReset === true ? true : undefined,
              message.metadata?.workspaceContext,
              message.metadata?.agentContextReset === true ? true : undefined,
              message.metadata?.contentPreviewContext,
            ),
          ).catch(() => undefined);
        }}
      />
    );
  };

  useEffect(() => {
    if (assist.isActive) {
      closeMessageMenu();
      resetChatSwipe();
    }
  }, [assist.isActive, closeMessageMenu, resetChatSwipe]);

  useEffect(() => {
    focusContribution();
  }, [focusContribution]);

  const previousScroll = useRef({ scope: '', messages: 0, lastKey: '' });
  useEffect(() => {
    const scope = `${token}:${currentUserId}:${thread.id}`;
    const initial = previousScroll.current.scope !== scope;
    const newMessages =
      !initial && thread.messages.length > previousScroll.current.messages;
    const lastKey = timeline[timeline.length - 1]?.key || '';
    const newTail =
      !initial &&
      lastKey !== previousScroll.current.lastKey &&
      Boolean(lastKey) &&
      (!previousScroll.current.lastKey ||
        timeline.some(item => item.key === previousScroll.current.lastKey));
    previousScroll.current = {
      scope,
      messages: thread.messages.length,
      lastKey,
    };
    if (workspaceContribution && initial) return;
    if (!initial && ((!newMessages && !newTail) || !shouldFollow())) return;
    scrollToBottom(false);
    const afterPaint = setTimeout(() => {
      if (shouldFollow()) scrollToBottom(false);
    }, 80);
    return () => clearTimeout(afterPaint);
  }, [
    scrollToBottom,
    token,
    currentUserId,
    thread.id,
    thread.messages.length,
    timeline,
    workspaceContribution,
    contributions.historyLoaded,
    shouldFollow,
  ]);

  useEffect(() => {
    sendAttempt.current += 1;
    submitting.current = false;
    setIsSending(false);
    setDraft('');
    setContextRefs([]);
    setAssistSource(undefined);
    setWorkspaceContext(undefined);
    setContentContext(undefined);
    setComicDetail(undefined);
    setLibraryOpen(false);
    setSourcesOpen(false);
    setReplyTarget(null);
    contextReset.current = false;
    contextGeneration.current += 1;
    setContextResetNotice(false);
  }, [token, currentUserId, thread.id]);

  useEffect(() => {
    setVisibleMessages(thread.messages.slice(-12).map(message => message.id));
  }, [token, currentUserId, thread.id, thread.messages]);

  useEffect(() => {
    if (
      !initialDraft &&
      !initialContextRefs?.length &&
      !initialAssistSource &&
      !initialReplyToMessageId &&
      !initialContextReset &&
      !initialWorkspaceContext &&
      !initialContentPreviewContext
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
    setContentContext(initialContentPreviewContext);
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
    initialContentPreviewContext,
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
      if (shouldFollow()) {
        scrollToBottom(true);
        setTimeout(() => {
          if (shouldFollow()) scrollToBottom(true);
        }, 80);
      }
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
        if (shouldFollow()) scrollToBottom(true);
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
  }, [safeAreaInsets.bottom, scrollToBottom, shouldFollow, windowSize.height]);

  const send = () => {
    const content = draft.trim();
    if (!content || submitting.current || contextAccessWarning) {
      return;
    }
    submitting.current = true;
    const attempt = ++sendAttempt.current;
    follow();
    scrollToBottom(true);
    setDraft('');
    const selectedReferences = contextRefs;
    const selectedSource = assistSource;
    const selectedWorkspace = workspaceContext;
    const selectedPreview = contentContext;
    const submittedReset = contextReset.current;
    const submittedGeneration = contextGeneration.current;
    const submittedScope = chatScopeRef.current;
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
        ...((selectedPreview
          ? [undefined, undefined, undefined, selectedPreview]
          : submittedReset && professional
          ? [undefined, undefined, true]
          : selectedWorkspace
          ? [undefined, selectedWorkspace]
          : submittedReset
          ? [true]
          : []) as [
          boolean?,
          WorkspaceDiscussionContext?,
          boolean?,
          ContentPreviewContext?,
        ]),
      ),
    )
      .then(result => {
        if (chatScopeRef.current !== submittedScope) return;
        if (
          result === true &&
          selectedPreview &&
          contextGeneration.current === submittedGeneration
        )
          setContentContext(undefined);
        if (
          result === true &&
          submittedReset &&
          contextGeneration.current === submittedGeneration
        ) {
          contextReset.current = false;
          setContextResetNotice(false);
        }
        if (result === true)
          Object.keys(previews.entries).forEach(id => {
            previews.refresh(id).catch(onActionError);
          });
        return tasks.refresh();
      })
      .catch(error => {
        if (
          chatScopeRef.current === submittedScope &&
          sendAttempt.current === attempt
        )
          onActionError(
            error instanceof Error ? error.message : '消息发送失败',
          );
      })
      .finally(() => {
        if (
          chatScopeRef.current !== submittedScope ||
          sendAttempt.current !== attempt
        )
          return;
        submitting.current = false;
        setIsSending(false);
      });
  };

  const recognizeSpeech = () => {
    Keyboard.dismiss();
    closeMessageMenu();
    startChatSpeech('tap', draft);
  };

  const startLongSpeech = useCallback(() => {
    Keyboard.dismiss();
    closeMessageMenu();
    startChatSpeech('hold', draft);
  }, [closeMessageMenu, draft, startChatSpeech]);

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
      const origin = chatScopeRef.current;
      const epoch = ++pickerEpoch.current;
      onPrepareComposerTool(tool)
        .then(result => {
          if (chatScopeRef.current !== origin || pickerEpoch.current !== epoch)
            return;
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
          const current = contextRefsRef.current;
          if (
            current.some(
              item => item.kind === reference.kind && item.id === reference.id,
            )
          )
            return;
          if (current.length >= 6) {
            onActionError(
              textFor(
                language,
                '最多选择6份素材，请先移除一份。',
                'Select at most six sources. Remove one first.',
              ),
            );
            return;
          }
          contextRefsRef.current = [...current, { ...reference }];
          setContextRefs(contextRefsRef.current);
        })
        .catch(error => {
          if (chatScopeRef.current !== origin || pickerEpoch.current !== epoch)
            return;
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
          {isComic ? (
            <View style={taskStyles.comicEntry}>
              <Text
                style={[
                  taskStyles.comicHint,
                  { color: messagePalette.secondaryText },
                ]}
              >
                {textFor(
                  language,
                  '直接聊天创作；参考图片需附故事说明，不会自动识别原图。',
                  'Create in chat. Add a story description for reference images; pixels are not inspected.',
                )}
              </Text>
              <Action
                label={textFor(language, '选参考图', 'Choose references')}
                palette={messagePalette}
                onPress={() => {
                  Keyboard.dismiss();
                  setSourcesOpen(true);
                }}
              />
              <Action
                label={textFor(language, '我的漫画', 'My comics')}
                palette={messagePalette}
                onPress={() => {
                  Keyboard.dismiss();
                  setLibraryOpen(true);
                }}
              />
            </View>
          ) : null}
          {isComic && contentContext ? (
            <View style={taskStyles.contextResetNotice}>
              <Text style={{ color: messagePalette.secondaryText }}>
                {textFor(
                  language,
                  '继续基于原提案文字修改，仅使用下方所选素材；移除素材不会删除已有提案文字。已确认作品的原参考素材需重新选择。',
                  'Revise the existing proposal text using only the selected sources below. Removing sources retains authored text. Reselect references from a confirmed work.',
                )}
              </Text>
              <Action
                label={textFor(language, '开始新创作', 'Start a new creation')}
                palette={messagePalette}
                onPress={() => {
                  setContentContext(undefined);
                  setContextRefs([]);
                  contextReset.current = true;
                }}
              />
            </View>
          ) : null}
          {isComic &&
          contextRefs.some(reference => reference.kind === 'station-photo') &&
          token ? (
            <View style={taskStyles.comicSources}>
              {contextRefs
                .filter(reference => reference.kind === 'station-photo')
                .map(reference => (
                  <PrivateReferenceImage
                    key={`${token}:${reference.id}`}
                    token={token}
                    mediaAssetId={reference.id}
                    palette={messagePalette}
                    language={language}
                    label={
                      reference.title ||
                      textFor(language, '参考图', 'Reference image')
                    }
                    style={taskStyles.comicThumbnail}
                  />
                ))}
            </View>
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
              data={timeline}
              keyExtractor={item => item.key}
              contentContainerStyle={styles.messages}
              initialNumToRender={12}
              onViewableItemsChanged={viewability}
              maintainVisibleContentPosition={chatVisiblePosition}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              scrollEnabled={!isChatInteractionBlocked}
              onScroll={onChatScroll}
              scrollEventThrottle={16}
              ListHeaderComponent={
                contributions.hasMore || contributions.error ? (
                  <View>
                    {contributions.error ? (
                      <Text
                        accessibilityRole="alert"
                        style={{ color: palette.rose }}
                      >
                        {contributions.error}
                      </Text>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: contributions.loading }}
                      disabled={contributions.loading}
                      onPress={() => {
                        contributions.error
                          ? contributions.retry()
                          : contributions.loadMore();
                      }}
                      style={taskStyles.refresh}
                    >
                      <Text style={{ color: palette.text }}>
                        {contributions.loading
                          ? textFor(language, '正在加载', 'Loading')
                          : contributions.error
                          ? textFor(
                              language,
                              '重试协作贡献',
                              'Retry contributions',
                            )
                          : textFor(
                              language,
                              '加载更早的协作贡献',
                              'Load older contributions',
                            )}
                      </Text>
                    </Pressable>
                  </View>
                ) : null
              }
              ListFooterComponent={
                <View>
                  <WorkspaceContributionNotice
                    reasons={contributions.unavailableReasons}
                    palette={messagePalette}
                    language={language}
                    loading={contributions.loading}
                    onRetry={contributions.retry}
                    onOpenAgentAccess={openAgentAccess}
                  />
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
                            const index = timeline.findIndex(
                              item =>
                                item.kind === 'message' &&
                                item.message.id === artifact.id,
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
              onScrollToIndexFailed={onScrollToIndexFailed}
              onLayout={() =>
                workspaceContribution
                  ? focusContribution()
                  : contributions.historyLoaded || !shouldFollow()
                  ? undefined
                  : scrollToBottom(false)
              }
              onContentSizeChange={focusContribution}
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
                key={`${token}:${currentUserId}:${thread.id}:${
                  workspaceContext.id
                }:${workspaceContext.revision}:${
                  workspaceContext.currentRound
                }:${workspaceContext.nodeId || ''}`}
                token={token}
                context={workspaceContext}
                agentId={thread.agentId}
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
            if (shouldFollow()) {
              scrollToBottom(true);
              setTimeout(() => {
                if (shouldFollow()) scrollToBottom(true);
              }, 80);
            }
          }}
          onOpenAssistant={openConversationAssistant}
          onStartLongSpeech={startLongSpeech}
          onFinishLongSpeech={finishLongSpeech}
          onRecognizeSpeech={recognizeSpeech}
          onSend={send}
        />
      </Animated.View>
      {isComic && token && (comicDetail || libraryOpen || sourcesOpen) ? (
        <Modal
          visible
          presentationStyle="fullScreen"
          onRequestClose={() => {
            if (comicDetail) setComicDetail(undefined);
            else {
              setLibraryOpen(false);
              setSourcesOpen(false);
            }
          }}
        >
          <SafeAreaProvider>
            <SafeAreaView
              style={[
                styles.chatSwipeSurface,
                { backgroundColor: messagePalette.background },
              ]}
            >
              {comicDetail ? (
                <ComicDetailScreen
                  key={`${chatScope}:${
                    comicDetail.comicId || comicDetail.preview?.id
                  }`}
                  token={token}
                  {...comicDetail}
                  palette={messagePalette}
                  language={language}
                  onBack={() => setComicDetail(undefined)}
                  onPublish={draftToPublish => {
                    setComicDetail(undefined);
                    setLibraryOpen(false);
                    onPublishComic?.(draftToPublish);
                  }}
                />
              ) : libraryOpen ? (
                <MyComicsScreen
                  key={chatScope}
                  token={token}
                  palette={messagePalette}
                  language={language}
                  onBack={() => setLibraryOpen(false)}
                  onOpen={comicId => setComicDetail({ comicId })}
                />
              ) : (
                <ComicSourcePickerSheet
                  key={chatScope}
                  token={token}
                  albums={albums}
                  mediaAssets={mediaAssets}
                  references={contextRefs}
                  palette={messagePalette}
                  language={language}
                  onClose={() => setSourcesOpen(false)}
                  onSelect={references => {
                    setContextRefs(references);
                    setSourcesOpen(false);
                  }}
                />
              )}
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      ) : null}
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
  comicHint: { flex: 1, minWidth: 100 },
  comicSources: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  comicThumbnail: { width: 44, height: 44, borderRadius: 6 },
  comicAction: { fontWeight: '600' },
  comicEntry: {
    flexWrap: 'wrap',
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 4,
    gap: 8,
  },
  contextResetNotice: { paddingHorizontal: 16, paddingVertical: 8 },
});
