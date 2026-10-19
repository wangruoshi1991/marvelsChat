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
  Animated,
  Easing,
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
import { resolveMessagePalette } from './features/messages/messagePalette';
import { pendingButlerClarification } from './features/messages/butlerClarification';
import { useProfileFlows } from './features/profile/useProfileFlows';
import { StationPostComposerScreen } from './features/station/StationPostComposerScreen';
import { StationScreen } from './features/station/StationScreen';
import { StationTab } from './features/station/stationTypes';
import { AvatarConfigDTO } from './models/api';
import { appErrorText, textFor } from './shared/i18n';
import { styles } from './shared/styles';
import {
  isLightPalette,
  pageGradientBottom,
  pageGradientTop,
  palettes,
} from './shared/theme';
import { PageGradient } from './shared/PageGradient';
import { entranceCurve, useReduceMotion } from './shared/useReduceMotion';
import { BottomBar, RootTab } from './shared/ui';
import { AIAssistProvider } from './features/assist/AIAssistProvider';
import {
  AIAssistObjectReference,
  AIAssistScene,
} from './features/assist/aiAssistTypes';
import { AgentWorkspace } from './models/agentWorkspace';
import { AgentWorkspaceScreen } from './features/workspaces/AgentWorkspaceScreen';
import { WorkspaceSubmissionRecovery } from './features/workspaces/WorkspaceSubmission';
import { MiaoTaskFeed } from './features/miao/MiaoTaskFeed';
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

