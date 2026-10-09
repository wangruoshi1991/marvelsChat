import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Modal, ScrollView, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  pickStationPhotoFromLibrary,
  takeStationPhoto,
} from '../../services/stationMediaPicker';
import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { useAIAssist } from '../assist/AIAssistProvider';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { MiaoPointsScreen } from './MiaoPointsScreen';
import { Avatar3DCreateScreen } from './Avatar3DCreateScreen';
import { StationContentManageSheet } from './StationContentManageSheet';
import { StationContentListScreen } from './StationContentListScreen';
import { StationCreateSheet } from './StationCreateSheet';
import type { StationCreatePayload } from './StationCreateSheet';
import { StationProfileHeader, StationTabs } from './StationHeader';
import { StationPageHeading } from './StationPageHeading';
import { StationPanel } from './StationPanels';
import { stationModuleStatusText } from './stationModuleStatus';
import { resolveStationColors } from './stationTheme';
import type {
  StationContentListKind,
  StationCreateKind,
  StationManageTarget,
  StationTab,
} from './stationTypes';
import { useAvatar3d } from './useAvatar3d';
import { supportsMediaRetrieval } from '../../services/appFeatures';
import { StationMediaRetrievalWorkspace } from './StationMediaRetrievalWorkspace';

export function StationScreen({
  active = true,
  palette,
  language,
  session,
  selectedStationTab,
  onSelectStationTab,
  renderUserAvatar,
  onOpenSettings,
  onOpenLocation,
  onOpenProfileEdit,
  onCopyAIID,
  onOpenQRCode,
  onOpenFriendThread,
  onOpenAgentThread,
  onOpenPostComposer,
  onOpenPublicProfileByAiId,
  onActionMessage,
  onActionError,
}: {
  active?: boolean;
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  selectedStationTab: StationTab;
  onSelectStationTab: (tab: StationTab) => void;
  renderUserAvatar: UserAvatarRenderer;
  onOpenSettings: () => void;
  onOpenLocation: () => void;
  onOpenProfileEdit?: () => void;
  onCopyAIID: () => void;
  onOpenQRCode: () => void;
  onOpenFriendThread: (friendUserId: string) => void;
  onOpenAgentThread: (agentId: string) => void;
  onOpenPostComposer: () => void;
  onOpenPublicProfileByAiId: (aiId: string) => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const { isActive: isAssistActive } = useAIAssist();
  const onActionErrorRef = useRef(onActionError);
  onActionErrorRef.current = onActionError;
  const refreshRelationships = session.refreshRelationships;
  useEffect(() => {
    if (active && selectedStationTab === 'social') {
      refreshRelationships().catch(error => onActionErrorRef.current(error));
    }
  }, [active, refreshRelationships, selectedStationTab]);
  const [isPointsOpen, setIsPointsOpen] = useState(false);
  const [isAvatar3dOpen, setIsAvatar3dOpen] = useState(false);
  const [isMediaRetrievalOpen, setIsMediaRetrievalOpen] = useState(false);
  const [createKind, setCreateKind] = useState<StationCreateKind | null>(null);
  const [contentListKind, setContentListKind] =
    useState<StationContentListKind | null>(null);
  const [contentListDetail, setContentListDetail] = useState<
    | {
        type: 'create';
        kind: StationCreateKind;
        returnTo: 'home' | 'list';
      }
    | {
        type: 'detail';
        target: StationManageTarget;
        returnTo: 'home' | 'list';
      }
    | {
        type: 'edit';
        target: StationManageTarget;
        returnTo: 'home' | 'list';
        backTo: 'detail' | 'list';
      }
    | null
  >(null);
  const [isCreatingStationContent, setIsCreatingStationContent] =
    useState(false);
  const [createProgressText, setCreateProgressText] = useState('');
  const [selectedAvatar3dModelId, setSelectedAvatar3dModelId] = useState<
    string | null
  >(null);
  const avatar3d = useAvatar3d(session.token, active && !isAvatar3dOpen);
  const refreshAvatar3d = avatar3d.refresh;

  const openAvatar3d = useCallback(() => {
    if (avatar3d.status !== 'ready') {
      onActionMessage(
        avatar3d.errorMessage ||
          textFor(
            language,
            '3D建模服务当前不可用',
            '3D service is unavailable',
          ),
      );
      return;
    }
    setIsAvatar3dOpen(true);
  }, [avatar3d.errorMessage, avatar3d.status, language, onActionMessage]);

  const closeAvatar3d = useCallback(() => {
    setIsAvatar3dOpen(false);
    refreshAvatar3d().catch(() => undefined);
  }, [refreshAvatar3d]);

  const handleAvatar3dChanged = useCallback(() => {
    refreshAvatar3d().catch(() => undefined);
  }, [refreshAvatar3d]);

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
        const album = await session.createStationAlbum({
          title: payload.title,
          description: payload.description,
          visibility: payload.visibility,
        });
        try {
          for (let index = 0; index < payload.media.length; index += 1) {
            const media = payload.media[index];
            setCreateProgressText(`${index + 1}/${payload.media.length}`);
            await session.createStationMediaAsset({
              albumId: album.id,
              kind: 'image',
              originalFilename: media.originalFilename,
              mimeType: media.mimeType,
              byteSize: media.byteSize,
              width: media.width,
              height: media.height,
              localMedia: media,
            });
          }
        } catch (error) {
          await session.deleteStationAlbum(album.id);
          throw error;
        }
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
      return true;
    } catch (error) {
      onActionError(error);
      return false;
    } finally {
      setIsCreatingStationContent(false);
      setCreateProgressText('');
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

  const openStationCreate = (kind: StationCreateKind) => {
    if (kind === 'outfit') {
      setCreateKind(kind);
      return;
    }
    setContentListKind(kind);
    setContentListDetail({ type: 'create', kind, returnTo: 'home' });
  };

  const openDiaryDetail = (entryId: string) => {
    setContentListKind('diary');
    setContentListDetail({
      type: 'detail',
      target: { kind: 'diary', id: entryId },
      returnTo: 'home',
    });
  };

  const openAlbumDetail = (albumId: string) => {
    setContentListKind('album');
    setContentListDetail({
      type: 'detail',
      target: { kind: 'album', id: albumId },
      returnTo: 'home',
    });
  };

  const closeContentDetail = () => {
    if (!contentListDetail) {
      setContentListKind(null);
      return;
    }
    if (contentListDetail.type === 'edit') {
      setContentListDetail(
        contentListDetail.backTo === 'detail'
          ? {
              type: 'detail',
              target: contentListDetail.target,
              returnTo: contentListDetail.returnTo,
            }
          : null,
      );
      return;
    }
    if (contentListDetail.returnTo === 'home') {
      setContentListDetail(null);
      setContentListKind(null);
      return;
    }
    setContentListDetail(null);
  };

  const closeDeletedContent = () => {
    if (contentListDetail?.returnTo === 'home') {
      setContentListKind(null);
    }
    setContentListDetail(null);
  };

  const isDark = session.appearance === 'dark';
  const stationColors = resolveStationColors(palette);
  const isPanelActive =
    active &&
    !isAvatar3dOpen &&
    !isPointsOpen &&
    contentListKind === null &&
    createKind === null;

  // Presence stays in the session model; its station entry awaits a final design location.

  return (
    <View
      style={[styles.screen, { backgroundColor: stationColors.background }]}
    >
      <View
        style={[
          styles.stationTabHeader,
          {
            backgroundColor: stationColors.surface,
            borderBottomColor: stationColors.border,
          },
        ]}
      >
        <StationTabs
          palette={palette}
          language={language}
          value={selectedStationTab}
          onChange={onSelectStationTab}
          onOpenSettings={onOpenSettings}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.stationScrollContent}
        scrollEnabled={!isAssistActive}
        style={styles.stationPanelScroll}
        testID={`station-panel-scroll-${selectedStationTab}`}
      >
        {selectedStationTab === 'station' ? (
          <View
            style={[
              styles.stationTopContent,
              { backgroundColor: stationColors.background },
            ]}
          >
            <StationPageHeading
              detail={textFor(language, '个人数字身份', 'Digital identity')}
              palette={palette}
              title={textFor(language, '第一面', 'Front')}
              watermark="PERSONA"
            />
            <StationProfileHeader
              palette={palette}
              language={language}
              nickname={displayText(language, session.profile.nickname)}
              aiId={session.user?.aiId || '--'}
              avatarText={session.profile.avatarText}
              avatarConfig={session.profile.avatarConfig}
              bio={displayText(language, session.profile.bio)}
              identity={session.profile}
              presenceStatus={
                session.user?.presenceMode === 'online' ? 'online' : 'offline'
              }
              followingCount={session.profile.followingCount}
              followersCount={session.profile.followersCount}
              likesCount={session.profile.likesCount}
              collectionsCount={session.profile.collectionsCount}
              renderUserAvatar={renderUserAvatar}
              onCopyAIID={onCopyAIID}
              onShowQRCode={onOpenQRCode}
              onOpenProfileEdit={onOpenProfileEdit || (() => undefined)}
              onOpenSocial={() => onSelectStationTab('social')}
            />
          </View>
        ) : null}

        <View collapsable={false} style={styles.stationPanelWrap}>
          <StationPanel
            active={isPanelActive}
            palette={palette}
            language={language}
            selectedTab={selectedStationTab}
            token={session.token}
            profile={session.profile}
            renderUserAvatar={renderUserAvatar}
            relationships={session.relationships}
            stationContent={session.stationContent}
            avatar3d={avatar3d.bootstrap}
            avatar3dStatus={avatar3d.status}
            avatar3dError={avatar3d.errorMessage}
            selectedAvatar3dModelId={selectedAvatar3dModelId}
            agents={session.agents}
            agentReadiness={session.agentReadiness}
            ownedAgents={session.ownedAgents}
            moduleStatus={key =>
              stationModuleStatusText(language, key, session.modules[key])
            }
            onOpenFriendThread={onOpenFriendThread}
            onOpenAgentThread={onOpenAgentThread}
            onOpenPostComposer={onOpenPostComposer}
            onOpenContentList={setContentListKind}
            onOpenMediaRetrieval={
              supportsMediaRetrieval()
                ? () => setIsMediaRetrievalOpen(true)
                : undefined
            }
            onSetAgentEnabled={session.setAgentEnabled}
            onOpenPublicProfileByAiId={onOpenPublicProfileByAiId}
            onSelectStationTab={onSelectStationTab}
            onOpenCreateSheet={openStationCreate}
            onOpenDiaryDetail={openDiaryDetail}
            onOpenAlbumDetail={openAlbumDetail}
            onDeletePost={session.deleteStationPost}
            onSetStationPostInteraction={session.setStationPostInteraction}
            onCreateSiteDraft={session.createStationSiteDraft}
            onApplySiteDraft={session.applyStationSiteDraft}
            onOpenAvatar3d={openAvatar3d}
            onLoadAlbumSuggestions={session.listStationAlbumSuggestions}
            onApplyAlbumSuggestion={session.applyStationAlbumSuggestion}
            onCreateFileAsset={session.createStationFileAsset}
            onPreprocessFileAsset={session.preprocessStationFileAsset}
            onCreateVideoDraft={session.createStationVideoDraft}
            onActionMessage={onActionMessage}
            onActionError={onActionError}
            onOpenPoints={() => setIsPointsOpen(true)}
            onOpenLocation={onOpenLocation}
          />
        </View>
      </ScrollView>
      {isAvatar3dOpen ? (
        <Modal
          animationType="slide"
          presentationStyle="fullScreen"
          visible
          onRequestClose={closeAvatar3d}
        >
          <SafeAreaProvider>
            <SafeAreaView
              edges={['top', 'bottom']}
              style={[
                styles.safeArea,
                { backgroundColor: stationColors.surface },
              ]}
            >
              <Avatar3DCreateScreen
                initialBootstrap={avatar3d.bootstrap}
                language={language}
                onBack={closeAvatar3d}
                onChanged={handleAvatar3dChanged}
                onSelectModel={modelId => {
                  setSelectedAvatar3dModelId(modelId);
                  closeAvatar3d();
                }}
                palette={palette}
                token={session.token}
              />
            </SafeAreaView>
          </SafeAreaProvider>
        </Modal>
      ) : null}
      <Modal
        animationType="slide"
        presentationStyle="fullScreen"
        visible={isPointsOpen}
        onRequestClose={() => setIsPointsOpen(false)}
      >
        <SafeAreaProvider>
          <SafeAreaView
            edges={['top', 'bottom']}
            style={[
              styles.safeArea,
              { backgroundColor: stationColors.surface },
            ]}
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
        animationType="fade"
        presentationStyle="fullScreen"
        visible={contentListKind !== null || isMediaRetrievalOpen}
        onRequestClose={() =>
          isMediaRetrievalOpen
            ? setIsMediaRetrievalOpen(false)
            : closeContentDetail()
        }
      >
        <SafeAreaProvider>
          <SafeAreaView
            edges={['top', 'bottom']}
            style={[
              styles.safeArea,
              { backgroundColor: stationColors.surface },
            ]}
          >
            {isMediaRetrievalOpen ? (
              <StationMediaRetrievalWorkspace
                key={session.user?.id}
                userId={session.user!.id}
                token={session.token}
                palette={palette}
                language={language}
                agents={session.agents}
                agentReadiness={session.agentReadiness}
                onClose={() => setIsMediaRetrievalOpen(false)}
              />
            ) : contentListDetail?.type === 'create' ? (
              <StationCreateSheet
                kind={contentListDetail.kind}
                fullScreen
                palette={palette}
                language={language}
                isSaving={isCreatingStationContent}
                progressText={createProgressText}
                onBack={closeContentDetail}
                onActionError={onActionError}
                onSubmit={async payload => {
                  if (await createStationContent(payload)) {
                    closeContentDetail();
                  }
                }}
              />
            ) : contentListDetail?.type === 'edit' ? (
              <StationContentManageSheet
                target={contentListDetail.target}
                palette={palette}
                language={language}
                token={session.token}
                stationContent={session.stationContent}
                session={session}
                onAddAlbumMedia={openAlbumMediaPicker}
                mode="edit"
                onBack={closeContentDetail}
                onDeleted={closeDeletedContent}
                onActionMessage={onActionMessage}
                onActionError={onActionError}
              />
            ) : contentListDetail?.type === 'detail' ? (
              <StationContentManageSheet
                target={contentListDetail.target}
                palette={palette}
                language={language}
                token={session.token}
                stationContent={session.stationContent}
                session={session}
                onAddAlbumMedia={openAlbumMediaPicker}
                mode="detail"
                onEdit={() =>
                  setContentListDetail({
                    ...contentListDetail,
                    type: 'edit',
                    backTo: 'detail',
                  })
                }
                onBack={closeContentDetail}
                onDeleted={closeDeletedContent}
                onActionMessage={onActionMessage}
                onActionError={onActionError}
              />
            ) : contentListKind ? (
              <StationContentListScreen
                kind={contentListKind}
                albums={session.stationContent.albums}
                diaryEntries={session.stationContent.diaryEntries}
                language={language}
                mediaAssets={session.stationContent.mediaAssets}
                onFindMedia={
                  supportsMediaRetrieval()
                    ? () => setIsMediaRetrievalOpen(true)
                    : undefined
                }
                onBack={() => setContentListKind(null)}
                onCreate={() => {
                  setContentListDetail({
                    type: 'create',
                    kind: contentListKind === 'diary' ? 'diary' : 'album',
                    returnTo: 'list',
                  });
                }}
                onOpen={target => {
                  setContentListDetail({
                    type: 'detail',
                    target,
                    returnTo: 'list',
                  });
                }}
                onEdit={target => {
                  setContentListDetail({
                    type: 'edit',
                    target,
                    returnTo: 'list',
                    backTo: 'list',
                  });
                }}
                palette={palette}
                token={session.token}
              />
            ) : null}
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
    </View>
  );
}
