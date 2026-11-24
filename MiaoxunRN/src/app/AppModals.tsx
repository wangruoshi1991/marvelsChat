import React, { useLayoutEffect, useState } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { MessageActionSheet } from '../features/messages/MessageActionSheet';
import {
  ChatThread,
  useMiaoxunSession,
} from '../features/session/useMiaoxunSession';
import {
  LoadingState,
  PublicProfileScreen,
} from '../features/profile/PublicProfileScreen';
import { PublicProfilePage } from '../features/profile/PublicProfilePage';
import { useReduceMotion } from '../shared/useReduceMotion';
import { useProfileFlows } from '../features/profile/useProfileFlows';
import { QRCodeSheet } from '../features/qr/QRCodeSheet';
import { SearchScreen } from '../features/search/SearchScreen';
import { DeleteAccountSheet } from '../features/settings/DeleteAccountSheet';
import { GroupChatCreateScreen } from '../features/messages/GroupChatCreateScreen';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { StationLocationScreen } from '../features/station/StationLocationScreen';
import { StationProfileEditScreen } from '../features/station/StationProfileEditScreen';
import { AvatarConfigDTO, PublicProfileDTO } from '../models/api';
import { textFor } from '../shared/i18n';
import { styles } from '../shared/styles';
import { Palette } from '../shared/theme';
import { resolveMessagePalette } from '../features/messages/messagePalette';
import { isXunPalette, xunV3Palette } from '../shared/xunPalette';
import { ModalRoute } from './appTypes';

type SessionState = ReturnType<typeof useMiaoxunSession>;
type ProfileFlows = ReturnType<typeof useProfileFlows>;
type RenderUserAvatar = (props: {
  text: string;
  config?: AvatarConfigDTO;
  small?: boolean;
}) => React.ReactNode;

type AppModalsProps = {
  modalRoute: ModalRoute;
  voiceCallOverlay?: React.ReactNode;
  messageMenuTop?: number;
  messageMenuPullHintVisible: boolean;
  palette: Palette;
  session: SessionState;
  profileFlows: ProfileFlows;
  searchQuery: string;
  renderUserAvatar: RenderUserAvatar;
  onCloseModal: () => void;
  onNavigateModal: (route: ModalRoute) => void;
  onOpenThread: (thread: ChatThread) => void;
  onSelectTab: (tab: 'agents' | 'messages' | 'station') => void;
  onComposeWithButler: (draft?: string) => void;
  onOpenTaskInbox: () => void;
  onAssistantExpandedChange: (expanded: boolean) => void;
  onSearchQueryChange: (query: string) => void;
  onOpenFriendThread: (
    friendUserId: string,
    isProfileCurrent?: () => boolean,
  ) => Promise<void>;
  onStartChat: () => void;
  onCreateGroup: () => void;
  onRequestMessageQRCodeScan: () => void;
  onConsumePendingScanRequest: () => void;
  onToast: (message: string) => void;
};

