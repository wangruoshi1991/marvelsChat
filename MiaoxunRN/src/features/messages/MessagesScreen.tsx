import { ChatBatchForwardSheet } from './ChatBatchForwardSheet';
import { canSelectForwardMessage } from './chatMessageSelection';
import { useDirectMessageReceipts } from './useDirectMessageReceipts';
import type { ChatMessageReceiptAvailability } from '../../services/api/messageReceiptApi';
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
  BackHandler,
  Easing,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  Share,
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
  MessageDTO,
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
import { AgentWorkspace } from '../../models/agentWorkspace';
import {
  WorkspaceContinuationDraft,
  WorkspaceDiscussionContext,
} from '../../models/workspaceContext';
import { WorkspaceContextCard } from './WorkspaceContextCard';
import { useChatSpeech } from './useChatSpeech';
import { useChatVoice } from './useChatVoice';
import { appErrorText } from '../../shared/i18n';
import { voiceCallConflictCopy } from '../../services/voiceCall/voiceCallResources';
import { chatVoiceMessageContent } from '../../services/chatVoiceAudio';
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
import { ChatForwardSheet } from './ChatForwardSheet';
import { useChatMessageText } from './useChatMessageText';
import { ChatMessageTextResult } from './ChatMessageTextResult';
import { ChatAttachmentReview } from './ChatAttachmentReview';
import type { ChatMessageAttachmentAction } from './ChatMessageAttachments';
import { resolveMessagePalette } from './messagePalette';
import { ThreadSettingsSheet } from './ThreadSettingsSheet';
import { isThreadOnline } from './messageUtils';
import { messageMenuGeometry } from './messageMenuGeometry';
import { AlbumAssistantStatus } from './AlbumAssistantStatus';
import { StationMediaPreviewScreen } from '../station/StationMediaPreviewScreen';
import { keyboardBottomInset } from './keyboardGeometry';
import { useReduceMotion } from '../../shared/useReduceMotion';
import {
  iosBackEdge,
  useIOSBackGesture,
} from '../../shared/gestures/useIOSBackGesture';
import { saveComicImageToLibrary } from '../../services/comicMediaLibrary';
import { stationContentApi } from '../../services/api/stationContentApi';
import { customStickerApi } from '../../services/api/customStickerApi';
import { messageApi } from '../../services/api/messageApi';
import type {
  ChatMessageTextAvailabilityDTO,
  CustomStickerDTO,
} from '../../models/api';
import { createIdempotencyKey } from '../../shared/createIdempotencyKey';
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
import { useChatAttachments } from './useChatAttachments';
import { failedAttachmentSendBlockReason } from './chatAttachmentSendState';
import {
  pickStationImagesFromLibrary,
  pickStationPhotoFromLibrary,
  takeStationPhoto,
} from '../../services/stationMediaPicker';
import {
  pickChatVideo,
  pickStationFile,
  releaseStationFile,
} from '../../services/stationFilePicker';

export type { MessageTab, UserAvatarRenderer };

export type ComposerPreparationResult =
  | AIContextReference
  | { reference?: AIContextReference; draftText?: string }
  | null;
export type ComposerToolTarget = {
  threadId: string;
  kind: ChatThread['kind'];
  agentId?: string;
};

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
const chatVisiblePosition = { minIndexForVisible: 1 };

export function MessagesScreen(
  props: React.ComponentProps<typeof ThreadListScreen>,
) {
  return <ThreadListScreen {...props} />;
}

