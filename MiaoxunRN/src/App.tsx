import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { AppModals } from './app/AppModals';
import { ModalRoute } from './app/appTypes';
import { LaunchAnimation } from './app/LaunchAnimation';
import { RestoreErrorScreen } from './app/RestoreErrorScreen';
import { useButlerActions } from './app/useButlerActions';
import {
  ChatThread,
  useMiaoxunSession,
} from './features/session/useMiaoxunSession';
import { AuthScreen } from './features/auth/AuthScreen';
import { UserAvatar } from './features/avatar/AvatarBadges';
import {
  ChatScreen,
  MessageTab,
  MessagesScreen,
} from './features/messages/MessagesScreen';
import { resolveMessagePalette } from './features/messages/messagePalette';
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
import { AIAssistObjectReference } from './features/assist/aiAssistTypes';

function App(): React.JSX.Element {
  const session = useMiaoxunSession();
  const palette = palettes[session.appearance];
  const messagePalette = resolveMessagePalette(palette);
  const [selectedTab, setSelectedTab] = useState<RootTab>('messages');
  const [selectedStationTab, setSelectedStationTab] =
    useState<StationTab>('station');
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
  useEffect(() => {
    if (selectedTab === 'station') setStationVisited(true);
  }, [selectedTab]);
  useEffect(() => {
    setStationVisited(false);
    setButlerDraft('');
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

  const { sendButlerMessage } = useButlerActions({
    session,
    setSelectedTab,
    setSelectedMessageTab,
    setSelectedStationTab,
    setModalRoute,
    setSearchQuery,
    openQRCode: profileFlows.openQRCode,
  });

  const askButler = useCallback(
    (object: AIAssistObjectReference) => {
      const thread = session.threads.find(
        item => item.agentId === 'miaoxun-butler',
      );
      if (!thread) {
        showToast(
          textFor(
            session.language,
            '妙管家会话不可用，请先添加妙管家。',
            'Add the butler before opening its chat.',
          ),
        );
        return;
      }
      const content =
        typeof object.metadata?.content === 'string'
          ? object.metadata.content
          : '';
      setButlerDraft(
        [
          textFor(
            session.language,
            `请帮我分析「${object.title}」：`,
            `Help me with “${object.title}”:`,
          ),
          content,
          object.id ? `${object.kind}: ${object.id}` : '',
          object.kind === 'avatar-3d'
            ? textFor(
                session.language,
                '这是一条形象记录引用，请先给我建议，不要直接生成或修改。',
                'This is an avatar reference. Suggest next steps before generating or changing anything.',
              )
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      );
      openThread(thread);
    },
    [openThread, session.language, session.threads, showToast],
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
  const topSafeAreaColor = isChatRoute
    ? messagePalette.background
    : isRootTabRoute && selectedTab === 'messages'
    ? messagePalette.soft
    : isRootTabRoute &&
      selectedTab === 'station' &&
      session.appearance === 'light'
    ? '#FFFFFF'
    : palette.background;
  const bottomSafeAreaColor = isChatRoute
    ? messagePalette.surface
    : isRootTabRoute
    ? session.appearance === 'light'
      ? '#FFFFFF'
      : palette.surface
    : palette.background;

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
            routeKey={`${
              session.user?.id || ''
            }:${selectedTab}:${selectedStationTab}:${
              modalRoute || ''
            }:${isPostComposerOpen}`}
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
                    key={openedThread.id}
                    initialDraft={
                      openedThread.agentId === 'miaoxun-butler'
                        ? butlerDraft
                        : undefined
                    }
                    onInitialDraftConsumed={() => setButlerDraft('')}
                    palette={palette}
                    language={session.language}
                    currentUserId={session.user?.id || ''}
                    currentUserName={session.user?.displayName || ''}
                    currentUserAvatarConfig={session.profile.avatarConfig}
                    thread={openedThread}
                    agents={session.agents}
                    renderUserAvatar={renderUserAvatar}
                    onBack={closeThread}
                    onSend={
                      openedThread.agentId === 'miaoxun-butler'
                        ? (content, retryMessageId, replyToMessageId) =>
                            sendButlerMessage(
                              openedThread.id,
                              content,
                              retryMessageId,
                              replyToMessageId,
                            )
                        : (content, retryMessageId, replyToMessageId) =>
                            session.sendMessage(
                              openedThread.id,
                              content,
                              undefined,
                              retryMessageId,
                              replyToMessageId,
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
                  {selectedTab === 'messages' ? (
                    <MessagesScreen
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
                          !isPostComposerOpen
                        }
                        palette={palette}
                        language={session.language}
                        session={session}
                        selectedStationTab={selectedStationTab}
                        onSelectStationTab={setSelectedStationTab}
                        renderUserAvatar={renderUserAvatar}
                        onOpenSettings={() => setModalRoute('settings')}
                        onOpenLocation={() => setModalRoute('station-location')}
                        onOpenProfileEdit={() =>
                          setModalRoute('station-profile-edit')
                        }
                        onCopyAIID={copyAIID}
                        onOpenQRCode={profileFlows.openQRCode}
                        onOpenFriendThread={openFriendThread}
                        onOpenAgentThread={openAgentThread}
                        onOpenPostComposer={() => setIsPostComposerOpen(true)}
                        onOpenPublicProfileByAiId={
                          profileFlows.openPublicProfileByAiId
                        }
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

                  <BottomBar
                    palette={palette}
                    language={session.language}
                    selectedTab={selectedTab}
                    onSelectTab={setSelectedTab}
                  />
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
