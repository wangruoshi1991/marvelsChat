import React, { useState } from 'react';
import { Alert, Modal, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  pickStationPhotoFromLibrary,
  takeStationPhoto,
} from '../../services/stationMediaPicker';
import { displayLocationText, displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { MiaoPointsScreen } from './MiaoPointsScreen';
import {
  StationContentManageSheet,
  StationManageTarget,
} from './StationContentManageSheet';
import { StationCreatePayload, StationCreateSheet } from './StationCreateSheet';
import { StationProfileHeader, StationTabs } from './StationHeader';
import { StationPanel } from './StationPanels';
import { stationModuleStatusText } from './stationModuleStatus';
import { StationCreateKind, StationTab } from './stationTypes';

export function StationScreen({
  palette,
  language,
  session,
  selectedStationTab,
  onSelectStationTab,
  renderUserAvatar,
  onOpenSettings,
  onOpenLocation,
  onCopyAIID,
  onOpenQRCode,
  onOpenFriendThread,
  onOpenAgentThread,
  onOpenPublicProfileByAiId,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  selectedStationTab: StationTab;
  onSelectStationTab: (tab: StationTab) => void;
  renderUserAvatar: UserAvatarRenderer;
  onOpenSettings: () => void;
  onOpenLocation: () => void;
  onCopyAIID: () => void;
  onOpenQRCode: () => void;
  onOpenFriendThread: (friendUserId: string) => void;
  onOpenAgentThread: (agentId: string) => void;
  onOpenPublicProfileByAiId: (aiId: string) => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [isPointsOpen, setIsPointsOpen] = useState(false);
  const [createKind, setCreateKind] = useState<StationCreateKind | null>(null);
  const [manageTarget, setManageTarget] = useState<StationManageTarget | null>(
    null,
  );
  const [isCreatingStationContent, setIsCreatingStationContent] =
    useState(false);

  const createStationContent = async (payload: StationCreatePayload) => {
    if (isCreatingStationContent) {
      return;
    }
    setIsCreatingStationContent(true);
    try {
      if (payload.kind === 'diary') {
        await session.createStationDiary({
          title: payload.title,
          body: payload.body,
          mood: payload.mood,
          visibility: payload.visibility,
        });
        onActionMessage(textFor(language, '日记已保存', 'Diary saved'));
      } else if (payload.kind === 'album') {
        await session.createStationAlbum({
          title: payload.title,
          description: payload.description,
          visibility: payload.visibility,
        });
        onActionMessage(textFor(language, '相册已创建', 'Album created'));
      } else {
        await session.createStationOutfit({
          title: payload.title,
          note: payload.note,
          visibility: payload.visibility,
        });
        onActionMessage(textFor(language, '穿搭已保存', 'Outfit saved'));
      }
      onSelectStationTab('station');
      setCreateKind(null);
    } catch (error) {
      onActionError(error);
    } finally {
      setIsCreatingStationContent(false);
    }
  };

  const registerAlbumPhoto = async (
    albumId: string,
    source: 'camera' | 'library',
  ) => {
    try {
      const media =
        source === 'camera'
          ? await takeStationPhoto()
          : await pickStationPhotoFromLibrary();
      if (!media) {
        return;
      }
      await session.createStationMediaAsset({
        albumId,
        kind: 'image',
        originalFilename: media.originalFilename,
        mimeType: media.mimeType,
        byteSize: media.byteSize,
        width: media.width,
        height: media.height,
        localMedia: media,
      });
      onActionMessage(textFor(language, '照片已上传', 'Photo uploaded'));
    } catch (error) {
      onActionError(error);
    }
  };

  const openAlbumMediaPicker = (albumId: string) => {
    Alert.alert(
      textFor(language, '添加照片', 'Add Photo'),
      textFor(language, '选择照片来源', 'Choose a source'),
      [
        {
          text: textFor(language, '拍照', 'Camera'),
          onPress: () => {
            registerAlbumPhoto(albumId, 'camera').catch(onActionError);
          },
        },
        {
          text: textFor(language, '从相册选择', 'Photo Library'),
          onPress: () => {
            registerAlbumPhoto(albumId, 'library').catch(onActionError);
          },
        },
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
      ],
    );
  };

  const openDiaryDetail = (entryId: string) => {
    setManageTarget({ kind: 'diary', id: entryId });
  };

  const openAlbumDetail = (albumId: string) => {
    setManageTarget({ kind: 'album', id: albumId });
  };

  const isDark = session.appearance === 'dark';
  const stationBackgroundColor = isDark ? palette.background : '#F8F7FD';
  const stationSurfaceColor = isDark ? palette.surface : '#FFFFFF';
  const stationBorderColor = isDark ? palette.border : '#F0EBFD';

  // Presence stays in the session model; its station entry awaits a final design location.

  return (
    <View style={[styles.screen, { backgroundColor: stationBackgroundColor }]}>
      <ScrollView
        stickyHeaderIndices={[1]}
        contentContainerStyle={styles.stationScrollContent}
      >
        <View
          style={[
            styles.stationTopContent,
            { backgroundColor: stationSurfaceColor },
          ]}
        >
          <StationProfileHeader
            palette={palette}
            language={language}
            isDark={isDark}
            nickname={displayText(language, session.profile.nickname)}
            aiId={session.user?.aiId || '--'}
            avatarText={session.profile.avatarText}
            avatarConfig={session.profile.avatarConfig}
            followingCount={session.profile.followingCount}
            followersCount={session.profile.followersCount}
            likesCount={session.profile.likesCount}
            collectionsCount={session.profile.collectionsCount}
            miaoPoints={session.profile.miaoPoints}
            community={
              displayLocationText(language, session.profile.community) ||
              textFor(language, '未设置', 'Not set')
            }
            activityArea={
              displayLocationText(language, session.profile.activityArea) ||
              textFor(language, '未设置', 'Not set')
            }
            renderUserAvatar={renderUserAvatar}
            onCopyAIID={onCopyAIID}
            onShowQRCode={onOpenQRCode}
            onOpenSettings={onOpenSettings}
            onOpenPoints={() => setIsPointsOpen(true)}
            onOpenLocation={onOpenLocation}
            onOpenSocial={() => onSelectStationTab('social')}
          />
        </View>

        <View
          style={[
            styles.stationTabHeader,
            {
              backgroundColor: stationSurfaceColor,
              borderBottomColor: stationBorderColor,
            },
          ]}
        >
          <StationTabs
            palette={palette}
            language={language}
            isDark={isDark}
            value={selectedStationTab}
            onChange={onSelectStationTab}
          />
        </View>

        <View style={styles.stationPanelWrap}>
          <StationPanel
            palette={palette}
            language={language}
            selectedTab={selectedStationTab}
            token={session.token}
            profile={session.profile}
            relationships={session.relationships}
            stationContent={session.stationContent}
            agents={session.agents}
            agentReadiness={session.agentReadiness}
            ownedAgents={session.ownedAgents}
            moduleStatus={key =>
              stationModuleStatusText(language, key, session.modules[key])
            }
            onOpenFriendThread={onOpenFriendThread}
            onOpenAgentThread={onOpenAgentThread}
            onSetAgentEnabled={session.setAgentEnabled}
            onOpenPublicProfileByAiId={onOpenPublicProfileByAiId}
            onSelectStationTab={onSelectStationTab}
            onOpenCreateSheet={setCreateKind}
            onOpenDiaryDetail={openDiaryDetail}
            onOpenAlbumDetail={openAlbumDetail}
            onDeletePost={session.deleteStationPost}
            onCreateSiteDraft={session.createStationSiteDraft}
            onApplySiteDraft={session.applyStationSiteDraft}
            onCreateModelJob={session.createStationModelJob}
            onSyncModelJob={session.syncStationModelJob}
            onLoadAlbumSuggestions={session.listStationAlbumSuggestions}
            onApplyAlbumSuggestion={session.applyStationAlbumSuggestion}
            onCreateFileAsset={session.createStationFileAsset}
            onPreprocessFileAsset={session.preprocessStationFileAsset}
            onCreateVideoDraft={session.createStationVideoDraft}
            onActionMessage={onActionMessage}
            onActionError={onActionError}
          />
        </View>
      </ScrollView>
      <Modal
        animationType="slide"
        presentationStyle="fullScreen"
        visible={isPointsOpen}
        onRequestClose={() => setIsPointsOpen(false)}
      >
        <SafeAreaProvider>
          <SafeAreaView
            edges={['top', 'bottom']}
            style={[styles.safeArea, { backgroundColor: stationSurfaceColor }]}
          >
            <MiaoPointsScreen
              palette={palette}
              language={language}
              isDark={isDark}
              miaoPoints={session.profile.miaoPoints}
              onBack={() => setIsPointsOpen(false)}
              onLoadEntries={session.listMiaoPointLedger}
            />
          </SafeAreaView>
        </SafeAreaProvider>
      </Modal>
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={createKind !== null}
        onRequestClose={() => setCreateKind(null)}
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          {createKind ? (
            <StationCreateSheet
              kind={createKind}
              palette={palette}
              language={language}
              isSaving={isCreatingStationContent}
              onBack={() => setCreateKind(null)}
              onSubmit={createStationContent}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
      <Modal
        animationType="slide"
        presentationStyle="pageSheet"
        visible={manageTarget !== null}
        onRequestClose={() => setManageTarget(null)}
      >
        <SafeAreaView
          style={[styles.safeArea, { backgroundColor: palette.background }]}
        >
          {manageTarget ? (
            <StationContentManageSheet
              target={manageTarget}
              palette={palette}
              language={language}
              token={session.token}
              stationContent={session.stationContent}
              session={session}
              onAddAlbumMedia={openAlbumMediaPicker}
              onBack={() => setManageTarget(null)}
              onActionMessage={onActionMessage}
              onActionError={onActionError}
            />
          ) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