function App(): React.JSX.Element {
  const session = useMiaoxunSession();
  const palette = palettes[session.appearance];
  const messagePalette = resolveMessagePalette(palette);
  // The app opens on 讯 (messages): the conversations are what the user comes
  // back to, and the prototype's first tab is 妙 only because the sheet lays
  // the states out in that order.
  const [selectedTab, setSelectedTab] = useState<RootTab>('messages');
  const [secondFloorOpen, setSecondFloorOpen] = useState(false);
  const [secondFloorTool, setSecondFloorTool] =
    useState<SecondFloorTool | null>(null);
  const closeSecondFloor = useCallback(() => setSecondFloorOpen(false), []);
  const [selectedStationTab, setSelectedStationTab] =
    useState<StationTab>('posts');
  const [isPostComposerOpen, setIsPostComposerOpen] = useState(false);
  const [modalRoute, setModalRoute] = useState<ModalRoute>(null);
  const [activeThread, setActiveThread] = useState<ChatThread | null>(null);
  const [activeThreadOwner, setActiveThreadOwner] = useState<string | null>(
    null,
  );
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
  const [miaoVoiceExpanded, setMiaoVoiceExpanded] = useState(false);
  const [miaoWaterfall, setMiaoWaterfall] = useState(false);
  const [navigationHeight, setNavigationHeight] = useState(76);
  // Prototype `.tabbar` transitions `opacity .28s ease, transform .34s
  // cubic-bezier(.2,.8,.2,1)`, and its hidden state is `opacity: 0;
  // transform: translate(-50%, 34px)` — not an instant disappear.
  const navigationHideProgress = useRef(new Animated.Value(1)).current;
  const reduceMotion = useReduceMotion();
  useEffect(() => {
    navigationHideProgress.stopAnimation();
    const target = miaoVoiceExpanded ? 0 : 1;
    if (reduceMotion) {
      navigationHideProgress.setValue(target);
      return;
    }
    const animation = Animated.parallel([
      Animated.timing(navigationHideProgress, {
        toValue: target,
        duration: 340,
        easing: Easing.bezier(...entranceCurve),
        useNativeDriver: true,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [miaoVoiceExpanded, navigationHideProgress, reduceMotion]);
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
  const selectedReference = selectedRequest?.object
    ? persistentAssistReference(selectedRequest.object)
    : null;
  const requestReferences =
    selectedRequest?.references ||
    (selectedReference ? [selectedReference] : []);
  const [composerOwner, setComposerOwner] = useState<string | null>(null);
  const requestComposerOpen = composerOwner === workspaceOwner;
  const [selectedMiaoTask, setSelectedMiaoTask] = useState<{
    owner: string;
    task: AITaskDTO;
  } | null>(null);
  const miaoTask =
    selectedMiaoTask?.owner === workspaceOwner ? selectedMiaoTask.task : null;
  const [selectedWorkspace, setSelectedWorkspace] = useState<{
    owner: string;
    workspace: AgentWorkspace;
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
    setButlerDraftOwner('');
    setSelectedMiaoTask(null);
    setSelectedWorkspace(null);
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
    setSecondFloorOpen(false);
    setButlerDraft('');
    setButlerReferences([]);
    setActiveThread(null);
    setActiveThreadOwner(null);
    setModalRoute(null);
    setIsPostComposerOpen(false);
    setPendingScanRequest(false);
    setSearchQuery('');
  }, [session.user?.id]);

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
    session.setActiveThreadId(null);
  };

  const showToast = useCallback((message: string) => {
    setToastMessage(message);
    setTimeout(() => {
      setToastMessage(current => (current === message ? null : current));
    }, 1600);
  }, []);

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

  const composeWithButler = useCallback(
    (
      draft = '',
      references: AIContextReference[] = [],
      source?: AssistMessageSource,
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
  const continueRequestWithButler = (message: string) => {
    if (
      message.length > assistMessageLimit ||
      !composeWithButler(message, requestReferences, {
        currentPage: selectedRequest?.scene.page || currentScene.page,
      })
    )
      return false;
    setComposerOwner(null);
    updateRequestDraft('');
    setRequestContext(null);
    return true;
  };
  const openTaskInbox = useCallback(() => {
    setSecondFloorOpen(false);
    setSelectedTab('messages');
    setSelectedMessageTab('tasks');
  }, []);
  const openAgentManagement = () => {
    setSelectedWorkspace(null);
    setSelectedMiaoTask(null);
    setComposerOwner(null);
    setModalRoute(null);
    setActiveThread(null);
    session.setActiveThreadId(null);
    setSecondFloorOpen(false);
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
  const isRootTabRoute = Boolean(session.token) && !isChatRoute;
  const voiceDockBottomOffset = navigationHeight + 64;
  // In light mode the root tabs paint `PageGradient` instead of a flat fill, so
  // the safe-area strips have to match the gradient's own ends or they read as
  // two extra bands above and below it.
  const lightTheme = isLightPalette(palette);
  const topSafeAreaColor = isChatRoute
    ? messagePalette.background
    : isRootTabRoute && lightTheme
    ? pageGradientTop
    : isRootTabRoute && selectedTab !== 'station'
    ? workspacePalette(palette).background
    : palette.background;
  const bottomSafeAreaColor = isChatRoute
    ? messagePalette.surface
    : isRootTabRoute && lightTheme
    ? pageGradientBottom
    : isRootTabRoute &&
      ((selectedTab === 'messages' && secondFloorOpen) ||
        (miaoVoiceExpanded && selectedTab !== 'station'))
    ? workspacePalette(palette).background
    : palette.surface;

  return (
    <SafeAreaProvider>
      <SafeAreaView
        edges={['top']}
        style={[styles.safeArea, { backgroundColor: topSafeAreaColor }]}
      >
        <SafeAreaView
          edges={['bottom']}
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
                session.appearance === 'dark' ? 'light-content' : 'dark-content'
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
                    onOpenWorkspace={workspace => {
                      if (workspaceChatScopeRef.current !== workspaceChatScope)
                        return;
                      setSelectedWorkspace({
                        owner: workspaceOwner,
                        workspace,
                      });
                    }}
                    onAuthorizeAlbumAI={async () => openAgentManagement()}
                    onOpenAgentAccess={openAgentManagement}
                    agentGrantedScopes={
                      session.ownedAgents.find(
                        agent =>
                          agent.id === openedThread.agentId && agent.enabled,
                      )?.grantedScopes || []
                    }
                    key={`${workspaceOwner}:${openedThread.id}`}
                    onPreserveDraftForAccess={draft => {
                      if (workspaceOwnerRef.current !== workspaceOwner) return;
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
                    initialReplyToMessageId={
                      hasButlerDraft ? undefined : accessDraft?.replyToMessageId
                    }
                    initialButlerContextReset={
                      hasButlerDraft
                        ? Boolean(
                            butlerReferences.length &&
                              pendingButlerClarification(openedThread),
                          )
                        : accessDraft?.butlerContextReset
                    }
                    onInitialDraftConsumed={() => {
                      if (workspaceOwnerRef.current !== workspaceOwner) return;
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
                      setButlerDraftOwner('');
                    }}
                    onRefreshThread={() =>
                      session.refreshThreadMessages(openedThread.id)
                    }
                    palette={palette}
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
                    ) =>
                      session.sendMessage(
                        openedThread.id,
                        content,
                        retryMessageId,
                        replyToMessageId,
                        contextRefs,
                        assistSource,
                        ...(butlerContextReset ? ([true] as const) : []),
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
                  style={[styles.shell, isChatRoute && appStyles.hidden]}
                  pointerEvents={isChatRoute ? 'none' : 'auto'}
                  accessibilityElementsHidden={isChatRoute}
                  importantForAccessibility={
                    isChatRoute ? 'no-hide-descendants' : 'auto'
                  }
                >
                  {lightTheme ? <PageGradient /> : null}
                  {selectedTab === 'agents' ? (
                    <MiaoTaskFeed
                      key={workspaceOwner}
                      token={session.token}
                      active={
                        !modalRoute &&
                        !requestComposerOpen &&
                        !miaoTask &&
                        !agentWorkspace &&
                        !isPostComposerOpen
                      }
                      palette={palette}
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
                    />
                  ) : null}
                  {selectedTab === 'messages' && secondFloorOpen ? (
                    <SecondFloorScreen
                      active={
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
                        setSecondFloorOpen(false);
                        setSelectedMessageTab('notice');
                      }}
                      onOpenWorkspace={workspace => {
                        if (workspaceOwnerRef.current !== workspaceOwner)
                          return;
                        setSelectedWorkspace({
                          owner: workspaceOwner,
                          workspace,
                        });
                      }}
                    />
                  ) : null}
                  {selectedTab === 'messages' && !secondFloorOpen ? (
                    <View style={appStyles.retained}>
                      <MessagesScreen
                        token={session.token}
                        active={!modalRoute && !isPostComposerOpen}
                        onOpenTask={openTask}
                        onOpenSecondFloor={() => setSecondFloorOpen(true)}
                        palette={palette}
                        language={session.language}
                        threads={session.threads}
                        agents={session.agents}
                        notices={session.notices}
                        unreadNoticeCount={session.unreadNoticeCount}
                        selectedMessageTab={selectedMessageTab}
                        renderUserAvatar={renderUserAvatar}
                        onOpenThread={openThread}
                        onOpenMessageActions={() =>
                          setModalRoute('message-actions')
                        }
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
                        onOpenLocation={() => setModalRoute('station-location')}
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
                    <Animated.View
                      testID="root-navigation"
                      onLayout={event =>
                        setNavigationHeight(event.nativeEvent.layout.height)
                      }
                      style={{
                        opacity: navigationHideProgress,
                        transform: [
                          {
                            translateY: navigationHideProgress.interpolate({
                              inputRange: [0, 1],
                              outputRange: [34, 0],
                            }),
                          },
                        ],
                      }}
                      pointerEvents={miaoVoiceExpanded ? 'none' : 'auto'}
                      accessibilityElementsHidden={miaoVoiceExpanded}
                      importantForAccessibility={
                        miaoVoiceExpanded ? 'no-hide-descendants' : 'auto'
                      }
                    >
                      <BottomBar
                        palette={palette}
                        language={session.language}
                        selectedTab={selectedTab}
                        onSelectTab={tab => {
                          setSecondFloorOpen(false);
                          setSelectedTab(tab);
                        }}
                      />
                    </Animated.View>
                  ) : null}
                  {selectedTab === 'messages' && !secondFloorOpen ? (
                    <VoiceShortcutDock
                      key={`assistant:${workspaceOwner}`}
                      active={
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
                      onOpenButler={transcript => {
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
                        if (!continueRequestWithButler(message)) {
                          if (!selectedRequest)
                            setRequestContext({ owner: workspaceOwner, scene });
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
                      { backgroundColor: workspacePalette(palette).background },
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
                        workspace={agentWorkspace}
                        agents={session.agents}
                        palette={palette}
                        language={session.language}
                        onClose={closeWorkspace}
                        onManageAgents={openAgentManagement}
                        onNewTask={workspace => {
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
              palette={palette}
              session={session}
              profileFlows={profileFlows}
              searchQuery={searchQuery}
              renderUserAvatar={renderUserAvatar}
              onCloseModal={() => setModalRoute(null)}
              onNavigateModal={setModalRoute}
              onOpenThread={openThread}
              onSearchQueryChange={setSearchQuery}
              onOpenFriendThread={openFriendThread}
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
                <View style={[styles.toast, { backgroundColor: palette.text }]}>
                  <Text
                    style={[styles.toastText, { color: palette.background }]}
                  >
                    {toastMessage}
                  </Text>
                </View>
              </View>
            ) : null}
            {showLaunchAnimation ? (
              <LaunchAnimation palette={palette} language={session.language} />
            ) : null}
          </AIAssistProvider>
        </SafeAreaView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default App;

const appStyles = StyleSheet.create({
  hidden: { display: 'none' },
  retained: { flex: 1 },
});
