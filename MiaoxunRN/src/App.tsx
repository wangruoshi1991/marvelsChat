import type { AIContextReference, AITaskDTO } from './models/aiTask';
import { persistentAssistReference } from './features/ai/assistContext';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AppState,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppModals } from './app/AppModals';
import { ModalRoute } from './app/appTypes';
import { LaunchAnimation } from './app/LaunchAnimation';
import { RestoreErrorScreen } from './app/RestoreErrorScreen';
import {
  ChatThread,
  useMiaoxunSession,
} from './features/session/useMiaoxunSession';
import { AuthScreen } from './features/auth/AuthScreen';
import { UserAvatar } from './features/avatar/AvatarBadges';
import {
  ChatDraftSnapshot,
  ChatScreen,
  MessageTab,
  MessagesScreen,
} from './features/messages/MessagesScreen';
import type { ComposerPreparationResult } from './features/messages/MessagesScreen';
import type { ComposerTool } from './features/messages/ChatComposer';
import { resolveMessagePalette } from './features/messages/messagePalette';
import { pendingButlerClarification } from './features/messages/butlerClarification';
import { workspaceAssistContext } from './features/assist/workspaceAssistContext';
import { useProfileFlows } from './features/profile/useProfileFlows';
import { StationPostComposerScreen } from './features/station/StationPostComposerScreen';
import { StationScreen } from './features/station/StationScreen';
import { StationTab } from './features/station/stationTypes';
import { AvatarConfigDTO } from './models/api';
import { appErrorText, textFor } from './shared/i18n';
import { styles } from './shared/styles';
import { palettes } from './shared/theme';
import { BottomBar, RootTab } from './shared/ui';
import { AIAssistProvider } from './features/assist/AIAssistProvider';
import {
  AIAssistObjectReference,
  AIAssistScene,
} from './features/assist/aiAssistTypes';
import { AgentWorkspace } from './models/agentWorkspace';
import {
  WorkspaceContinuationDraft,
  WorkspaceDiscussionContext,
  workspaceDiscussionContext,
} from './models/workspaceContext';
import { AgentWorkspaceScreen } from './features/workspaces/AgentWorkspaceScreen';
import { WorkspaceSubmissionRecovery } from './features/workspaces/WorkspaceSubmission';
import { MiaoTaskFeed } from './features/miao/MiaoTaskFeed';
import { isV6Palette, v6Palette } from './shared/v6Palette';
import { isXunPalette, xunPalette, xunV3Palette } from './shared/xunPalette';
import { MiaoTaskWorkspace } from './features/miao/MiaoTaskWorkspace';
import { AIRequestComposer } from './features/ai/AIRequestComposer';
import {
  assistMessageLimit,
  buildAssistMessage,
} from './features/assist/assistRequest';
import type { AssistMessageSource } from './features/assist/assistMessageSource';
import { VoiceShortcutDock } from './features/agents/VoiceShortcutDock';
import {
  SecondFloorScreen,
  SecondFloorTool,
} from './features/second-floor/SecondFloorScreen';
import { workspacePalette } from './shared/workspacePalette';
import { agentWorkspaceApi } from './services/api/agentWorkspaceApi';
import type { WorkspaceContribution } from './features/messages/WorkspaceContributionCard';
import {
  pickStationPhotoFromLibrary,
  takeStationPhoto,
} from './services/stationMediaPicker';
import {
  pickStationFile,
  releaseStationFile,
} from './services/stationFilePicker';
import { getCurrentLocation } from './services/location';