export function AppModals({
  modalRoute,
  voiceCallOverlay,
  messageMenuTop,
  messageMenuPullHintVisible,
  palette,
  session,
  profileFlows,
  searchQuery,
  renderUserAvatar,
  onCloseModal,
  onNavigateModal,
  onOpenThread,
  onSelectTab,
  onComposeWithButler,
  onOpenTaskInbox,
  onAssistantExpandedChange,
  onSearchQueryChange,
  onOpenFriendThread,
  onStartChat,
  onCreateGroup,
  onRequestMessageQRCodeScan,
  onConsumePendingScanRequest,
  onToast,
}: AppModalsProps) {
  const reduceMotion = useReduceMotion();
  const [presentedRoute, setPresentedRoute] = useState<ModalRoute>(null);
  useLayoutEffect(() => {
    setPresentedRoute(null);
  }, [modalRoute]);
  const callOverlay = presentedRoute === modalRoute ? voiceCallOverlay : null;
  if (!session.token) {
    return null;
  }

  const profile = profileFlows.publicProfile;
  const deletionBusy =
    session.isBusy ||
    session.accountDeletionStatus === 'submitting' ||
    session.accountDeletionStatus === 'checking';
  const closeDeleteAccount = () => {
    if (!deletionBusy) onNavigateModal('settings');
  };
  const finishRelationChange = async (
    relation: Partial<PublicProfileDTO['relation']>,
    notice: string,
  ) => {
    profileFlows.updateRelation(relation);
    await session.refreshBootstrap(session.token, false);
    await session.refreshRelationships();
    if (profileFlows.isCurrentProfile()) onToast(notice);
  };
  const resolvedSearchPalette = resolveMessagePalette(palette);
  // V15's search state uses the slightly cooler #f4f6f9 canvas used by its
  // xun-v3 states; keep other message surfaces on their shared palette.
  const searchPalette = isXunPalette(resolvedSearchPalette)
    ? xunV3Palette(resolvedSearchPalette)
    : resolvedSearchPalette;

  return (
    <>
      <Modal
        visible={modalRoute === 'qr-code'}
        onShow={() => setPresentedRoute('qr-code')}
        onRequestClose={onCloseModal}
        animationType="slide"
        transparent
      >
        <View style={styles.qrModalOverlay}>
          <QRCodeSheet
            palette={palette}
            language={session.language}
            aiId={session.user?.aiId || '--'}
            payload={profileFlows.qrPayload}
            onBack={onCloseModal}
          />
          {modalRoute === 'qr-code' ? callOverlay : null}
        </View>
      </Modal>

      <Modal
        visible={modalRoute === 'settings'}
        onShow={() => setPresentedRoute('settings')}
        onRequestClose={onCloseModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <SettingsScreen
            active={modalRoute === 'settings'}
            palette={palette}
            userName={session.user?.displayName || '未登录'}
            userRole={session.user?.role || 'user'}
            language={session.language}
            appearance={session.appearance}
            profileVisibility={session.profileVisibility}
            uiPreferences={session.uiPreferences}
            onPreviewUIPreferences={session.previewUIPreferences}
            onConfirmUIPreferences={session.confirmUIPreferences}
            onResetUIPreferences={session.resetUIPreferences}
            onUndoUIPreferences={session.undoUIPreferences}
            onBack={onCloseModal}
            onSetLanguage={session.setLanguage}
            onSetAppearance={session.setAppearance}
            onUpdateProfileVisibility={session.updateProfileVisibility}
            onActionError={onToast}
            onDeleteAccount={() => onNavigateModal('delete-account')}
            onSignOut={async () => {
              try {
                await session.signOut();
                onCloseModal();
              } catch (error) {
                onToast(
                  error instanceof Error
                    ? error.message
                    : textFor(
                        session.language,
                        '退出登录失败',
                        'Logout failed',
                      ),
                );
              }
            }}
          />
          {modalRoute === 'settings' ? callOverlay : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'delete-account'}
        onShow={() => setPresentedRoute('delete-account')}
        onRequestClose={closeDeleteAccount}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <DeleteAccountSheet
            palette={palette}
            language={session.language}
            isBusy={deletionBusy}
            status={session.accountDeletionStatus}
            onBack={closeDeleteAccount}
            onRecheck={session.recheckAccountDeletion}
            onDeleteAccount={async password => {
              if (!(await session.deleteAccount(password))) return;
              onCloseModal();
              onToast(
                textFor(session.language, '账号已注销', 'Account deleted'),
              );
            }}
          />
          {modalRoute === 'delete-account' ? callOverlay : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'create-group'}
        onShow={() => setPresentedRoute('create-group')}
        onRequestClose={onCloseModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <GroupChatCreateScreen
            token={session.token}
            palette={resolveMessagePalette(palette)}
            language={session.language}
            onBack={onCloseModal}
            onActionError={onToast}
            onCreated={result => {
              onCloseModal();
              onOpenThread({ ...result.thread, messages: result.messages });
            }}
          />
          {modalRoute === 'create-group' ? callOverlay : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'station-location'}
        onShow={() => setPresentedRoute('station-location')}
        onRequestClose={onCloseModal}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <StationLocationScreen
            palette={palette}
            language={session.language}
            profile={session.profile}
            onBack={onCloseModal}
            onResolveLocation={session.resolveLocation}
            onUpdateProfile={session.updateProfile}
            onActionError={onToast}
          />
          {modalRoute === 'station-location' ? callOverlay : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'station-profile-edit'}
        onShow={() => setPresentedRoute('station-profile-edit')}
        onRequestClose={onCloseModal}
        animationType="slide"
        presentationStyle="pageSheet"
        allowSwipeDismissal={false}
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <StationProfileEditScreen
            palette={palette}
            language={session.language}
            profile={session.profile}
            onResolveLocation={session.resolveLocation}
            onBack={onCloseModal}
            onUpdateProfile={session.updateProfile}
            onActionError={onToast}
          />
          {modalRoute === 'station-profile-edit' ? callOverlay : null}
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'message-actions'}
        onShow={() => setPresentedRoute('message-actions')}
        onRequestClose={onCloseModal}
        animationType="fade"
        transparent
        onDismiss={onConsumePendingScanRequest}
      >
        <View style={styles.safeArea}>
          <MessageActionSheet
            palette={palette}
            anchorTop={messageMenuTop}
            pullHintVisible={messageMenuPullHintVisible}
            language={session.language}
            onBack={onCloseModal}
            onStartChat={onStartChat}
            onCreateGroup={onCreateGroup}
            onScanQRCode={onRequestMessageQRCodeScan}
          />
          {modalRoute === 'message-actions' ? callOverlay : null}
        </View>
      </Modal>

      <Modal
        visible={modalRoute === 'search'}
        testID="app-modal-search"
        onShow={() => setPresentedRoute('search')}
        onRequestClose={onCloseModal}
        animationType="fade"
        presentationStyle="fullScreen"
      >
        <SafeAreaProvider>
          <SafeAreaView
            edges={['top']}
            style={[
              styles.safeArea,
              // V15 keeps the status area on the same light canvas as the
              // search page; the soft role would leave a visible strip.
              { backgroundColor: searchPalette.background },
            ]}
          >
            <SafeAreaView
              edges={['bottom']}
              style={[
                styles.safeArea,
                styles.searchBottomSafeArea,
                { backgroundColor: searchPalette.surface },
              ]}
            >
              <SearchScreen
                active={modalRoute === 'search'}
                palette={searchPalette}
                language={session.language}
                query={searchQuery}
                threads={session.threads}
                agents={session.agents}
                friends={session.relationships.friends}
                searchHistory={session.searchHistory}
                renderUserAvatar={renderUserAvatar}
                onBack={onCloseModal}
                onSelectTab={tab => {
                  onCloseModal();
                  onSelectTab(tab);
                }}
                onChangeQuery={onSearchQueryChange}
                onOpenThread={onOpenThread}
                onOpenFriend={onOpenFriendThread}
                onSaveSearch={session.saveSearchQuery}
                onClearSearchHistory={session.clearSearchHistory}
                onDeleteSearchHistory={session.deleteSearchHistoryItem}
                onError={onToast}
                onComposeAssistant={draft => {
                  onCloseModal();
                  onComposeWithButler(draft);
                }}
                onOpenAssistant={draft => {
                  onCloseModal();
                  onComposeWithButler(draft);
                }}
                onOpenTasks={() => {
                  onCloseModal();
                  onOpenTaskInbox();
                }}
                onAssistantExpandedChange={onAssistantExpandedChange}
              />
              {modalRoute === 'search' ? callOverlay : null}
            </SafeAreaView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      {modalRoute === 'public-profile' ? (
        <PublicProfilePage
          voiceCallOverlay={voiceCallOverlay}
          backLabel={textFor(session.language, '返回', 'Back')}
          onBack={profileFlows.closeProfile}
          palette={palette}
          reduceMotion={reduceMotion}
          title={textFor(session.language, '用户主页', 'Profile')}
        >
          {profile ? (
            <PublicProfileScreen
              key={profile.user.id}
              palette={palette}
              language={session.language}
              profile={profile}
              renderUserAvatar={renderUserAvatar}
              onOpenFriendThread={() =>
                onOpenFriendThread(
                  profile.user.id,
                  profileFlows.isCurrentProfile,
                )
              }
              onFollow={async () => {
                await session.followUser(profile.user.id);
                await finishRelationChange(
                  { isFollowing: true },
                  textFor(session.language, '已关注', 'Followed'),
                );
              }}
              onUnfollow={async () => {
                await session.unfollowUser(profile.user.id);
                await finishRelationChange(
                  { isFollowing: false },
                  textFor(session.language, '已取消关注', 'Unfollowed'),
                );
              }}
              onRequestFriend={async () => {
                const request = await session.requestFriend(profile.user.id);
                await finishRelationChange(
                  { pendingFriendRequestId: request.id },
                  textFor(
                    session.language,
                    '好友申请已发送',
                    'Friend request sent',
                  ),
                );
              }}
              onAcceptFriendRequest={async () => {
                const requestId = profile.relation.incomingFriendRequestId;
                if (!requestId) return;
                await session.acceptFriendRequest(requestId);
                await finishRelationChange(
                  {
                    isFriend: true,
                    pendingFriendRequestId: null,
                    incomingFriendRequestId: null,
                  },
                  textFor(
                    session.language,
                    '已成为好友',
                    'You are now friends',
                  ),
                );
              }}
              onCancelFriendRequest={async () => {
                const requestId = profile.relation.pendingFriendRequestId;
                if (!requestId) {
                  return;
                }
                await session.cancelFriendRequest(requestId);
                await finishRelationChange(
                  { pendingFriendRequestId: null },
                  textFor(
                    session.language,
                    '已取消好友申请',
                    'Friend request cancelled',
                  ),
                );
              }}
            />
          ) : profileFlows.loadingProfile ? (
            <LoadingState
              palette={palette}
              message={textFor(
                session.language,
                '正在打开用户主页',
                'Opening profile',
              )}
            />
          ) : null}
        </PublicProfilePage>
      ) : null}
    </>
  );
}
