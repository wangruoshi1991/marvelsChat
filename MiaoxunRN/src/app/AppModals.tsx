import React from 'react';
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
import { useProfileFlows } from '../features/profile/useProfileFlows';
import { QRCodeSheet } from '../features/qr/QRCodeSheet';
import { SearchScreen } from '../features/search/SearchScreen';
import { DeleteAccountSheet } from '../features/settings/DeleteAccountSheet';
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { StationLocationScreen } from '../features/station/StationLocationScreen';
import { StationProfileEditScreen } from '../features/station/StationProfileEditScreen';
import { AvatarConfigDTO } from '../models/api';
import { textFor } from '../shared/i18n';
import { styles } from '../shared/styles';
import { Palette } from '../shared/theme';
import { Header } from '../shared/ui';
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
  onOpenFriendThread: (friendUserId: string) => void;
  onStartChat: () => void;
  onCreateGroup: () => void;
  onRequestMessageQRCodeScan: () => void;
  onConsumePendingScanRequest: () => void;
  onToast: (message: string) => void;
};

export function AppModals({
  modalRoute,
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
  if (!session.token) {
    return null;
  }

  const renderHeader = (title: string) => (
    <Header palette={palette} title={title} onBack={onCloseModal} />
  );
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
        </View>
      </Modal>

      <Modal
        visible={modalRoute === 'settings'}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <SettingsScreen
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
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'delete-account'}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <DeleteAccountSheet
            palette={palette}
            language={session.language}
            isBusy={session.isBusy}
            onBack={() => onNavigateModal('settings')}
            onDeleteAccount={async password => {
              await session.deleteAccount(password);
              onCloseModal();
              onToast(
                textFor(session.language, '账号已注销', 'Account deleted'),
              );
            }}
          />
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'station-location'}
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
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'station-profile-edit'}
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
        </SafeAreaView>
      </Modal>

      <Modal
        visible={modalRoute === 'message-actions'}
        animationType="fade"
        transparent
        onDismiss={onConsumePendingScanRequest}
      >
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
      </Modal>

      <Modal
        visible={modalRoute === 'search'}
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
            </SafeAreaView>
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>

      <Modal
        visible={modalRoute === 'public-profile'}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          {profileFlows.publicProfile ? (
            <PublicProfileScreen
              palette={palette}
              language={session.language}
              profile={profileFlows.publicProfile}
              renderUserAvatar={renderUserAvatar}
              renderHeader={renderHeader}
              onActionError={onToast}
              onOpenFriendThread={() =>
                onOpenFriendThread(profileFlows.publicProfile!.user.id)
              }
              onFollow={async () => {
                await session.followUser(profileFlows.publicProfile!.user.id);
                profileFlows.setPublicProfile(current =>
                  current
                    ? {
                        ...current,
                        relation: { ...current.relation, isFollowing: true },
                      }
                    : current,
                );
                await session.refreshBootstrap(undefined, false);
                await session.refreshRelationships();
                onToast(textFor(session.language, '已关注', 'Followed'));
              }}
              onUnfollow={async () => {
                await session.unfollowUser(profileFlows.publicProfile!.user.id);
                profileFlows.setPublicProfile(current =>
                  current
                    ? {
                        ...current,
                        relation: { ...current.relation, isFollowing: false },
                      }
                    : current,
                );
                await session.refreshBootstrap(undefined, false);
                await session.refreshRelationships();
                onToast(textFor(session.language, '已取消关注', 'Unfollowed'));
              }}
              onRequestFriend={async () => {
                const request = await session.requestFriend(
                  profileFlows.publicProfile!.user.id,
                );
                profileFlows.setPublicProfile(current =>
                  current
                    ? {
                        ...current,
                        relation: {
                          ...current.relation,
                          pendingFriendRequestId: request.id,
                        },
                      }
                    : current,
                );
                await session.refreshBootstrap(undefined, false);
                await session.refreshRelationships();
                onToast(
                  textFor(
                    session.language,
                    '好友申请已发送',
                    'Friend request sent',
                  ),
                );
              }}
              onCancelFriendRequest={async () => {
                const requestId =
                  profileFlows.publicProfile!.relation.pendingFriendRequestId;
                if (!requestId) {
                  return;
                }
                await session.cancelFriendRequest(requestId);
                profileFlows.setPublicProfile(current =>
                  current
                    ? {
                        ...current,
                        relation: {
                          ...current.relation,
                          pendingFriendRequestId: null,
                        },
                      }
                    : current,
                );
                await session.refreshBootstrap(undefined, false);
                await session.refreshRelationships();
                onToast(
                  textFor(
                    session.language,
                    '已取消好友申请',
                    'Friend request cancelled',
                  ),
                );
              }}
            />
          ) : profileFlows.isResolvingScan ? (
            <LoadingState
              palette={palette}
              message={textFor(
                session.language,
                '正在打开用户主页',
                'Opening profile',
              )}
              renderHeader={() => (
                <Header
                  palette={palette}
                  title=""
                  onBack={() => {
                    profileFlows.setIsResolvingScan(false);
                    onCloseModal();
                  }}
                />
              )}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </>
  );
}