function App(): React.JSX.Element {
  const session = useMiaoxunSession();
  // V15 keeps Xun's conversation and second-floor states light while Miao and
  // Station retain the dark canvas used by their existing flows.
  const [selectedTab, setSelectedTab] = useState<RootTab>('messages');
  const [secondFloorOpen, setSecondFloorOpen] = useState(false);
  const basePalette = palettes[session.appearance];
  const palette = session.token
    ? selectedTab === 'agents' || selectedTab === 'station'
      ? v6Palette(basePalette)
      : secondFloorOpen
      ? xunPalette(basePalette)
      : xunV3Palette(basePalette)
    : basePalette;
  const messagePalette = resolveMessagePalette(palette);
  // The app opens on 讯 (messages): the conversations are what the user comes
  // back to, and the prototype's first tab is 妙 only because the sheet lays
  // the states out in that order.
  const [secondFloorTool, setSecondFloorTool] =
    useState<SecondFloorTool | null>(null);
  const closeSecondFloor = useCallback(() => {
    setSecondFloorTool(null);
    setSecondFloorOpen(false);
  }, []);
  const [selectedStationTab, setSelectedStationTab] =
    useState<StationTab>('posts');
  const [isPostComposerOpen, setIsPostComposerOpen] = useState(false);
  const [modalRoute, setModalRoute] = useState<ModalRoute>(null);
  const [messageMenuTop, setMessageMenuTop] = useState<number>();
  const [messageMenuPullHintVisible, setMessageMenuPullHintVisible] =
    useState(false);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [activeThreadOwner, setActiveThreadOwner] = useState<string | null>(
    null,
  );
  const [workspaceContribution, setWorkspaceContribution] = useState<{
    owner: string;
    threadId: string;
    contribution: WorkspaceContribution;
  } | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [showLaunchAnimation, setShowLaunchAnimation] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMessageTab, setSelectedMessageTab] =
    useState<MessageTab>('chat');
  const [pendingScanRequest, setPendingScanRequest] = useState(false);
  const [stationVisited, setStationVisited] = useState(false);
  const [butlerDraft, setButlerDraft] = useState('');
  const [butlerDraftOwner, setButlerDraftOwner] = useState('');
  const [butlerSource, setButlerSource] = useState<AssistMessageSource>();
  const [butlerWorkspaceContext, setButlerWorkspaceContext] =
    useState<WorkspaceDiscussionContext>();
  const [miaoVoiceExpanded, setMiaoVoiceExpanded] = useState(false);
  const [miaoWaterfall, setMiaoWaterfall] = useState(false);
  // V15 uses one fixed 89pt navigation surface for every root tab. Keeping
  // this as a constant avoids the voice dock and page content jumping when
  // the palette changes between Miao and Xun.
  const navigationHeight = 89;
  const workspaceOwner = `${session.user?.id || ''}:${session.token || ''}`;
  const workspaceOwnerRef = useRef(workspaceOwner);
  workspaceOwnerRef.current = workspaceOwner;
  const [accessDrafts, setAccessDrafts] = useState<{
    owner: string;
    threads: Record<string, ChatDraftSnapshot>;
  }>({ owner: '', threads: {} });
  const [requestDraftState, setRequestDraftState] = useState({
    owner: '',
    text: '',
  });
  const requestDraft =
    requestDraftState.owner === workspaceOwner ? requestDraftState.text : '';
  const [requestContext, setRequestContext] = useState<{
    owner: string;
    scene: AIAssistScene;
    object?: AIAssistObjectReference;
    references?: AIContextReference[];
  } | null>(null);
  const selectedRequest =
    requestContext?.owner === workspaceOwner ? requestContext : null;
  const requestHandoffGeneration = useRef(0);
  const sessionToken = session.token;
  const refreshSessionBootstrap = session.refreshBootstrap;
  const selectedReference = selectedRequest?.object
    ? persistentAssistReference(selectedRequest.object)
    : null;
  const requestReferences =
    selectedRequest?.references ||
    (selectedReference ? [selectedReference] : []);
  const [composerOwner, setComposerOwner] = useState<string | null>(null);
  const requestComposerOpen = composerOwner === workspaceOwner;
  useEffect(() => {
    return () => {
      requestHandoffGeneration.current += 1;
    };
  }, [workspaceOwner, requestComposerOpen, selectedRequest, requestDraftState]);
  useEffect(() => {
    let wasActive = AppState.currentState === 'active';
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        requestHandoffGeneration.current += 1;
        wasActive = false;
        return;
      }

      // The server-side Agent catalog can be published while the app is in
      // the background. Refresh the authenticated session when the app comes
      // back to the foreground so “我的 Agent” and its recommendation list
      // see the latest registered identities without expanding user access.
      if (
        !wasActive &&
        sessionToken &&
        typeof refreshSessionBootstrap === 'function'
      ) {
        refreshSessionBootstrap(sessionToken, false).catch(() => undefined);
      }
      wasActive = true;
    });
    return () => subscription.remove();
  }, [refreshSessionBootstrap, sessionToken]);
  const [selectedMiaoTask, setSelectedMiaoTask] = useState<{
    owner: string;
    task: AITaskDTO;
  } | null>(null);
  const miaoTask =
    selectedMiaoTask?.owner === workspaceOwner ? selectedMiaoTask.task : null;
  const [selectedWorkspace, setSelectedWorkspace] = useState<{
    owner: string;
    workspace: AgentWorkspace;
    continuationDraft?: WorkspaceContinuationDraft;
  } | null>(null);
  const agentWorkspace =
    selectedWorkspace?.owner === workspaceOwner
      ? selectedWorkspace.workspace
      : null;
  const updateRequestDraft = (text: string) =>
    setRequestDraftState({ owner: workspaceOwner, text });
  useEffect(() => {
    setAccessDrafts({ owner: '', threads: {} });
    setComposerOwner(null);
    setRequestContext(null);
    setButlerSource(undefined);
    setButlerWorkspaceContext(undefined);
    setButlerDraftOwner('');
    setSelectedMiaoTask(null);
    setSelectedWorkspace(null);
    setWorkspaceContribution(null);
    setRequestDraftState({ owner: '', text: '' });
    setMiaoVoiceExpanded(false);
    setMiaoWaterfall(false);
  }, [workspaceOwner]);
  const [butlerReferences, setButlerReferences] = useState<
    AIContextReference[]
  >([]);
  useEffect(() => {
    if (selectedTab === 'station') setStationVisited(true);
  }, [selectedTab]);
  useEffect(() => {
    setStationVisited(false);
    // Signing in or switching accounts lands on 讯, the same page a cold start
    // opens on — not back on 妙.
    setSelectedTab('messages');
    setSelectedMessageTab('chat');
    closeSecondFloor();
    setButlerDraft('');
    setButlerReferences([]);
    setActiveThread(null);
    setActiveThreadOwner(null);
    setWorkspaceContribution(null);
    setModalRoute(null);
    setIsPostComposerOpen(false);
    setPendingScanRequest(false);
    setSearchQuery('');
  }, [closeSecondFloor, session.user?.id]);

  // The retained station screen deliberately stays mounted so the profile
  // collapse and post timeline do not jump when switching root tabs. Its
  // server snapshot therefore needs an explicit refresh whenever the user
  // enters the station again, returns from a modal/workspace, or changes the
  // station sub-tab. Without this, Agent ownership changes made elsewhere can
  // leave the 「我的 Agent」 panel showing the first bootstrap forever.
  const stationVisible =
    selectedTab === 'station' &&
    !modalRoute &&
    !isPostComposerOpen &&
    !requestComposerOpen &&
    !selectedMiaoTask &&
    !selectedWorkspace;
  const previousStationVisible = useRef(false);
  const previousStationTab = useRef(selectedStationTab);
  const { refreshBootstrap } = session;
  useEffect(() => {
    const enteredStation = stationVisible && !previousStationVisible.current;
    const changedStationTab =
      stationVisible && previousStationTab.current !== selectedStationTab;
    previousStationVisible.current = stationVisible;
    previousStationTab.current = selectedStationTab;
    if (
      !(enteredStation || changedStationTab) ||
      !sessionToken ||
      typeof refreshBootstrap !== 'function'
    ) {
      return;
    }
    refreshBootstrap(sessionToken, false).catch(() => undefined);
  }, [
    refreshBootstrap,
    selectedStationTab,
    selectedTab,
    sessionToken,
    stationVisible,
  ]);

  // A long-press menu belongs to the page that opened it. Route changes can
  // unmount or retain the dock in different ways, so clear the parent-owned
  // visibility flag as well as the child gesture state when leaving a route.
  // This prevents returning from Butler, a task, or another modal with the
  // previous menu still hiding the navigation bar.
  useEffect(() => {
    setMiaoVoiceExpanded(false);
  }, [
    agentWorkspace?.id,
    isPostComposerOpen,
    modalRoute,
    requestComposerOpen,
    secondFloorOpen,
    miaoTask?.id,
    selectedMessageTab,
    selectedStationTab,
    selectedTab,
  ]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowLaunchAnimation(false);
    }, 2500);
    return () => clearTimeout(timer);
  }, []);

  const openedThread = useMemo(() => {
    if (!activeThread || activeThreadOwner !== session.user?.id) {
      return null;
    }
    return (
      session.threads.find(thread => thread.id === activeThread.id) ||
      activeThread
    );
  }, [activeThread, activeThreadOwner, session.threads, session.user?.id]);
  const workspaceChatScope = `${workspaceOwner}:${modalRoute || ''}:${
    openedThread?.id || ''
  }:${agentWorkspace?.id || ''}:${requestComposerOpen}`;
  const workspaceChatScopeRef = useRef(workspaceChatScope);
  workspaceChatScopeRef.current = workspaceChatScope;
  const accessDraft =
    accessDrafts.owner === workspaceOwner && openedThread
      ? accessDrafts.threads[openedThread.id]
      : undefined;
  const hasButlerDraft =
    openedThread?.agentId === 'miaoxun-butler' &&
    butlerDraftOwner === workspaceOwner &&
    (Boolean(butlerDraft.trim()) ||
      butlerReferences.length > 0 ||
      !accessDraft);
  const currentScene = useMemo<AIAssistScene>(() => {
    const t = (zh: string, en: string) => textFor(session.language, zh, en);
    if (modalRoute === 'butler' || modalRoute === 'chat')
      return {
        page: modalRoute === 'butler' ? 'messages.butler' : 'messages.chat',
        label: t('讯 · 对话', 'Xun · Conversation'),
        module: {
          key: 'conversation',
          label: openedThread?.title || t('对话', 'Conversation'),
        },
      };
    if (secondFloorOpen) {
      const names = {
        albums: t('相册', 'Albums'),
        files: t('文件', 'Files'),
        relationships: t('关系', 'People'),
        assets: t('资产', 'Assets'),
        information: t('信息海', 'Inbox'),
        permissions: t('权限', 'Access'),
        // Added by the user's decision: publishing and personal settings moved
        // onto this floor from the 我 page.
        publish: t('发布', 'Publish'),
        settings: t('设置', 'Settings'),
      };
      const label = secondFloorTool
        ? names[secondFloorTool]
        : t('入口', 'Home');
      return {
        page: `second-floor.${secondFloorTool || 'home'}`,
        label: t(`讯 · 二楼 · ${label}`, `Xun · Second floor · ${label}`),
      };
    }
    if (selectedTab === 'agents')
      return {
        page: 'miao.feed',
        label: t('妙 · 任务动态', 'Miao · Tasks'),
        module: { key: 'task-feed', label: t('任务动态', 'Task feed') },
      };
    if (selectedTab === 'station') {
      const names = {
        posts: t('动态', 'Posts'),
        agents: t('我的 Agent', 'My Agents'),
      };
      return {
        page: `station.${selectedStationTab}`,
        label: t(
          `我 · ${names[selectedStationTab]}`,
          `Me · ${names[selectedStationTab]}`,
        ),
      };
    }
    return { page: `messages.${selectedMessageTab}`, label: t('讯', 'Xun') };
  }, [
    session.language,
    modalRoute,
    openedThread?.title,
    secondFloorOpen,
    secondFloorTool,
    selectedTab,
    selectedStationTab,
    selectedMessageTab,
  ]);
  const renderUserAvatar = useCallback(
    ({
      text,
      config,
      small,
      size,
    }: {
      text: string;
      config?: AvatarConfigDTO;
      small?: boolean;
      size?: number;
    }) => (
      <UserAvatar
        text={text}
        config={config}
        palette={palette}
        small={small}
        size={size}
      />
    ),
    [palette],
  );
  const openThread = useCallback(
    (thread: ChatThread) => {
      setActiveThread(thread);
      setActiveThreadOwner(session.user?.id || null);
      session.setActiveThreadId(thread.id);
      session.markThreadRead(thread.id);
      setModalRoute(thread.agentId === 'miaoxun-butler' ? 'butler' : 'chat');
    },
    [session],
  );

  const closeThread = () => {
    setModalRoute(null);
    setActiveThread(null);
    setWorkspaceContribution(null);
    session.setActiveThreadId(null);
  };

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(current => (current === message ? null : current));
    }, 1600);
  }, []);

  const openAgentWorkspaceParticipant = useCallback(
    (workspace: AgentWorkspace, step: AgentWorkspace['steps'][number]) => {
      const thread = session.threads.find(
        item => item.agentId === step.agentId,
      );
      if (!thread) {
        showToast(
          textFor(
            session.language,
            '这个 Agent 还没有可用会话，请先添加后再查看协作贡献。',
            'Add this Agent before opening its collaboration contribution.',
          ),
        );
        return;
      }
      setWorkspaceContribution({
        owner: workspaceOwner,
        threadId: thread.id,
        contribution: { workspace, step },
      });
      openThread(thread);
    },
    [openThread, session.language, session.threads, showToast, workspaceOwner],
  );

  const closeWorkspace = () => {
    if (workspaceOwnerRef.current !== workspaceOwner) return;
    setSelectedWorkspace(null);
    session.refreshStationContent().catch(error => {
      if (workspaceOwnerRef.current !== workspaceOwner) return;
      showToast(
        appErrorText(
          session.language,
          error,
          '无法刷新成果，请重新进入成果页。',
          'Unable to refresh outcomes. Reopen the outcomes page.',
        ),
      );
    });
  };

  useEffect(() => {
    const notice = session.realtimeNotificationNotice;
    if (!notice) {
      return;
    }
    showToast(notice.title || notice.body);
  }, [session.realtimeNotificationNotice, showToast]);

  const profileFlows = useProfileFlows({
    language: session.language,
    user: session.user,
    loadPublicProfileByAiId: session.loadPublicProfileByAiId,
    resolveScanPayload: session.resolveScanPayload,
    showToast,
    openModal: setModalRoute,
    closePublicProfileModal: () =>
      setModalRoute(current => (current === 'public-profile' ? null : current)),
  });

  const openFriendThread = useCallback(
    async (friendUserId: string) => {
      try {
        const thread = await session.openFriendThread(friendUserId);
        setModalRoute(null);
        openThread(thread);
      } catch (error) {
        showToast(
          appErrorText(
            session.language,
            error,
            '无法打开好友聊天',
            'Cannot open friend chat',
          ),
        );
      }
    },
    [openThread, session, showToast],
  );

  const openAgentThread = useCallback(
    (agentId: string) => {
      const thread = session.threads.find(item => item.agentId === agentId);
      if (!thread) {
        showToast(
          textFor(
            session.language,
            '这个 Agent 还没有可用会话，请先添加。',
            'Add this agent before opening its chat.',
          ),
        );
        return;
      }
      openThread(thread);
    },
    [openThread, session.language, session.threads, showToast],
  );

  // Composer attachments must travel through the same authenticated station
  // APIs as the second-floor flows. Returning a reference only after the
  // upload is confirmed prevents a picker result from being mistaken for a
  // server-backed AI context item.
  const prepareComposerTool = useCallback(
    async (tool: ComposerTool): Promise<ComposerPreparationResult> => {
      if (tool === '相册' || tool === '拍摄') {
        const media =
          tool === '拍摄'
            ? await takeStationPhoto()
            : await pickStationPhotoFromLibrary();
        if (!media) return null;
        const asset = await session.createStationMediaAsset({
          kind: media.kind,
          originalFilename: media.originalFilename,
          mimeType: media.mimeType,
          byteSize: media.byteSize,
          width: media.width,
          height: media.height,
          localMedia: media,
        });
        return {
          kind: 'station-photo',
          id: asset.id,
          title: asset.originalFilename,
        };
      }

      if (tool === '文件') {
        const file = await pickStationFile();
        if (!file) return null;
        try {
          const asset = await session.uploadStationFileAsset(file);
          if (!asset.reference) {
            throw new Error('文件解析结果缺少引用，请稍后重试。');
          }
          return asset.reference;
        } finally {
          await releaseStationFile(file).catch(() => undefined);
        }
      }

      if (tool === '位置') {
        const coordinates = await getCurrentLocation();
        const location = await session.resolveLocation(coordinates);
        const detail = [location.displayName, location.activityArea]
          .filter(Boolean)
          .join(' · ');
        return {
          draftText: detail
            ? `位置：${detail}`
            : `位置：${coordinates.latitude.toFixed(
                5,
              )}, ${coordinates.longitude.toFixed(5)}`,
        };
      }

      throw new Error(
        textFor(
          session.language,
          `“${tool}”暂未接通后端能力。`,
          `“${tool}” is not connected to a backend capability yet.`,
        ),
      );
    },
    [session],
  );

  const composeWithButler = useCallback(
    (
      draft = '',
      references: AIContextReference[] = [],
      source?: AssistMessageSource,
      taskContext?: WorkspaceDiscussionContext,
    ) => {
      const thread = session.threads.find(
        item => item.agentId === 'miaoxun-butler',
      );
      if (!thread) {
        showToast(
          textFor(
            session.language,
            '请先在我页的 Agent 中添加妙讯管家。',
            'Add the Miao assistant first.',
          ),
        );
        return false;
      }
      setButlerDraft(draft);
      setButlerDraftOwner(workspaceOwner);
      setButlerSource(source || { currentPage: currentScene.page });
      setButlerReferences(references);
      setButlerWorkspaceContext(taskContext);
      openThread(thread);
      return true;
    },
    [
      openThread,
      session.language,
      session.threads,
      showToast,
      workspaceOwner,
      currentScene.page,
    ],
  );
  const continueRequestWithButler = async (message: string) => {
    const selectedWorkspaceContext =
      selectedRequest?.object?.kind === 'agent-workspace'
        ? selectedRequest.object.scene?.workspace
        : undefined;
    let taskContext: WorkspaceDiscussionContext | undefined;
    if (selectedRequest?.object?.kind === 'agent-workspace') {
      if (!session.token || !selectedWorkspaceContext)
        throw new Error('任务关联无效，请重新打开原任务。');
      if (requestReferences.length)
        throw new Error('任务讨论不能同时带入其他素材，请移除引用后重试。');
      const scope = workspaceChatScope;
      const generation = requestHandoffGeneration.current;
      const latest = await agentWorkspaceApi.get(
        session.token,
        selectedWorkspaceContext.id,
      );
      if (
        workspaceOwnerRef.current !== workspaceOwner ||
        workspaceChatScopeRef.current !== scope ||
        requestHandoffGeneration.current !== generation
      )
        return false;
      // This read supplies display facts and permission. The selected version
      // is retained so a later change is never silently treated as reviewed.
      taskContext = workspaceDiscussionContext(latest);
      if (
        latest.revision !== selectedWorkspaceContext.revision ||
        latest.currentRound !== selectedWorkspaceContext.currentRound
      ) {
        setRequestContext(current =>
          current?.owner === workspaceOwner && current.object?.id === latest.id
            ? {
                ...current,
                object: workspaceAssistContext(
                  latest,
                  session.agents,
                  session.language,
                ),
                scene: workspaceAssistContext(
                  latest,
                  session.agents,
                  session.language,
                ).scene!,
              }
            : current,
        );
        throw new Error(
          '任务已更新，已显示当前任务。请核对轮次和成果后再次进入讨论；输入原文已保留。',
        );
      }
    }
    if (
      message.length > assistMessageLimit ||
      !composeWithButler(
        message,
        requestReferences,
        {
          currentPage: selectedRequest?.scene.page || currentScene.page,
        },
        taskContext,
      )
    )
      return false;
    setComposerOwner(null);
    updateRequestDraft('');
    setRequestContext(null);
    return true;
  };
  const openTaskInbox = useCallback(() => {
    closeSecondFloor();
    setSelectedTab('messages');
    setSelectedMessageTab('tasks');
  }, [closeSecondFloor]);
  const openAgentManagement = () => {
    setSelectedWorkspace(null);
    setSelectedMiaoTask(null);
    setComposerOwner(null);
    setModalRoute(null);
    setActiveThread(null);
    session.setActiveThreadId(null);
    closeSecondFloor();
    setSelectedStationTab('agents');
    setSelectedTab('station');
  };
  const openTask = useCallback(
    (task: AITaskDTO) => {
      if (task.kind === 'site_draft') {
        setSelectedStationTab('agents');
        setSelectedTab('station');
        return;
      }
      const thread = session.threads.find(item => item.id === task.threadId);
      if (thread) openThread(thread);
      else
        showToast(
          textFor(
            session.language,
            '任务所属对话已不可用，请刷新后重试。',
            'This conversation is unavailable. Refresh and try again.',
          ),
        );
    },
    [openThread, session.language, session.threads, showToast],
  );

  const askButler = useCallback(
    (object: AIAssistObjectReference) => {
      const scene = object.scene || currentScene;
      setRequestContext({
        owner: workspaceOwner,
        scene,
        object: { ...object, scene },
      });
      setRequestDraftState({
        owner: workspaceOwner,
        text: '',
      });
      setComposerOwner(workspaceOwner);
    },
    [currentScene, workspaceOwner],
  );

  useEffect(() => {
    if (
      !openedThread ||
      modalRoute !== 'chat' ||
      openedThread.unreadCount <= 0
    ) {
      return;
    }
    session.markThreadRead(openedThread.id);
  }, [modalRoute, openedThread, session]);

  const copyAIID = () => {
    const aiId = session.user?.aiId || '';
    if (!aiId) {
      showToast(
        textFor(
          session.language,
          '登录后可复制 AI ID',
          'Log in to copy the AI ID',
        ),
      );
      return;
    }
    Clipboard.setString(aiId);
    showToast(textFor(session.language, '已复制ID', 'ID copied'));
  };

  const requestMessageQRCodeScan = () => {
    if (profileFlows.isScanning || pendingScanRequest) {
      return;
    }
    setPendingScanRequest(true);
    setModalRoute(null);
  };

  const consumePendingScanRequest = useCallback(() => {
    if (!pendingScanRequest) {
      return;
    }
    setPendingScanRequest(false);
    profileFlows.startQRCodeScan().catch(() => undefined);
  }, [pendingScanRequest, profileFlows]);

  useEffect(() => {
    if (Platform.OS === 'ios' || !pendingScanRequest || modalRoute !== null) {
      return;
    }
    consumePendingScanRequest();
  }, [consumePendingScanRequest, modalRoute, pendingScanRequest]);
  const isChatRoute =
    Boolean(openedThread) && (modalRoute === 'butler' || modalRoute === 'chat');
  const chatPalette = isChatRoute ? xunPalette(basePalette) : messagePalette;
  const isRootTabRoute = Boolean(session.token) && !isChatRoute;
  const voiceDockBottomOffset = navigationHeight + 102;
  const rootBackgroundColor = isChatRoute
    ? chatPalette.background
    : palette.background;
  const topSafeAreaColor = isChatRoute
    ? chatPalette.background
    : isRootTabRoute && selectedTab !== 'station'
    ? workspacePalette(palette).background
    : palette.background;
  const bottomSafeAreaColor = isChatRoute
    ? chatPalette.surface
    : isRootTabRoute && selectedTab === 'messages' && secondFloorOpen
    ? workspacePalette(palette).background
    : isV6Palette(palette)
    ? '#FFFFFF'
    : palette.surface;

  return (
    <SafeAreaProvider>
      <View
        testID="app-background-root"
        style={[styles.safeArea, { backgroundColor: rootBackgroundColor }]}
      >
        <SafeAreaView
          edges={['top']}
          testID="app-top-safe-area"
          style={[styles.safeArea, { backgroundColor: topSafeAreaColor }]}
        >
          <SafeAreaView
            edges={
              isRootTabRoute && !(selectedTab === 'messages' && secondFloorOpen)
                ? []
                : ['bottom']
            }
            testID="app-bottom-safe-area"
            style={[styles.safeArea, { backgroundColor: bottomSafeAreaColor }]}
          >
            <AIAssistProvider
              onAskButler={askButler}
              scene={currentScene}
              routeKey={`${
                session.user?.id || ''
              }:${selectedTab}:${selectedStationTab}:${
                modalRoute || ''
              }:${isPostComposerOpen}:${secondFloorOpen}:${requestComposerOpen}:${
                miaoTask?.id || agentWorkspace?.id || ''
              }:${secondFloorTool || ''}:${
                openedThread?.id || ''
              }:${selectedMessageTab}:${session.token}`}
            >
              <StatusBar
                barStyle={
                  isChatRoute
                    ? isXunPalette(chatPalette)
                      ? 'dark-content'
                      : 'light-content'
                    : isV6Palette(palette) ||
                      (!session.token && session.appearance === 'dark')
                    ? 'light-content'
                    : 'dark-content'
                }
              />
              {session.isRestoring ? null : session.restoreStatus ===
                'networkError' ? (
                <RestoreErrorScreen
                  palette={palette}
                  language={session.language}
                  message={session.errorMessage}
                  isBusy={session.isBusy}
                  onRetry={() => {
                    session.retryRestoreSession().catch(error => {
                      showToast(
                        appErrorText(
                          session.language,
                          error,
                          '同步失败',
                          'Sync failed',
                        ),
                      );
                    });
                  }}
                  onSignOut={() => {
                    session.signOut().catch(error => {
                      showToast(
                        appErrorText(
                          session.language,
                          error,
                          '退出登录失败',
                          'Logout failed',
                        ),
                      );
                    });
                  }}
                />
              ) : session.token ? (
                <>
                  {openedThread &&
                  (modalRoute === 'butler' || modalRoute === 'chat') ? (
                    <ChatScreen
                      token={session.token}
                      onConfirmUIPreferences={session.confirmUIPreferences}
                      workspaceContribution={
                        workspaceContribution?.owner === workspaceOwner &&
                        workspaceContribution.threadId === openedThread.id
                          ? workspaceContribution.contribution
                          : undefined
                      }
                      onOpenWorkspace={(workspace, continuationDraft) => {
                        if (
                          workspaceChatScopeRef.current !== workspaceChatScope
                        )
                          return;
                        setSelectedWorkspace({
                          owner: workspaceOwner,
                          workspace,
                          ...(continuationDraft ? { continuationDraft } : {}),
                        });
                      }}
                      onAuthorizeAlbumAI={async () => openAgentManagement()}
                      onOpenAgentAccess={openAgentManagement}
                      onPrepareComposerTool={prepareComposerTool}
                      agentGrantedScopes={
                        session.ownedAgents.find(
                          agent =>
                            agent.id === openedThread.agentId && agent.enabled,
                        )?.grantedScopes || []
                      }
                      key={`${workspaceOwner}:${openedThread.id}`}
                      onPreserveDraftForAccess={draft => {
                        if (workspaceOwnerRef.current !== workspaceOwner)
                          return;
                        setAccessDrafts(current => ({
                          owner: workspaceOwner,
                          threads: {
                            ...(current.owner === workspaceOwner
                              ? current.threads
                              : {}),
                            [openedThread.id]: {
                              ...draft,
                              references: draft.references.map(reference => ({
                                ...reference,
                              })),
                              ...(draft.source
                                ? { source: { ...draft.source } }
                                : {}),
                              ...(draft.workspaceContext
                                ? {
                                    workspaceContext: {
                                      ...draft.workspaceContext,
                                    },
                                  }
                                : {}),
                            },
                          },
                        }));
                      }}
                      initialDraft={
                        hasButlerDraft ? butlerDraft : accessDraft?.text
                      }
                      initialContextRefs={
                        hasButlerDraft
                          ? butlerReferences
                          : accessDraft?.references
                      }
                      initialAssistSource={
                        hasButlerDraft ? butlerSource : accessDraft?.source
                      }
                      initialWorkspaceContext={
                        hasButlerDraft
                          ? butlerWorkspaceContext
                          : accessDraft?.workspaceContext
                      }
                      initialReplyToMessageId={
                        hasButlerDraft
                          ? undefined
                          : accessDraft?.replyToMessageId
                      }
                      initialAgentContextReset={accessDraft?.agentContextReset}
                      initialButlerContextReset={
                        hasButlerDraft
                          ? !butlerWorkspaceContext &&
                            Boolean(
                              butlerReferences.length &&
                                pendingButlerClarification(openedThread),
                            )
                          : accessDraft?.butlerContextReset
                      }
                      onInitialDraftConsumed={() => {
                        if (workspaceOwnerRef.current !== workspaceOwner)
                          return;
                        setAccessDrafts(current => {
                          if (
                            current.owner !== workspaceOwner ||
                            !current.threads[openedThread.id]
                          )
                            return current;
                          const threads = { ...current.threads };
                          delete threads[openedThread.id];
                          return { owner: workspaceOwner, threads };
                        });
                        setButlerDraft('');
                        setButlerReferences([]);
                        setButlerSource(undefined);
                        setButlerWorkspaceContext(undefined);
                        setButlerDraftOwner('');
                      }}
                      onRefreshThread={() =>
                        session.refreshThreadMessages(openedThread.id)
                      }
                      palette={chatPalette}
                      language={session.language}
                      currentUserId={session.user?.id || ''}
                      currentUserName={session.user?.displayName || ''}
                      currentUserAvatarConfig={session.profile.avatarConfig}
                      thread={openedThread}
                      agents={session.agents}
                      renderUserAvatar={renderUserAvatar}
                      onBack={closeThread}
                      onSend={(
                        content,
                        retryMessageId,
                        replyToMessageId,
                        contextRefs,
                        assistSource,
                        butlerContextReset,
                        taskContext,
                        agentContextReset,
                      ) =>
                        session.sendMessage(
                          openedThread.id,
                          content,
                          retryMessageId,
                          replyToMessageId,
                          contextRefs,
                          assistSource,
                          ...((agentContextReset
                            ? [undefined, undefined, true]
                            : taskContext
                            ? [undefined, taskContext]
                            : butlerContextReset
                            ? [true]
                            : []) as [
                            boolean?,
                            WorkspaceDiscussionContext?,
                            boolean?,
                          ]),
                        )
                      }
                      onDeleteMessage={messageId =>
                        session.deleteMessage(openedThread.id, messageId)
                      }
                      onRecallMessage={messageId =>
                        session.recallMessage(openedThread.id, messageId)
                      }
                      onSetMuted={muted =>
                        session.setThreadMuted(openedThread.id, muted)
                      }
                      onActionError={message =>
                        showToast(
                          appErrorText(
                            session.language,
                            message,
                            '操作失败',
                            'Action failed',
                          ),
                        )
                      }
                      onOpenPeerProfile={
                        openedThread.peerAiId
                          ? () => {
                              closeThread();
                              profileFlows
                                .openPublicProfileByAiId(
                                  openedThread.peerAiId || '',
                                )
                                .catch(() => undefined);
                            }
                          : undefined
                      }
                    />
                  ) : null}
                  <View
                    testID="app-shell"
                    style={[
                      styles.shell,
                      { backgroundColor: workspacePalette(palette).background },
                      isChatRoute && appStyles.hidden,
                    ]}
                    pointerEvents={isChatRoute ? 'none' : 'auto'}
                    accessibilityElementsHidden={isChatRoute}
                    importantForAccessibility={
                      isChatRoute ? 'no-hide-descendants' : 'auto'
                    }
                  >
                    {selectedTab === 'agents' ? (
                      <MiaoTaskFeed
                        key={workspaceOwner}
                        token={session.token}
                        active={
                          !isChatRoute &&
                          !modalRoute &&
                          !requestComposerOpen &&
                          !miaoTask &&
                          !agentWorkspace &&
                          !isPostComposerOpen
                        }
                        palette={palette}
                        voiceMenuExpanded={miaoVoiceExpanded}
                        language={session.language}
                        agents={session.agents}
                        waterfall={miaoWaterfall}
                        onOpenWorkspace={workspace =>
                          setSelectedWorkspace({
                            owner: workspaceOwner,
                            workspace,
                          })
                        }
                        onOpenTask={task =>
                          setSelectedMiaoTask({ owner: workspaceOwner, task })
                        }
                        onOpenAgentParticipant={openAgentWorkspaceParticipant}
                        uiPreferences={session.uiPreferences}
                      />
                    ) : null}
                    {selectedTab === 'messages' && secondFloorOpen ? (
                      <SecondFloorScreen
                        active={
                          !isChatRoute &&
                          !modalRoute &&
                          !isPostComposerOpen &&
                          !requestComposerOpen
                        }
                        onToolChange={setSecondFloorTool}
                        key={workspaceOwner}
                        palette={palette}
                        language={session.language}
                        session={session}
                        onClose={closeSecondFloor}
                        onOpenFriendThread={openFriendThread}
                        onOpenProfile={profileFlows.openPublicProfileByAiId}
                        onOpenSettings={() => setModalRoute('settings')}
                        onOpenDeleteAccount={() =>
                          setModalRoute('delete-account')
                        }
                        onOpenPostComposer={() => setIsPostComposerOpen(true)}
                        onOpenNotices={() => {
                          closeSecondFloor();
                          setSelectedMessageTab('notice');
                        }}
                        onOpenFileAgent={reference => {
                          const thread = session.threads.find(
                            item => item.agentId === 'file-preprocessor',
                          );
                          if (!thread) {
                            openAgentThread('file-preprocessor');
                            return;
                          }
                          setAccessDrafts({
                            owner: workspaceOwner,
                            threads: {
                              [thread.id]: {
                                text: '',
                                references: [reference],
                                agentContextReset: true,
                              },
                            },
                          });
                          openThread(thread);
                        }}
                      />
                    ) : null}
                    {selectedTab === 'messages' && !secondFloorOpen ? (
                      <View style={appStyles.retained}>
                        <MessagesScreen
                          token={session.token}
                          active={
                            !modalRoute &&
                            !isPostComposerOpen &&
                            !requestComposerOpen &&
                            !miaoTask &&
                            !agentWorkspace
                          }
                          onOpenTask={openTask}
                          onOpenWorkspace={workspace => {
                            if (workspaceOwnerRef.current !== workspaceOwner)
                              return;
                            setSelectedWorkspace({
                              owner: workspaceOwner,
                              workspace,
                            });
                          }}
                          onOpenAgentParticipant={openAgentWorkspaceParticipant}
                          onOpenSecondFloor={() => setSecondFloorOpen(true)}
                          uiPreferences={session.uiPreferences}
                          messageActionsOpen={
                            modalRoute === 'message-actions' ||
                            miaoVoiceExpanded
                          }
                          palette={palette}
                          language={session.language}
                          threads={session.threads}
                          agents={session.agents}
                          notices={session.notices}
                          unreadNoticeCount={session.unreadNoticeCount}
                          selectedMessageTab={selectedMessageTab}
                          renderUserAvatar={renderUserAvatar}
                          onOpenThread={openThread}
                          onOpenMessageActions={(
                            anchorTop,
                            pullHintVisible,
                          ) => {
                            setMessageMenuTop(anchorTop);
                            setMessageMenuPullHintVisible(
                              Boolean(pullHintVisible),
                            );
                            setModalRoute('message-actions');
                          }}
                          onOpenSearch={() => {
                            setSearchQuery('');
                            setModalRoute('search');
                          }}
                          onSelectMessageTab={setSelectedMessageTab}
                          onMarkNotificationRead={session.markNotificationRead}
                          onAcceptFriendRequest={async requestId => {
                            try {
                              await session.acceptFriendRequest(requestId);
                              await session.refreshBootstrap(undefined, false);
                              showToast(
                                textFor(
                                  session.language,
                                  '已通过好友申请',
                                  'Friend request accepted',
                                ),
                              );
                            } catch (error) {
                              showToast(
                                appErrorText(
                                  session.language,
                                  error,
                                  '操作失败',
                                  'Action failed',
                                ),
                              );
                            }
                          }}
                          onRejectFriendRequest={async requestId => {
                            try {
                              await session.rejectFriendRequest(requestId);
                              await session.refreshNotifications();
                              showToast(
                                textFor(
                                  session.language,
                                  '已拒绝好友申请',
                                  'Friend request rejected',
                                ),
                              );
                            } catch (error) {
                              showToast(
                                appErrorText(
                                  session.language,
                                  error,
                                  '操作失败',
                                  'Action failed',
                                ),
                              );
                            }
                          }}
                        />
                      </View>
                    ) : null}
                    {stationVisited || selectedTab === 'station' ? (
                      <View
                        style={[
                          appStyles.retained,
                          selectedTab !== 'station' && appStyles.hidden,
                        ]}
                        pointerEvents={
                          selectedTab === 'station' ? 'auto' : 'none'
                        }
                        accessibilityElementsHidden={selectedTab !== 'station'}
                        importantForAccessibility={
                          selectedTab === 'station'
                            ? 'auto'
                            : 'no-hide-descendants'
                        }
                      >
                        <StationScreen
                          key={session.user?.id}
                          active={
                            selectedTab === 'station' &&
                            !isChatRoute &&
                            !modalRoute &&
                            !isPostComposerOpen &&
                            !requestComposerOpen &&
                            !miaoTask &&
                            !agentWorkspace
                          }
                          palette={palette}
                          language={session.language}
                          session={session}
                          selectedStationTab={selectedStationTab}
                          onSelectStationTab={setSelectedStationTab}
                          renderUserAvatar={renderUserAvatar}
                          onOpenLocation={() =>
                            setModalRoute('station-location')
                          }
                          onOpenProfileEdit={() =>
                            setModalRoute('station-profile-edit')
                          }
                          onCopyAIID={copyAIID}
                          onOpenQRCode={profileFlows.openQRCode}
                          onOpenAgentThread={openAgentThread}
                          onActionMessage={showToast}
                          onActionError={error =>
                            showToast(
                              appErrorText(
                                session.language,
                                error,
                                '操作失败',
                                'Action failed',
                              ),
                            )
                          }
                        />
                      </View>
                    ) : null}

                    {!(selectedTab === 'messages' && secondFloorOpen) ? (
                      <View testID="root-navigation">
                        <BottomBar
                          palette={palette}
                          language={session.language}
                          selectedTab={selectedTab}
                          onSelectTab={tab => {
                            closeSecondFloor();
                            setSelectedTab(tab);
                          }}
                        />
                      </View>
                    ) : null}
                    {selectedTab === 'messages' && !secondFloorOpen ? (
                      <VoiceShortcutDock
                        key={`assistant:${workspaceOwner}`}
                        active={
                          !isChatRoute &&
                          !modalRoute &&
                          !isPostComposerOpen &&
                          !requestComposerOpen &&
                          !miaoTask &&
                          !agentWorkspace
                        }
                        palette={palette}
                        language={session.language}
                        tone="xun"
                        bottomOffset={voiceDockBottomOffset}
                        onCompose={composeWithButler}
                        onOpenButler={composeWithButler}
                        onToggleFeed={openTaskInbox}
                        onExpandedChange={setMiaoVoiceExpanded}
                      />
                    ) : null}
                    {selectedTab === 'agents' ? (
                      <VoiceShortcutDock
                        key={`voice:${workspaceOwner}`}
                        active={
                          !modalRoute &&
                          !requestComposerOpen &&
                          !miaoTask &&
                          !agentWorkspace &&
                          !isPostComposerOpen
                        }
                        palette={palette}
                        language={session.language}
                        bottomOffset={voiceDockBottomOffset}
                        onExpandedChange={setMiaoVoiceExpanded}
                        onToggleFeed={() => setMiaoWaterfall(value => !value)}
                        onCompose={transcript => {
                          if (!selectedRequest)
                            setRequestContext({
                              owner: workspaceOwner,
                              scene: currentScene,
                            });
                          if (transcript)
                            updateRequestDraft(
                              [requestDraft, transcript]
                                .filter(Boolean)
                                .join('\n'),
                            );
                          setComposerOwner(workspaceOwner);
                        }}
                        onOpenButler={async transcript => {
                          const draft = [requestDraft, transcript]
                            .filter(Boolean)
                            .join('\n');
                          const scene = selectedRequest?.scene || currentScene;
                          const message =
                            draft.trim() || selectedRequest
                              ? buildAssistMessage(
                                  draft,
                                  scene,
                                  selectedRequest?.object,
                                  session.language,
                                )
                              : '';
                          let continued = false;
                          try {
                            continued = await continueRequestWithButler(
                              message,
                            );
                          } catch (issue) {
                            if (workspaceOwnerRef.current !== workspaceOwner)
                              return;
                            showToast(
                              issue instanceof Error
                                ? issue.message
                                : '无法打开原任务讨论。',
                            );
                          }
                          if (!continued) {
                            if (!selectedRequest)
                              setRequestContext({
                                owner: workspaceOwner,
                                scene,
                              });
                            updateRequestDraft(draft);
                            setComposerOwner(workspaceOwner);
                          }
                        }}
                      />
                    ) : null}
                  </View>
                </>
              ) : (
                <AuthScreen
                  palette={palette}
                  language={session.language}
                  isBusy={session.isBusy}
                  errorMessage={session.errorMessage}
                  onSignIn={session.signIn}
                  onSignUp={async (...args) => {
                    await session.signUp(...args);
                    showToast(
                      textFor(
                        session.language,
                        '注册成功，已登录妙讯',
                        'Account created and signed in',
                      ),
                    );
                  }}
                />
              )}

              {session.token &&
              (requestComposerOpen || miaoTask || agentWorkspace) ? (
                <Modal
                  visible
                  animationType="slide"
                  presentationStyle="fullScreen"
                  onRequestClose={() => {
                    setComposerOwner(null);
                    setSelectedMiaoTask(null);
                    if (agentWorkspace) closeWorkspace();
                  }}
                >
                  <SafeAreaProvider>
                    <SafeAreaView
                      style={[
                        appStyles.retained,
                        {
                          backgroundColor: workspacePalette(palette).background,
                        },
                      ]}
                    >
                      {requestComposerOpen ? (
                        <AIRequestComposer
                          palette={palette}
                          language={session.language}
                          draft={requestDraft}
                          scene={selectedRequest?.scene}
                          context={selectedRequest?.object}
                          references={selectedRequest?.references}
                          onRemoveReference={index =>
                            setRequestContext(value =>
                              value?.owner === workspaceOwner
                                ? {
                                    ...value,
                                    references: value.references?.filter(
                                      (_ref, i) => i !== index,
                                    ),
                                  }
                                : value,
                            )
                          }
                          onRemoveContext={() =>
                            setRequestContext(value =>
                              value ? { ...value, object: undefined } : null,
                            )
                          }
                          recovery={
                            session.user ? (
                              <WorkspaceSubmissionRecovery
                                token={session.token}
                                userId={session.user.id}
                                palette={workspacePalette(palette)}
                                language={session.language}
                                onCreated={workspace => {
                                  if (
                                    workspaceOwnerRef.current !== workspaceOwner
                                  )
                                    return;
                                  setComposerOwner(null);
                                  setSelectedWorkspace({
                                    owner: workspaceOwner,
                                    workspace,
                                  });
                                }}
                              />
                            ) : undefined
                          }
                          onChangeDraft={updateRequestDraft}
                          onClose={() => setComposerOwner(null)}
                          onContinue={continueRequestWithButler}
                        />
                      ) : agentWorkspace ? (
                        <AgentWorkspaceScreen
                          token={session.token}
                          userId={session.user?.id || ''}
                          workspace={agentWorkspace}
                          initialContinuationDraft={
                            selectedWorkspace?.owner === workspaceOwner
                              ? selectedWorkspace.continuationDraft
                              : undefined
                          }
                          onContinuationDraftConsumed={() =>
                            setSelectedWorkspace(current =>
                              current?.owner === workspaceOwner &&
                              current.workspace.id === agentWorkspace.id
                                ? {
                                    owner: current.owner,
                                    workspace: current.workspace,
                                  }
                                : current,
                            )
                          }
                          agents={session.agents}
                          palette={palette}
                          language={session.language}
                          onClose={closeWorkspace}
                          onManageAgents={openAgentManagement}
                          onOpenSource={async workspace => {
                            if (
                              workspaceOwnerRef.current !== workspaceOwner ||
                              workspaceChatScopeRef.current !==
                                workspaceChatScope ||
                              !workspace.origin
                            )
                              return;
                            const origin = workspace.origin;
                            const thread = session.threads.find(
                              item =>
                                item.id === origin.threadId &&
                                item.agentId === origin.agentId,
                            );
                            if (!thread) {
                              showToast(
                                textFor(
                                  session.language,
                                  '原会话已不可用，请刷新后重试。',
                                  'The original conversation is unavailable. Refresh and try again.',
                                ),
                              );
                              return;
                            }
                            try {
                              await session.refreshThreadMessages(thread.id);
                              if (
                                workspaceOwnerRef.current !== workspaceOwner ||
                                workspaceChatScopeRef.current !==
                                  workspaceChatScope
                              )
                                return;
                              setSelectedWorkspace(null);
                              openThread(thread);
                            } catch (issue) {
                              if (workspaceOwnerRef.current === workspaceOwner)
                                showToast(
                                  appErrorText(
                                    session.language,
                                    issue,
                                    '无法读取原会话，请重试。',
                                    'Unable to load the original conversation. Try again.',
                                  ),
                                );
                            }
                          }}
                          onNewTask={workspace => {
                            if (workspaceOwnerRef.current !== workspaceOwner)
                              return;
                            if (
                              workspace.executionMode === 'direct' &&
                              workspace.origin
                            ) {
                              const origin = workspace.origin;
                              const thread = session.threads.find(
                                item =>
                                  item.id === origin.threadId &&
                                  item.agentId === origin.agentId,
                              );
                              if (!thread) {
                                showToast(
                                  textFor(
                                    session.language,
                                    '原专业 Agent 会话已不可用，请刷新后重试。',
                                    'The original Agent conversation is unavailable. Refresh and try again.',
                                  ),
                                );
                                return;
                              }
                              setAccessDrafts(current => ({
                                owner: workspaceOwner,
                                threads: {
                                  ...(current.owner === workspaceOwner
                                    ? current.threads
                                    : {}),
                                  [thread.id]: {
                                    text: [
                                      ...new Set(
                                        [
                                          workspace.goal,
                                          ...workspace.followups,
                                          ...workspace.rounds
                                            .slice(1)
                                            .map(round => round.instruction),
                                        ].filter(Boolean),
                                      ),
                                    ].join('\n\n'),
                                    references: workspace.contextRefs.map(
                                      reference => ({ ...reference }),
                                    ),
                                    agentContextReset: true,
                                  },
                                },
                              }));
                              setSelectedWorkspace(null);
                              openThread(thread);
                              return;
                            }
                            setRequestContext({
                              owner: workspaceOwner,
                              scene: {
                                page: 'miao.workspace',
                                label: textFor(
                                  session.language,
                                  '妙 · 协作详情',
                                  'Miao · Workspace',
                                ),
                                module: {
                                  key: 'workspace-details',
                                  label: textFor(
                                    session.language,
                                    '重新发起任务',
                                    'Restart a task',
                                  ),
                                },
                              },
                              references: workspace.contextRefs.map(ref => ({
                                ...ref,
                              })),
                            });
                            updateRequestDraft(
                              [
                                workspace.goal,
                                ...workspace.followups.map(
                                  text =>
                                    `${textFor(
                                      session.language,
                                      '已补充要求',
                                      'Additional requirements',
                                    )}：${text}`,
                                ),
                              ].join('\n\n'),
                            );
                            setSelectedWorkspace(null);
                            setComposerOwner(workspaceOwner);
                          }}
                        />
                      ) : miaoTask ? (
                        <MiaoTaskWorkspace
                          token={session.token}
                          task={miaoTask}
                          agents={session.agents}
                          palette={palette}
                          language={session.language}
                          onClose={() => setSelectedMiaoTask(null)}
                          onOpenSource={task => {
                            setSelectedMiaoTask(null);
                            openTask(task);
                          }}
                        />
                      ) : null}
                    </SafeAreaView>
                  </SafeAreaProvider>
                </Modal>
              ) : null}
              <AppModals
                modalRoute={modalRoute}
                messageMenuTop={messageMenuTop}
                messageMenuPullHintVisible={messageMenuPullHintVisible}
                palette={palette}
                session={session}
                profileFlows={profileFlows}
                searchQuery={searchQuery}
                renderUserAvatar={renderUserAvatar}
                onCloseModal={() => setModalRoute(null)}
                onNavigateModal={setModalRoute}
                onOpenThread={openThread}
                onSelectTab={tab => {
                  closeSecondFloor();
                  setSelectedTab(tab);
                }}
                onComposeWithButler={composeWithButler}
                onOpenTaskInbox={openTaskInbox}
                onAssistantExpandedChange={setMiaoVoiceExpanded}
                onSearchQueryChange={setSearchQuery}
                onOpenFriendThread={openFriendThread}
                onStartChat={() => {
                  setSearchQuery('');
                  setModalRoute('search');
                }}
                onCreateGroup={() => {
                  setModalRoute(null);
                  showToast(
                    textFor(
                      session.language,
                      '创建群聊暂未接入，请先发起一对一聊天',
                      'Group chat creation is not available yet. Start a one-to-one chat instead.',
                    ),
                  );
                }}
                onRequestMessageQRCodeScan={requestMessageQRCodeScan}
                onConsumePendingScanRequest={consumePendingScanRequest}
                onToast={showToast}
              />
              {session.token && session.user && isPostComposerOpen ? (
                <StationPostComposerScreen
                  palette={palette}
                  language={session.language}
                  session={session}
                  onClose={() => setIsPostComposerOpen(false)}
                  onPublished={() => {
                    setIsPostComposerOpen(false);
                    setSelectedTab('station');
                    setSelectedStationTab('posts');
                    showToast(
                      textFor(session.language, '动态已发布', 'Post published'),
                    );
                  }}
                  onActionError={error =>
                    showToast(
                      appErrorText(
                        session.language,
                        error,
                        '发布失败，请稍后重试',
                        'Could not publish. Try again.',
                      ),
                    )
                  }
                />
              ) : null}
              {toastMessage ? (
                <View style={[styles.toastWrap, styles.pointerEventsNone]}>
                  <View
                    style={[styles.toast, { backgroundColor: palette.text }]}
                  >
                    <Text
                      style={[styles.toastText, { color: palette.background }]}
                    >
                      {toastMessage}
                    </Text>
                  </View>
                </View>
              ) : null}
              {showLaunchAnimation ? (
                <LaunchAnimation
                  palette={palette}
                  language={session.language}
                />
              ) : null}
            </AIAssistProvider>
          </SafeAreaView>
        </SafeAreaView>
      </View>
    </SafeAreaProvider>
  );
}

export default App;

const appStyles = StyleSheet.create({
  hidden: { display: 'none' },
  retained: { flex: 1 },
});