export function ChatScreen({
  token,
  chatMessageText,
  chatVideoEnabled = false,
  onStartVoiceCall,
  voiceCallOpen = false,
  chatMessageReceipts,
  receiptActive = true,
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
  onGroupLeft,
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
  forwardTargets = [],
  onForwardComplete,
  onInitialDraftConsumed,
  onPrepareComposerTool,
  workspaceContribution,
  onConfirmUIPreferences,
}: {
  token?: string;
  chatMessageText?: ChatMessageTextAvailabilityDTO;
  chatVideoEnabled?: boolean;
  onStartVoiceCall?: () => void;
  voiceCallOpen?: boolean;
  chatMessageReceipts?: ChatMessageReceiptAvailability;
  receiptActive?: boolean;
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
    attachmentIds?: string[],
    stickerId?: string,
  ) => void | Promise<void | boolean>;
  onDeleteMessage: (messageId: string) => void | Promise<void>;
  onRecallMessage: (messageId: string) => void | Promise<void>;
  onSetMuted: (muted: boolean) => Promise<void>;
  onGroupLeft?: () => void | Promise<void>;
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
  forwardTargets?: ChatThread[];
  onForwardComplete?: (destination: ChatThread, messages: MessageDTO[]) => void;
  onInitialDraftConsumed?: () => void;
  /** Runs a real picker/upload and returns a server-backed context reference. */
  onPrepareComposerTool?: (
    tool: ComposerTool,
    target: ComposerToolTarget,
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
  const [locallyLeftGroupId, setLocallyLeftGroupId] = useState<string | null>(
    null,
  );
  const [contentContext, setContentContext] = useState<ContentPreviewContext>();
  const [contentContextTitle, setContentContextTitle] = useState<string>();
  const [customStickers, setCustomStickers] = useState<CustomStickerDTO[]>([]);
  const [customStickerState, setCustomStickerState] = useState<
    'idle' | 'loading' | 'uploading' | 'error'
  >('idle');
  const [customStickerDeletingIds, setCustomStickerDeletingIds] = useState<
    string[]
  >([]);
  const [customStickerReload, setCustomStickerReload] = useState(0);
  const customStickerErrorReporter = useRef(onActionError);
  customStickerErrorReporter.current = onActionError;
  const [visibleMessages, setVisibleMessages] = useState<string[]>(() =>
    thread.messages.slice(-12).map(message => message.id),
  );
  const chatScope = `${token || ''}:${currentUserId}:${thread.id}`;
  const chatScopeRef = useRef(chatScope);
  chatScopeRef.current = chatScope;
  const pickerEpoch = useRef(0);
  const chatScopeActive = useRef(true);
  useEffect(() => {
    chatScopeActive.current = true;
    setCustomStickerDeletingIds([]);
    return () => {
      chatScopeActive.current = false;
      pickerEpoch.current += 1;
    };
  }, [chatScope]);
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
  const ordinaryAttachmentTarget =
    thread.kind === 'direct' || thread.kind === 'group';
  const hasLeftGroup =
    thread.kind === 'group' &&
    (thread.status === '已退出群聊' || locallyLeftGroupId === thread.id);
  const ordinaryAttachmentsEnabled =
    ordinaryAttachmentTarget && !hasLeftGroup && Boolean(token);
  const ordinaryAttachmentsEnabledRef = useRef(ordinaryAttachmentsEnabled);
  ordinaryAttachmentsEnabledRef.current = ordinaryAttachmentsEnabled;
  const chatAttachments = useChatAttachments({
    userId: currentUserId,
    threadId: thread.id,
    token: token || '',
    enabled: ordinaryAttachmentsEnabled,
    onCleanupError: onActionError,
  });
  useEffect(() => {
    if (!token || !ordinaryAttachmentTarget || hasLeftGroup) {
      setCustomStickers([]);
      setCustomStickerState('idle');
      return;
    }
    let active = true;
    setCustomStickers([]);
    setCustomStickerState('loading');
    customStickerApi
      .list(token)
      .then(items => {
        if (active) {
          setCustomStickers(items);
          setCustomStickerState('idle');
        }
      })
      .catch(error => {
        if (active) {
          setCustomStickerState('error');
          customStickerErrorReporter.current(
            error instanceof Error
              ? error.message
              : '自定义表情读取失败，请重试。',
          );
        }
      });
    return () => {
      active = false;
    };
  }, [
    chatScope,
    currentUserId,
    customStickerReload,
    hasLeftGroup,
    ordinaryAttachmentTarget,
    token,
  ]);
  const failedAttachmentBlockReason = failedAttachmentSendBlockReason(
    chatAttachments.attachmentIds,
    thread.messages,
  );
  const attachmentSendBlockReason =
    chatAttachments.sendBlockReason || failedAttachmentBlockReason;
  const [attachmentReviewScope, setAttachmentReviewScope] = useState<string>();
  const contextRefsRef = useRef(contextRefs);
  contextRefsRef.current = contextRefs;
  const [assistSource, setAssistSource] = useState<AssistMessageSource>();
  const [workspaceContext, setWorkspaceContext] =
    useState<WorkspaceDiscussionContext>();
  const [contextResetNotice, setContextResetNotice] = useState(false);
  const submitting = useRef(false);
  const sendAttempt = useRef(0);
  const clarification = useMemo(
    () =>
      pendingConversationClarification(
        thread,
        agents.find(agent => agent.key === thread.agentId)?.version,
      ),
    [thread, agents],
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
  const chatVoice = useChatVoice({
    scope: `${chatScope}:${ordinaryAttachmentsEnabled}`,
    threadId: thread.id,
    token,
    onError: onActionError,
  });
  const discardChatVoice = chatVoice.discard;
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
  const currentVoiceStatus = chatVoice.status;
  useEffect(() => {
    if (voiceCallOpen) cancelChatSpeech();
    if (
      voiceCallOpen &&
      ['preparing', 'recording', 'finishing'].includes(currentVoiceStatus)
    )
      discardChatVoice();
  }, [voiceCallOpen, currentVoiceStatus, discardChatVoice, cancelChatSpeech]);
  const keyboardInset = useRef(new Animated.Value(0)).current;
  const keyboardInsetRef = useRef(0);
  const reduceMotion = useReduceMotion();
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedMessage, setSelectedMessage] = useState<ChatMessage | null>(
    null,
  );
  const directionalTools = useRef<(() => void) | null>(null);
  const [menuAttachmentId, setMenuAttachmentId] = useState<string>();
  const messageText = useChatMessageText({
    scope: chatScope,
    thread,
    token,
    language,
    availability: chatMessageText,
  });
  const [attachmentAction, setAttachmentAction] = useState<{
    messageId: string;
    action: ChatMessageAttachmentAction;
  } | null>(null);
  const [referencePreview, setReferencePreview] = useState<Pick<
    StationMediaAssetDTO,
    'id' | 'kind' | 'status'
  > | null>(null);
  const [referencePreviewLoading, setReferencePreviewLoading] = useState(false);
  const referencePreviewRequest = useRef(0);
  const consumeAttachmentAction = useCallback(
    (consumed: ChatMessageAttachmentAction) => {
      setAttachmentAction(current =>
        current?.action === consumed ? null : current,
      );
    },
    [],
  );
  const openContextReference = useCallback(
    async (reference: AIContextReference) => {
      if (reference.kind !== 'station-photo' || !token) return;
      if (referencePreviewLoading) return;
      const requestId = ++referencePreviewRequest.current;
      setReferencePreviewLoading(true);
      try {
        const asset = await stationContentApi.stationMediaAsset(
          token,
          reference.id,
        );
        if (referencePreviewRequest.current !== requestId) return;
        if (asset.kind !== 'image' || asset.status !== 'uploaded') {
          throw new Error(
            textFor(
              language,
              '这张素材已不可用，请重新选择。',
              'This media is unavailable. Choose it again.',
            ),
          );
        }
        setReferencePreview({
          id: asset.id,
          kind: asset.kind,
          status: asset.status,
        });
      } catch (error) {
        if (referencePreviewRequest.current !== requestId) return;
        onActionError(
          error instanceof Error
            ? error.message
            : textFor(
                language,
                '素材读取失败，请重试。',
                'Unable to read this media. Try again.',
              ),
        );
      } finally {
        if (referencePreviewRequest.current === requestId)
          setReferencePreviewLoading(false);
      }
    },
    [language, onActionError, referencePreviewLoading, token],
  );
  useEffect(
    () => () => {
      referencePreviewRequest.current += 1;
    },
    [],
  );
  const [messageMenuPosition, setMessageMenuPosition] = useState<ReturnType<
    typeof messageMenuGeometry
  > | null>(null);
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
    Keyboard.dismiss();
    cancelChatSpeech();
    discardChatVoice();
    if (
      workspaceContext ||
      contextReset.current ||
      (ordinaryAttachmentTarget && !hasLeftGroup && (draft || replyTarget))
    )
      preserveDraftForAccess();
    onBack();
  }, [
    onBack,
    preserveDraftForAccess,
    cancelChatSpeech,
    discardChatVoice,
    draft,
    hasLeftGroup,
    ordinaryAttachmentTarget,
    replyTarget,
    workspaceContext,
  ]);
  const openAgentAccess = onOpenAgentAccess
    ? () => {
        cancelChatSpeech();
        discardChatVoice();
        preserveDraftForAccess();
        onOpenAgentAccess();
      }
    : undefined;
  const [isThreadSettingsOpen, setIsThreadSettingsOpen] = useState(false);
  const [historyFocus, setHistoryFocus] = useState<{
    scope: string;
    messageId: string;
    revision: number;
  }>();
  const historyRevision = useRef(0);
  const historyTarget =
    historyFocus?.scope === chatScope ? historyFocus : undefined;
  const historyIndex = historyTarget
    ? timeline.findIndex(
        item =>
          item.kind === 'message' &&
          item.message.id === historyTarget.messageId &&
          !item.message.deletedAt &&
          !item.message.recalledAt,
      )
    : -1;
  const [forwardSource, setForwardSource] = useState<ChatMessage>();
  const [batchForward, setBatchForward] = useState<{
    scope: string;
    initialMessageId: string;
  }>();
  const forwardKeys = useRef(new Map<string, string>());
  const isChatInteractionBlocked = assist.isActive || Boolean(selectedMessage);
  const interactionBlockedRef = useRef(isChatInteractionBlocked);
  interactionBlockedRef.current = isChatInteractionBlocked;
  const listRef = useRef<FlatList<ChatTimelineItem>>(null);
  const {
    onScroll: onChatScroll,
    onScrollBeginDrag: onChatScrollBeginDrag,
    onScrollEndDrag: onChatScrollEndDrag,
    prepareLayoutChange,
    followLayout,
    measureContent,
    bottomOffset,
    shouldFollow,
    follow,
    pauseFollowing,
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
      }:${workspaceContribution?.step.id || ''}:${
        historyTarget?.revision || ''
      }`,
      index: historyTarget
        ? historyIndex
        : workspaceContribution
        ? timeline.findIndex(
            item =>
              item.kind === 'contribution' &&
              item.contribution.step.id === workspaceContribution.step.id,
          )
        : -1,
      listRef,
      blocked: isChatInteractionBlocked || isThreadSettingsOpen,
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
  const canSearchHistory =
    Boolean(token) && ordinaryAttachmentTarget && !thread.agentId;
  const sourceCanForward = (source: ChatMessage) =>
    canSearchHistory &&
    source.threadId === thread.id &&
    canSelectForwardMessage(source);
  const deliveryReceipts = useDirectMessageReceipts({
    thread,
    token,
    currentUserId,
    availability: chatMessageReceipts,
    active: receiptActive,
  });
  const openHistoryMessage = async (result: MessageDTO) => {
    const revision = ++historyRevision.current;
    pauseFollowing();
    if (!thread.messages.some(item => item.id === result.id)) {
      try {
        await onRefreshThread?.();
      } catch {
        if (
          chatScopeActive.current &&
          chatScopeRef.current === chatScope &&
          historyRevision.current === revision
        )
          onActionError(
            textFor(
              language,
              '无法读取原消息，请重试。',
              'Could not load the original message. Try again.',
            ),
          );
        return;
      }
    }
    if (
      chatScopeActive.current &&
      chatScopeRef.current === chatScope &&
      historyRevision.current === revision
    )
      setHistoryFocus({ scope: chatScope, messageId: result.id, revision });
  };
  useEffect(() => {
    if (!historyTarget || historyIndex >= 0) return;
    onActionError(
      textFor(
        language,
        '这条消息已不可用。',
        'This message is no longer available.',
      ),
    );
    setHistoryFocus(undefined);
  }, [historyIndex, historyTarget, language, onActionError]);
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
  const scrollToBottom = useCallback(
    (animated: boolean) => {
      requestAnimationFrame(() => {
        if (interactionBlockedRef.current || !shouldFollow()) {
          return;
        }
        const offset = bottomOffset();
        if (offset !== null)
          listRef.current?.scrollToOffset({ animated, offset });
      });
    },
    [bottomOffset, shouldFollow],
  );
  const closeMessageMenu = useCallback(() => {
    directionalTools.current = null;
    setMenuAttachmentId(undefined);
    setSelectedMessage(null);
    setMessageMenuPosition(null);
  }, []);
  const closeChatRef = useRef(closeChat);
  closeChatRef.current = closeChat;
  const finishingSwipe = useRef(false);
  const resetChatSwipe = useCallback(() => {
    if (finishingSwipe.current) return;
    if (reduceMotion) {
      chatTranslateX.setValue(0);
      return;
    }
    Animated.timing(chatTranslateX, {
      toValue: 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [chatTranslateX, reduceMotion]);
  const backGesture = useIOSBackGesture({
    enabled: !isChatInteractionBlocked && !finishingSwipe.current,
    reduceMotion,
    translateX: chatTranslateX,
    width: windowSize.width,
    onCancel: resetChatSwipe,
    onBack: () => {
      if (finishingSwipe.current) return;
      if (reduceMotion) {
        closeChat();
        return;
      }
      finishingSwipe.current = true;
      Animated.timing(chatTranslateX, {
        toValue: windowSize.width,
        duration: 220,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        finishingSwipe.current = false;
        if (finished) closeChatRef.current();
      });
    },
  });
  useEffect(() => () => chatTranslateX.stopAnimation(), [chatTranslateX]);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (assist.isActive) return false;
        if (selectedMessage) closeMessageMenu();
        else closeChat();
        return true;
      },
    );
    return () => subscription.remove();
  }, [assist.isActive, closeChat, closeMessageMenu, selectedMessage]);
  const openMessageMenu = (
    item: ChatMessage,
    isMine: boolean,
    point: AIAssistPoint,
    messageFrame: { x: number; y: number; width: number; height: number },
    openDirectionalTools?: () => void,
    attachmentId?: string,
  ) => {
    messageAreaRef.current?.measureInWindow((x, y, width, height) => {
      directionalTools.current = openDirectionalTools || null;
      setMenuAttachmentId(attachmentId);
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
  const selectedTextAction = selectedMessage
    ? messageText.availableAction(selectedMessage)
    : undefined;
  const selectedTextOutput = selectedMessage
    ? messageText.outputFor(selectedMessage)
    : undefined;
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
          onOpenSource={mediaAssetId => {
            openContextReference({
              kind: 'station-photo',
              id: mediaAssetId,
              title: textFor(language, '参考图片', 'Reference image'),
            }).catch(() => undefined);
          }}
          onSelectContext={() => {
            if (submitting.current || !entry?.preview) return;
            if (!['pending', 'confirmed'].includes(entry.preview.status))
              return;
            draftEdited.current = true;
            contextGeneration.current += 1;
            setContentContext({
              id: entry.preview.id,
              revision: entry.preview.revision,
            });
            setContentContextTitle(entry.preview.snapshot.title);
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
          onSaveImage={async (_frameIndex, mediaAssetId) => {
            await saveComicImageToLibrary({ token, mediaAssetId });
          }}
        />
      ) : undefined;
    const textAction = messageText.availableAction(timelineMessage);
    const textOutput = messageText.outputFor(timelineMessage);
    return (
      <ChatMessageItem
        token={token}
        reduceMotion={reduceMotion}
        item={timelineMessage}
        focused={historyTarget?.messageId === timelineMessage.id}
        messageEnhancement={
          textAction && textOutput ? (
            <ChatMessageTextResult
              action={textAction}
              output={textOutput}
              translation={messageText.translationFor(timelineMessage)}
              language={language}
              palette={messagePalette}
              onRetry={() => {
                messageText.toggle(timelineMessage);
              }}
              onTranslateTranscript={
                messageText.canTranslateTranscript(timelineMessage)
                  ? () => {
                      messageText.translateTranscript(timelineMessage);
                    }
                  : undefined
              }
              onTranscribeAgain={() => {
                messageText.retranscribe(timelineMessage);
              }}
            />
          ) : undefined
        }
        deliveryStatus={deliveryReceipts.statuses[timelineMessage.id]}
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
        attachmentAction={
          attachmentAction?.messageId === timelineMessage.id
            ? attachmentAction.action
            : undefined
        }
        onAttachmentActionConsumed={consumeAttachmentAction}
        onActionMessage={onActionError}
        onOpenContextReference={openContextReference}
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
        onEditAgentMessage={message => {
          if (
            draft.trim() ||
            contextRefs.length ||
            replyTarget ||
            workspaceContext ||
            contentContext
          ) {
            onActionError(
              textFor(
                language,
                '请先处理当前输入，再编辑这条消息。',
                'Finish the current draft before editing this message.',
              ),
            );
            return;
          }
          draftEdited.current = true;
          continuingClarification.current = false;
          contextReset.current = true;
          contextGeneration.current += 1;
          setContextResetNotice(true);
          setAssistSource(undefined);
          setDraft(message.content);
        }}
        onRetrySend={message => {
          if (hasLeftGroup) {
            onActionError(
              textFor(
                language,
                '你已退出群聊，不能发送新消息。',
                'You left this group and cannot send new messages.',
              ),
            );
            return;
          }
          if (
            message.localStatus !== 'failed' ||
            submitting.current ||
            chatVoice.isBusy()
          ) {
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
          const retryScope = chatScopeRef.current;
          const attempt = ++sendAttempt.current;
          submitting.current = true;
          setIsSending(true);
          Promise.resolve()
            .then(() =>
              onSend(
                message.content,
                message.id,
                replyId,
                message.metadata?.contextRefs || [],
                message.metadata?.assistSource,
                message.metadata?.butlerContextReset === true
                  ? true
                  : undefined,
                message.metadata?.workspaceContext,
                message.metadata?.agentContextReset === true ? true : undefined,
                message.metadata?.contentPreviewContext,
                message.metadata?.attachmentIds,
                message.metadata?.sticker?.id,
              ),
            )
            .then(result => {
              if (chatScopeRef.current !== retryScope) return;
              if (result === true)
                chatAttachments
                  .removeMany(
                    chatAttachments.items
                      .filter(attachmentItem =>
                        message.metadata?.attachmentIds?.includes(
                          attachmentItem.id || '',
                        ),
                      )
                      .map(attachmentItem => attachmentItem.clientKey),
                  )
                  .catch(() => undefined);
            })
            .catch(() => undefined)
            .finally(() => {
              if (
                chatScopeRef.current !== retryScope ||
                sendAttempt.current !== attempt
              )
                return;
              submitting.current = false;
              setIsSending(false);
            });
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
    setContentContextTitle(undefined);
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
    let animation: Animated.CompositeAnimation | undefined;
    const stopAnimation = () => {
      animation?.stop();
      animation = undefined;
      keyboardInset.stopAnimation();
    };
    // Preference/window changes interrupt an in-flight animation. Settle to
    // its target so an unchanged keyboard frame cannot leave it halfway.
    keyboardInset.setValue(keyboardInsetRef.current);
    const resizeForKeyboard = (
      nextInset: number,
      event?: import('react-native').KeyboardEvent,
    ) => {
      if (keyboardInsetRef.current !== nextInset) prepareLayoutChange();
      keyboardInsetRef.current = nextInset;
      stopAnimation();
      if (
        reduceMotion ||
        !event ||
        !Number.isFinite(event.duration) ||
        event.duration <= 0
      ) {
        keyboardInset.setValue(nextInset);
        return;
      }
      const easing =
        event.easing === 'linear'
          ? Easing.linear
          : event.easing === 'easeIn'
          ? Easing.in(Easing.ease)
          : event.easing === 'easeOut'
          ? Easing.out(Easing.ease)
          : event.easing === 'easeInEaseOut'
          ? Easing.inOut(Easing.ease)
          : // Match the system duration with a standard ease curve. UIKit's
            // private keyboard curve cannot be reproduced exactly in JS.
            Easing.bezier(0.25, 0.1, 0.25, 1);
      animation = Animated.timing(keyboardInset, {
        toValue: nextInset,
        duration: event.duration,
        easing,
        useNativeDriver: false,
      });
      animation.start();
    };
    const moveWithKeyboard = (event: import('react-native').KeyboardEvent) => {
      resizeForKeyboard(
        keyboardBottomInset(
          event.endCoordinates,
          windowSize.height,
          safeAreaInsets.bottom,
        ),
        event,
      );
    };
    // iOS announces its final frame before animating. Applying it after the
    // animation (didShow/didChangeFrame) makes the composer jump into place.
    const frameSubscription =
      Platform.OS === 'ios'
        ? Keyboard.addListener('keyboardWillChangeFrame', moveWithKeyboard)
        : undefined;
    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      resizeForKeyboard(0);
    });
    return () => {
      stopAnimation();
      frameSubscription?.remove();
      hideSubscription.remove();
    };
  }, [
    keyboardInset,
    prepareLayoutChange,
    reduceMotion,
    safeAreaInsets.bottom,
    windowSize.height,
  ]);

  const send = (stickerId?: string, submittedText = draft) => {
    if (hasLeftGroup) {
      onActionError(
        textFor(
          language,
          '你已退出群聊，不能发送新消息。',
          'You left this group and cannot send new messages.',
        ),
      );
      return;
    }
    const content = submittedText.trim();
    if (stickerId) {
      if (!ordinaryAttachmentTarget || thread.agentId || hasLeftGroup) {
        onActionError(
          textFor(
            language,
            '当前会话不能发送自定义表情。',
            'Custom stickers are unavailable in this conversation.',
          ),
        );
        return;
      }
      if (
        content ||
        contextRefs.length ||
        assistSource ||
        contextReset.current ||
        replyTarget ||
        workspaceContext ||
        contentContext ||
        chatAttachments.items.length
      ) {
        onActionError(
          textFor(
            language,
            '自定义表情不能与文字、附件或其他上下文混用。',
            'Custom stickers cannot be combined with text, attachments, or context.',
          ),
        );
        return;
      }
    }
    const selectedAttachments = ordinaryAttachmentTarget
      ? chatAttachments.items
      : [];
    if (
      (!stickerId && !content && !selectedAttachments.length) ||
      submitting.current ||
      chatVoice.isBusy() ||
      contextAccessWarning ||
      !chatAttachments.canSend ||
      Boolean(failedAttachmentBlockReason)
    ) {
      return;
    }
    const selectedAttachmentIds = selectedAttachments.flatMap(item =>
      item.status === 'ready' && item.id ? [item.id] : [],
    );
    if (selectedAttachmentIds.length !== selectedAttachments.length) return;
    const selectedAttachmentKeys = selectedAttachments.map(
      item => item.clientKey,
    );
    submitting.current = true;
    if (selectedAttachments.length) setAttachmentReviewScope(undefined);
    Keyboard.dismiss();
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
    const submittedButlerReset =
      !selectedPreview && !selectedWorkspace && submittedReset && !professional
        ? true
        : undefined;
    const submittedAgentReset =
      !selectedPreview && !selectedWorkspace && submittedReset && professional
        ? true
        : undefined;
    const submittedWorkspaceContext =
      !selectedPreview && !submittedReset ? selectedWorkspace : undefined;
    Promise.resolve(
      onSend(
        content,
        undefined,
        targetId,
        selectedReferences,
        selectedSource,
        submittedButlerReset,
        submittedWorkspaceContext,
        submittedAgentReset,
        selectedPreview,
        selectedAttachmentIds.length ? selectedAttachmentIds : undefined,
        stickerId,
      ),
    )
      .then(result => {
        if (chatScopeRef.current !== submittedScope) return;
        if (result === true)
          chatAttachments
            .removeMany(selectedAttachmentKeys)
            .catch(() => undefined);
        if (
          result === true &&
          selectedPreview &&
          contextGeneration.current === submittedGeneration
        ) {
          setContentContext(undefined);
          setContentContextTitle(undefined);
        }
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

  const uploadCustomSticker = useCallback(async () => {
    if (!token || !ordinaryAttachmentTarget || hasLeftGroup) return;
    const origin = chatScope;
    const epoch = ++pickerEpoch.current;
    const scopeIsCurrent = () =>
      chatScopeActive.current &&
      ordinaryAttachmentsEnabledRef.current &&
      chatScopeRef.current === origin;
    try {
      const picked = await pickStationPhotoFromLibrary();
      if (!scopeIsCurrent() || pickerEpoch.current !== epoch) return;
      if (!picked) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(picked.mimeType))
        throw new Error('仅支持 JPEG、PNG 或 WebP 图片。');
      setCustomStickerState('uploading');
      const sticker = await customStickerApi.upload({
        token,
        uri: picked.uri,
        mimeType: picked.mimeType,
        idempotencyKey: createIdempotencyKey(),
      });
      if (!scopeIsCurrent()) return;
      setCustomStickers(current => [
        sticker,
        ...current.filter(item => item.id !== sticker.id),
      ]);
      setCustomStickerState('idle');
    } catch (error) {
      if (!scopeIsCurrent()) return;
      setCustomStickerState('error');
      onActionError(
        error instanceof Error ? error.message : '自定义表情上传失败，请重试。',
      );
    }
  }, [chatScope, hasLeftGroup, onActionError, ordinaryAttachmentTarget, token]);

  const deleteCustomSticker = useCallback(
    async (stickerId: string) => {
      if (!token) return;
      const origin = chatScope;
      const scopeIsCurrent = () =>
        chatScopeActive.current &&
        ordinaryAttachmentsEnabledRef.current &&
        chatScopeRef.current === origin;
      if (!scopeIsCurrent()) return;
      setCustomStickerDeletingIds(current =>
        current.includes(stickerId) ? current : [...current, stickerId],
      );
      try {
        await customStickerApi.delete(stickerId, token);
        if (!scopeIsCurrent()) return;
        setCustomStickers(current =>
          current.filter(item => item.id !== stickerId),
        );
      } catch (error) {
        if (!scopeIsCurrent()) return;
        onActionError(
          error instanceof Error
            ? error.message
            : '自定义表情删除失败，请重试。',
        );
      } finally {
        if (scopeIsCurrent())
          setCustomStickerDeletingIds(ids =>
            ids.filter(item => item !== stickerId),
          );
      }
    },
    [chatScope, onActionError, token],
  );

  const reportCallMicrophone = useCallback(() => {
    onActionError(textFor(language, ...voiceCallConflictCopy.microphone));
  }, [language, onActionError]);

  const startVoiceMessage = (mode: 'hold' | 'accessible') => {
    if (voiceCallOpen) {
      reportCallMicrophone();
      return;
    }
    if (submitting.current || !ordinaryAttachmentsEnabled) return;
    closeMessageMenu();
    Keyboard.dismiss();
    const voiceScope = chatScopeRef.current;
    const voiceReply = replyTarget?.id ?? null;
    chatVoice
      .start(mode, async attachmentId => {
        if (
          chatScopeRef.current !== voiceScope ||
          !ordinaryAttachmentsEnabledRef.current
        )
          return;
        const attempt = ++sendAttempt.current;
        submitting.current = true;
        setIsSending(true);
        setReplyTarget(current =>
          current?.id === voiceReply ? null : current,
        );
        follow();
        scrollToBottom(true);
        try {
          await onSend(
            chatVoiceMessageContent,
            undefined,
            voiceReply,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            undefined,
            [attachmentId],
          );
        } finally {
          if (
            chatScopeRef.current === voiceScope &&
            sendAttempt.current === attempt
          ) {
            submitting.current = false;
            setIsSending(false);
          }
        }
      })
      .catch(() => undefined);
  };

  const startLongSpeech = useCallback(() => {
    if (voiceCallOpen) {
      reportCallMicrophone();
      return;
    }
    Keyboard.dismiss();
    closeMessageMenu();
    startChatSpeech('hold', draft);
  }, [
    closeMessageMenu,
    draft,
    reportCallMicrophone,
    startChatSpeech,
    voiceCallOpen,
  ]);

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
      const target: ComposerToolTarget = {
        threadId: thread.id,
        kind: thread.kind,
        agentId:
          thread.kind === 'agent' ? thread.agentId || undefined : undefined,
      };
      if (
        ordinaryAttachmentTarget &&
        (tool === '相册' ||
          tool === '拍摄' ||
          tool === '文件' ||
          tool === '视频')
      ) {
        if (!ordinaryAttachmentsEnabledRef.current) return;
        const origin = chatScopeRef.current;
        const epoch = ++pickerEpoch.current;
        const valid = () =>
          ordinaryAttachmentsEnabledRef.current &&
          chatScopeRef.current === origin &&
          pickerEpoch.current === epoch;
        const operation = async () => {
          if (tool === '相册') {
            if (chatAttachments.remainingSlots === 0) {
              throw new Error('最多添加6个附件，请先移除一项。');
            }
            const picked = await pickStationImagesFromLibrary(
              chatAttachments.remainingSlots,
            );
            if (!valid()) return;
            if (!picked.length) return;
            const upload = chatAttachments.addImages(picked);
            setAttachmentReviewScope(origin);
            await upload;
          } else if (tool === '视频') {
            const video = await pickChatVideo();
            if (!video) return;
            if (!valid()) {
              await releaseStationFile(video);
              return;
            }
            const upload = chatAttachments.addVideo(video);
            setAttachmentReviewScope(origin);
            await upload;
          } else if (tool === '拍摄') {
            const picked = await takeStationPhoto();
            if (!valid()) return;
            if (!picked) return;
            const upload = chatAttachments.addImages([picked]);
            setAttachmentReviewScope(origin);
            await upload;
          } else {
            const file = await pickStationFile();
            if (!valid()) {
              if (file) {
                await releaseStationFile(file).catch(() => {
                  onActionError(
                    textFor(
                      language,
                      '临时文件清理失败，未上传该文件。',
                      'Could not release the temporary file. It was not uploaded.',
                    ),
                  );
                });
              }
              return;
            }
            if (!file) return;
            const upload = chatAttachments.addFile(file);
            setAttachmentReviewScope(origin);
            await upload;
          }
        };
        operation().catch(error => {
          if (!valid()) return;
          onActionError(
            appErrorText(
              language,
              error,
              '附件处理失败，请重试。',
              'Could not process the attachment. Try again.',
            ),
          );
        });
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
      onPrepareComposerTool(tool, target)
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
    [
      language,
      onActionError,
      onPrepareComposerTool,
      openConversationAssistant,
      thread.id,
      thread.kind,
      thread.agentId,
      ordinaryAttachmentTarget,
      chatAttachments,
    ],
  );

  return (
    <View style={styles.chatScreen} onAccessibilityEscape={closeChat}>
      <Animated.View
        testID="chat-keyboard-surface"
        style={[
          styles.chatSwipeSurface,
          {
            marginBottom: keyboardInset,
          },
        ]}
      >
        <Animated.View
          style={[
            styles.chatSwipeSurface,
            {
              backgroundColor: messagePalette.background,
              transform: [{ translateX: chatTranslateX }],
            },
          ]}
        >
          <View style={styles.chatSwipeSurface}>
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
              onStartVoiceCall={
                onStartVoiceCall
                  ? () => {
                      Keyboard.dismiss();
                      onStartVoiceCall();
                    }
                  : undefined
              }
              onOpenSettings={
                canConfigureThread
                  ? () => {
                      discardChatVoice();
                      setIsThreadSettingsOpen(true);
                    }
                  : undefined
              }
            />
            {thread.agentId === 'album-manager' &&
            token &&
            onAuthorizeAlbumAI ? (
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
                onScrollBeginDrag={onChatScrollBeginDrag}
                onScrollEndDrag={onChatScrollEndDrag}
                scrollEventThrottle={16}
                ListHeaderComponent={
                  <View>
                    {contributions.error ? (
                      <Text
                        accessibilityRole="alert"
                        style={{ color: palette.rose }}
                      >
                        {contributions.error}
                      </Text>
                    ) : null}
                    {contributions.hasMore || contributions.error ? (
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
                    ) : null}
                    <WorkspaceContributionNotice
                      reasons={contributions.unavailableReasons}
                      palette={messagePalette}
                      language={language}
                      loading={contributions.loading}
                      onRetry={contributions.retry}
                      onOpenAgentAccess={openAgentAccess}
                    />
                  </View>
                }
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
                        token={token}
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
                    <View style={styles.messageFooterSpacer} />
                  </View>
                }
                onScrollToIndexFailed={onScrollToIndexFailed}
                onLayout={event => {
                  const following = followLayout(
                    event?.nativeEvent.layout.height,
                  );
                  if (workspaceContribution) focusContribution();
                  else if (following) scrollToBottom(false);
                }}
                onContentSizeChange={(_width, height) => {
                  measureContent(height);
                  if (workspaceContribution) focusContribution();
                  else if (shouldFollow()) scrollToBottom(false);
                }}
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
                  onForward={
                    sourceCanForward(selectedMessage) && onForwardComplete
                      ? source => {
                          setForwardSource(source);
                        }
                      : undefined
                  }
                  onSelectMessages={
                    sourceCanForward(selectedMessage) &&
                    !hasLeftGroup &&
                    onForwardComplete
                      ? source =>
                          setBatchForward({
                            scope: chatScope,
                            initialMessageId: source.id,
                          })
                      : undefined
                  }
                  translationVisible={
                    selectedTextAction === 'translate' &&
                    selectedTextOutput?.status === 'ready' &&
                    selectedTextOutput.visible
                  }
                  transcriptionVisible={
                    selectedTextAction === 'transcribe' &&
                    selectedTextOutput?.status === 'ready' &&
                    selectedTextOutput.visible
                  }
                  onTranslate={
                    selectedTextAction === 'translate'
                      ? messageText.toggle
                      : undefined
                  }
                  onTranscribe={
                    selectedTextAction === 'transcribe'
                      ? messageText.toggle
                      : undefined
                  }
                  onAskButler={directionalTools.current || undefined}
                  attachmentId={menuAttachmentId}
                  onShare={
                    messageText.canShareText(selectedMessage)
                      ? message => {
                          Share.share({ message: message.content }).catch(() =>
                            onActionError(
                              textFor(
                                language,
                                '分享失败，请重试。',
                                'Could not share. Try again.',
                              ),
                            ),
                          );
                        }
                      : undefined
                  }
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
                  onViewAttachments={(message, attachmentId) => {
                    setAttachmentAction({
                      messageId: message.id,
                      action: { type: 'image', attachmentId },
                    });
                  }}
                  onPreviewAttachment={attachment => {
                    setAttachmentAction({
                      messageId: selectedMessage.id,
                      action: { type: 'file', attachmentId: attachment.id },
                    });
                  }}
                  onSaveAttachment={attachment => {
                    setAttachmentAction({
                      messageId: selectedMessage.id,
                      action: {
                        type: 'image',
                        attachmentId: attachment.id,
                        save: true,
                      },
                    });
                  }}
                />
              ) : null}
            </View>
          </View>
          {hasLeftGroup ? (
            <View
              testID="group-readonly-notice"
              style={taskStyles.groupReadonlyNotice}
            >
              <Text style={{ color: messagePalette.secondaryText }}>
                {textFor(
                  language,
                  '你已退出群聊。已有聊天记录仍保留；无法发送新消息或查看成员。',
                  'You left this group. Existing chat history is retained; sending messages and viewing members are unavailable.',
                )}
              </Text>
            </View>
          ) : (
            <ChatComposer
              token={token}
              palette={messagePalette}
              language={language}
              threadTitle={thread.title}
              draft={draft}
              isSending={isSending}
              isRecognizingSpeech={isRecognizingSpeech}
              voiceControls={
                ordinaryAttachmentsEnabled
                  ? { ...chatVoice, start: startVoiceMessage }
                  : undefined
              }
              replyTarget={replyTarget}
              assistSource={assistSource}
              contextRefs={contextRefs}
              attachments={chatAttachments.items}
              attachmentBlockReason={attachmentSendBlockReason}
              onReviewAttachments={submittedText => {
                if (submittedText !== undefined) setDraft(submittedText);
                Keyboard.dismiss();
                setAttachmentReviewScope(chatScope);
              }}
              customStickers={customStickers}
              customStickerState={customStickerState}
              customStickerDeletingIds={customStickerDeletingIds}
              onRetryCustomStickers={() => {
                if (customStickerState === 'error')
                  setCustomStickerReload(current => current + 1);
              }}
              onUploadCustomSticker={() => {
                uploadCustomSticker().catch(() => undefined);
              }}
              onDeleteCustomSticker={stickerId =>
                deleteCustomSticker(stickerId).catch(() => undefined)
              }
              quickCommands={
                thread.agentId === 'miaoxun-butler'
                  ? ['生成今日待办', '今晚只提醒紧急事项', '同步相关 Agent']
                  : undefined
              }
              workspaceActions={
                isComic && contentContext ? (
                  <View
                    testID="chat-comic-context-chip"
                    style={[
                      taskStyles.comicContextChip,
                      { backgroundColor: messagePalette.soft },
                    ]}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        taskStyles.comicContextTitle,
                        { color: messagePalette.text },
                      ]}
                    >
                      {textFor(language, '基于', 'Based on')}{' '}
                      {contentContextTitle ||
                        textFor(
                          language,
                          '当前漫画提案',
                          'current comic proposal',
                        )}
                    </Text>
                    <Pressable
                      testID="chat-comic-context-chip-remove"
                      accessibilityRole="button"
                      accessibilityLabel={textFor(
                        language,
                        '移除漫画提案引用',
                        'Remove comic proposal reference',
                      )}
                      onPress={() => {
                        draftEdited.current = true;
                        contextGeneration.current += 1;
                        setContentContext(undefined);
                        setContentContextTitle(undefined);
                        setContextRefs([]);
                      }}
                      style={taskStyles.comicContextChipRemove}
                    >
                      <Text style={{ color: messagePalette.secondaryText }}>
                        ×
                      </Text>
                    </Pressable>
                  </View>
                ) : workspaceContext && token && onOpenWorkspace ? (
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
              onOpenContextReference={openContextReference}
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
                  return current.trim()
                    ? `${current}\n${normalized}`
                    : normalized;
                });
              }}
              onSelectStationSources={
                isComic && token
                  ? () => {
                      Keyboard.dismiss();
                      setSourcesOpen(true);
                    }
                  : undefined
              }
              onComposerTool={handleComposerTool}
              chatVideoEnabled={chatVideoEnabled && ordinaryAttachmentsEnabled}
              onClearReplyTarget={() => setReplyTarget(null)}
              onFocusInput={() => {
                assist.dismiss();
                closeMessageMenu();
              }}
              onOpenAssistant={openConversationAssistant}
              onVoiceInputUnavailable={
                voiceCallOpen ? reportCallMicrophone : undefined
              }
              onStartLongSpeech={startLongSpeech}
              onFinishLongSpeech={finishLongSpeech}
              onSend={send}
            />
          )}
          {Platform.OS === 'ios' && !isChatInteractionBlocked ? (
            <View
              {...backGesture}
              accessible={false}
              importantForAccessibility="no"
              style={iosBackEdge}
            />
          ) : null}
        </Animated.View>
      </Animated.View>
      {ordinaryAttachmentsEnabled &&
      attachmentReviewScope === chatScope &&
      chatAttachments.items.length ? (
        <ChatAttachmentReview
          items={chatAttachments.items}
          draft={draft}
          palette={messagePalette}
          language={language}
          busy={isSending}
          sendBlockReason={
            attachmentSendBlockReason || contextAccessWarning || ''
          }
          onClose={() => setAttachmentReviewScope(undefined)}
          onRetry={key => {
            chatAttachments.retry(key).catch(() => undefined);
          }}
          onRemove={key => {
            if (chatAttachments.items.length === 1)
              setAttachmentReviewScope(undefined);
            chatAttachments.remove(key).catch(() => undefined);
          }}
          onSend={() => send()}
        />
      ) : null}
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
                  onSave={async (_frameIndex, mediaAssetId) => {
                    await saveComicImageToLibrary({ token, mediaAssetId });
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
      <Modal
        visible={referencePreview !== null}
        presentationStyle="fullScreen"
        onRequestClose={() => setReferencePreview(null)}
      >
        {referencePreview ? (
          <SafeAreaProvider>
            <SafeAreaView
              style={[
                styles.chatSwipeSurface,
                { backgroundColor: messagePalette.background },
              ]}
            >
              <StationMediaPreviewScreen
                asset={referencePreview}
                token={token || ''}
                timestampMs={null}
                palette={messagePalette}
                language={language}
                onBack={() => setReferencePreview(null)}
                onUnavailable={() => {
                  setReferencePreview(null);
                  onActionError(
                    textFor(
                      language,
                      '这张素材已不可用，请重新选择。',
                      'This media is unavailable. Choose it again.',
                    ),
                  );
                }}
                onActionMessage={onActionError}
              />
            </SafeAreaView>
          </SafeAreaProvider>
        ) : null}
      </Modal>
      <ThreadSettingsSheet
        visible={isThreadSettingsOpen}
        threadId={thread.id}
        muted={Boolean(thread.pendingMuted ?? thread.muted)}
        palette={messagePalette}
        language={language}
        onClose={() => setIsThreadSettingsOpen(false)}
        onSetMuted={onSetMuted}
        token={token}
        groupId={thread.kind === 'group' ? thread.groupId : undefined}
        hasLeftGroup={hasLeftGroup}
        onGroupLeft={() => {
          setLocallyLeftGroupId(thread.id);
          return onGroupLeft?.();
        }}
        onOpenProfile={thread.peerAiId ? onOpenPeerProfile : undefined}
        onOpenMessage={canSearchHistory ? openHistoryMessage : undefined}
        onActionError={onActionError}
      />
      {batchForward?.scope === chatScope &&
      token &&
      !hasLeftGroup &&
      onForwardComplete ? (
        <ChatBatchForwardSheet
          key={chatScope + ':' + batchForward.initialMessageId}
          scope={chatScope}
          sourceThreadId={thread.id}
          initialMessageId={batchForward.initialMessageId}
          messages={thread.messages}
          threads={forwardTargets}
          requestKeys={forwardKeys.current}
          palette={messagePalette}
          language={language}
          onClose={() => setBatchForward(undefined)}
          onForward={async (source, destination, clientMessageId) => {
            const result = await messageApi.forwardMessage(
              thread.id,
              source.id,
              token,
              destination.id,
              clientMessageId,
            );
            if (chatScopeActive.current && chatScopeRef.current === chatScope)
              onForwardComplete(destination, result.messages);
          }}
        />
      ) : null}
      {forwardSource && token && onForwardComplete ? (
        <ChatForwardSheet
          key={`${chatScope}:${forwardSource.id}`}
          sourceLabel={
            forwardSource.content === chatVoiceMessageContent
              ? textFor(language, '语音消息', 'Voice message')
              : forwardSource.content.trim() ||
                textFor(language, '附件消息', 'Message with attachments')
          }
          threads={forwardTargets}
          palette={messagePalette}
          language={language}
          onClose={() => setForwardSource(undefined)}
          onForward={async destination => {
            const key = `${chatScope}:${forwardSource.id}:${destination.id}`;
            const id = forwardKeys.current.get(key) || createIdempotencyKey();
            forwardKeys.current.set(key, id);
            const result = await messageApi.forwardMessage(
              thread.id,
              forwardSource.id,
              token,
              destination.id,
              id,
            );
            forwardKeys.current.delete(key);
            if (chatScopeActive.current && chatScopeRef.current === chatScope)
              onForwardComplete(destination, result.messages);
          }}
        />
      ) : null}
    </View>
  );
}

const taskStyles = StyleSheet.create({
  groupReadonlyNotice: {
    minHeight: 56,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  refresh: { minHeight: 44, padding: 12 },
  comicEntry: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingLeft: 16,
    paddingRight: 4,
    gap: 8,
  },
  comicContextChip: {
    minHeight: 36,
    marginHorizontal: 12,
    marginBottom: 6,
    paddingLeft: 12,
    paddingRight: 6,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  comicContextChipRemove: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comicContextTitle: { flex: 1 },
  contextResetNotice: { paddingHorizontal: 16, paddingVertical: 8 },
});
