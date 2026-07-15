import React from 'react';
import { Modal, View } from 'react-native';
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context';
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
import { SettingsScreen } from '../features/settings/SettingsScreen';
import { SiteBuilderScreen } from '../features/site/SiteBuilderScreen';
import { StationLocationScreen } from '../features/station/StationLocationScreen';
import { AvatarConfigDTO } from '../models/api';
import { textFor } from '../shared/i18n';
import { styles } from '../shared/styles';
import { Palette } from '../shared/theme';
import { Header } from '../shared/ui';
import { resolveMessagePalette } from '../features/messages/messagePalette';
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
  palette: Palette;
  session: SessionState;
  profileFlows: ProfileFlows;
  searchQuery: string;
  renderUserAvatar: RenderUserAvatar;
  onCloseModal: () => void;
  onOpenThread: (thread: ChatThread) => void;
  onSearchQueryChange: (query: string) => void;
  onOpenFriendThread: (friendUserId: string) => void;
  onRequestMessageQRCodeScan: () => void;
  onConsumePendingScanRequest: () => void;
  onToast: (message: string) => void;
};

export function AppModals({
  modalRoute,
  palette,
  session,
  profileFlows,
  searchQuery,
  renderUserAvatar,
  onCloseModal,
  onOpenThread,
  onSearchQueryChange,
  onOpenFriendThread,
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
  const searchPalette = resolveMessagePalette(palette);

  return (
    <>
      <Modal
        visible={modalRoute === 'site-builder'}
        animationType="slide"
        presentationStyle="pageSheet"
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          <SiteBuilderScreen
            palette={palette}
            language={session.language}
            onBack={onCloseModal}
          />
        </SafeAreaView>
      </Modal>

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
            onBack={onCloseModal}
            onSetLanguage={session.setLanguage}
            onSetAppearance={session.setAppearance}
            onUpdateProfileVisibility={session.updateProfileVisibility}
            onActionError={onToast}
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
        visible={modalRoute === 'message-actions'}
        animationType="fade"
        transparent
        onDismiss={onConsumePendingScanRequest}
      >
        <MessageActionSheet
          palette={palette}
          language={session.language}
          onBack={onCloseModal}
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
            edges={['top', 'bottom']}
            style={[
              styles.safeArea,
              { backgroundColor: searchPalette.soft },
            ]}
          >
            <SearchScreen
              palette={searchPalette}
              language={session.language}
              query={searchQuery}
              threads={session.threads}
              agents={session.agents}
              friends={session.relationships.friends}
              searchHistory={session.searchHistory}
              renderUserAvatar={renderUserAvatar}
              onBack={onCloseModal}
              onChangeQuery={onSearchQueryChange}
              onOpenThread={onOpenThread}
              onOpenFriend={onOpenFriendThread}
              onSaveSearch={session.saveSearchQuery}
              onClearSearchHistory={session.clearSearchHistory}
            />
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
