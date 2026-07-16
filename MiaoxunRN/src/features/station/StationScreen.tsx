import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Settings } from 'lucide-react-native';

import { PresenceMode } from '../../models/api';
import {
  pickStationPhotoFromLibrary,
  takeStationPhoto,
} from '../../services/stationMediaPicker';
import { displayLocationText, displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { SegmentedControl } from '../../shared/ui';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import {
  StationContentManageSheet,
  StationManageTarget,
} from './StationContentManageSheet';
import { StationCreatePayload, StationCreateSheet } from './StationCreateSheet';
import { PresenceMenu, StationProfileHeader } from './StationHeader';
import { StationPanel } from './StationPanels';
import { Stat } from './StationShared';
import { stationModuleStatusText } from './stationModuleStatus';
import {
  PresenceMenuAnchor,
  StationCreateKind,
  StationTab,
} from './stationTypes';

export function StationScreen({
  palette,
  language,
  session,
  onOpenSettings,
  onOpenLocation,
  onCopyAIID,
  onOpenQRCode,
  onOpenFriendThread,
  onOpenAgentThread,
  onOpenPublicProfileByAiId,
  onOpenSiteBuilder,
  homepageRefreshVersion,
  onActionMessage,
  onActionError,
}: {
  palette: Palette;
  language: Language;
  session: ReturnType<typeof useMiaoxunSession>;
  onOpenSettings: () => void;
  onOpenLocation: () => void;
  onCopyAIID: () => void;
  onOpenQRCode: () => void;
  onOpenFriendThread: (friendUserId: string) => void;
  onOpenAgentThread: (agentId: string) => void;
  onOpenPublicProfileByAiId: (aiId: string) => void;
  onOpenSiteBuilder: () => void;
  homepageRefreshVersion: number;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [selectedStationTab, setSelectedStationTab] =
    useState<StationTab>('station');
  const [isPresenceMenuOpen, setIsPresenceMenuOpen] = useState(false);
  const [isUpdatingPresence, setIsUpdatingPresence] = useState(false);
  const [presenceMenuPosition, setPresenceMenuPosition] = useState({
    left: 14,
    top: 96,
  });
  const [createKind, setCreateKind] = useState<StationCreateKind | null>(null);
  const [manageTarget, setManageTarget] = useState<StationManageTarget | null>(
    null,
  );
  const [isCreatingStationContent, setIsCreatingStationContent] =
    useState(false);
  const { width: windowWidth } = useWindowDimensions();

  const updatePresence = (presenceMode: PresenceMode) => {
    if (isUpdatingPresence) {
      return;
    }
    setIsUpdatingPresence(true);
    session
      .updatePresence(presenceMode)
      .then(() => {
        setIsPresenceMenuOpen(false);
      })
      .catch(onActionError)
      .finally(() => setIsUpdatingPresence(false));
  };

  const openPresenceMenu = (anchor: PresenceMenuAnchor) => {
    const menuWidth = 132;
    const left = Math.min(
      Math.max(anchor.x + anchor.width / 2 - menuWidth / 2, 14),
      Math.max(windowWidth - menuWidth - 14, 14),
    );
    const top = anchor.y + anchor.height + 8;
    setPresenceMenuPosition({ left, top });
    setIsPresenceMenuOpen(true);
  };

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
      setSelectedStationTab('station');
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

  return (
    <View style={[styles.screen, { backgroundColor: palette.background }]}>
      <ScrollView
        stickyHeaderIndices={[1]}
        contentContainerStyle={styles.stationScrollContent}
      >
        <View style={styles.stationTopContent}>
          <View style={styles.stationTopRow}>
            <StationProfileHeader
              palette={palette}
              language={language}
              nickname={displayText(language, session.profile.nickname)}
              aiId={session.user?.aiId || '--'}
              presenceMode={session.user?.presenceMode || 'online'}
              miaoPoints={session.profile.miaoPoints}
              community={
                displayLocationText(language, session.profile.community) ||
                textFor(language, '未设置', 'Not set')
              }
              activityArea={
                displayLocationText(language, session.profile.activityArea) ||
                textFor(language, '未设置', 'Not set')
              }
              onTogglePresenceMenu={openPresenceMenu}
              onCopyAIID={onCopyAIID}
              onShowQRCode={onOpenQRCode}
              onOpenLocation={onOpenLocation}
            />
            <Pressable
              onPress={onOpenSettings}
              style={[
                styles.iconButton,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <Settings color={palette.text} size={18} strokeWidth={2.2} />
            </Pressable>
          </View>

          <View
            style={[
              styles.statsRow,
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Stat
              value={session.profile.followingCount}
              label={textFor(language, '关注', 'Following')}
              palette={palette}
              onPress={() => setSelectedStationTab('social')}
            />
            <View
              style={[styles.statDivider, { backgroundColor: palette.border }]}
            />
            <Stat
              value={session.profile.followersCount}
              label={textFor(language, '粉丝', 'Followers')}
              palette={palette}
              onPress={() => setSelectedStationTab('social')}
            />
            <View
              style={[styles.statDivider, { backgroundColor: palette.border }]}
            />
            <Stat
              value={session.profile.collectionsCount}
              label={textFor(language, '收藏', 'Saved')}
              palette={palette}
            />
          </View>
        </View>

        <View
          style={[
            styles.stationTabHeader,
            {
              backgroundColor: palette.background,
              borderBottomColor: palette.border,
            },
          ]}
        >
          <SegmentedControl
            palette={palette}
            value={selectedStationTab}
            options={[
              {
                label: textFor(language, '我的小站', 'Station'),
                value: 'station',
              },
              { label: textFor(language, '我的动态', 'Posts'), value: 'posts' },
              {
                label: textFor(language, 'AI伙伴', 'AI Partners'),
                value: 'agents',
              },
              {
                label: textFor(language, '社交网络', 'Social'),
                value: 'social',
              },
            ]}
            onChange={setSelectedStationTab}
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
            homepageEnabled={session.homepageV1.enabled}
            homepageRefreshVersion={homepageRefreshVersion}
            loadHomepageSite={session.homepageSite}
            moduleStatus={key =>
              stationModuleStatusText(language, key, session.modules[key])
            }
            onOpenFriendThread={onOpenFriendThread}
            onOpenAgentThread={onOpenAgentThread}
            onSetAgentEnabled={session.setAgentEnabled}
            onOpenPublicProfileByAiId={onOpenPublicProfileByAiId}
            onSelectStationTab={setSelectedStationTab}
            onOpenCreateSheet={setCreateKind}
            onOpenDiaryDetail={openDiaryDetail}
            onOpenAlbumDetail={openAlbumDetail}
            onOpenSiteBuilder={onOpenSiteBuilder}
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
      {isPresenceMenuOpen ? (
        <Modal
          animationType="fade"
          transparent
          visible={isPresenceMenuOpen}
          onRequestClose={() => setIsPresenceMenuOpen(false)}
        >
          <Pressable
            style={styles.presenceOverlayDismiss}
            onPress={() => setIsPresenceMenuOpen(false)}
          />
          <PresenceMenu
            palette={palette}
            language={language}
            presenceMode={session.user?.presenceMode || 'online'}
            isUpdatingPresence={isUpdatingPresence}
            position={presenceMenuPosition}
            onSelectPresence={updatePresence}
          />
        </Modal>
      ) : null}
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

export function FloatingMiaoButton({
  palette,
  onPress,
}: {
  palette: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="妙"
      onPress={onPress}
      style={[
        styles.floatingMiao,
        {
          backgroundColor: palette.rose,
          shadowColor: palette.rose,
        },
      ]}
    >
      <Text style={styles.floatingMiaoText}>妙</Text>
    </Pressable>
  );
}
