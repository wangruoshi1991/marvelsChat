import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Animated,
  Modal,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import { MoreHorizontal } from 'lucide-react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import {
  pickStationPhotoFromLibrary,
  takeStationPhoto,
} from '../../services/stationMediaPicker';
import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { PageGradient } from '../../shared/PageGradient';
import { useAIAssist } from '../assist/AIAssistProvider';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';
import { MiaoPointsScreen } from './MiaoPointsScreen';
import { Avatar3DCreateScreen } from './Avatar3DCreateScreen';
import { StationContentManageSheet } from './StationContentManageSheet';
import { StationContentListScreen } from './StationContentListScreen';
import { StationCreateSheet } from './StationCreateSheet';
import type { StationCreatePayload } from './StationCreateSheet';
import {
  STATION_COLLAPSE_SCROLL_DISTANCE,
  STATION_EXPAND_SCROLL_DISTANCE,
  StationProfileHeader,
  StationTabs,
} from './StationHeader';
import { StationAvatarSpace } from './StationAvatarSpace';
import { StationPanel } from './StationPanels';
import { stationDisplayRegionLabel } from './stationProfileIdentity';
import { resolveStationColors } from './stationTheme';
import type {
  StationContentListKind,
  StationCreateKind,
  StationManageTarget,
  StationTab,
} from './stationTypes';
import { useAvatar3d } from './useAvatar3d';

export function StationScreen({
  active = true,
  palette,
  language,
  session,
  selectedStationTab,
  onSelectStationTab,
  renderUserAvatar,
  onOpenLocation,
  onOpenProfileEdit,
  onCopyAIID,
  onOpenQRCode,
  onOpenAgentThread,
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
  onOpenLocation: () => void;
  onOpenProfileEdit?: () => void;
  onCopyAIID: () => void;
  onOpenQRCode: () => void;
  onOpenAgentThread: (agentId: string) => void;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const { isActive: isAssistActive } = useAIAssist();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [isPointsOpen, setIsPointsOpen] = useState(false);
  const [isAvatar3dOpen, setIsAvatar3dOpen] = useState(false);
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
      onSelectStationTab('posts');
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

  /**
   * Prototype `.me-profile` holds only kicker / name / ID / bio / location, and
   * `.me-switch` is strictly two segments. The QR code, profile edit and
   * settings entries therefore live in this page-level overflow menu.
   */
  const openStationOverflow = () => {
    Alert.alert(textFor(language, '小站', 'Station'), undefined, [
      {
        text: textFor(language, '我的二维码', 'My QR code'),
        onPress: onOpenQRCode,
      },
      {
        text: textFor(language, '编辑小站资料', 'Edit station profile'),
        onPress: onOpenProfileEdit,
      },
      { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
    ]);
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

  // Keep profile geometry continuous while the panel scrolls. The header is a
  // sibling of the clipped panel viewport, so its changing height cannot
  // move a native sticky-header wrapper over the list.
  const collapseProgress = useRef(new Animated.Value(0)).current;
  const collapseProgressRef = useRef(0);
  const collapsedRef = useRef(false);
  const panelScrollRef = useRef<ScrollView>(null);
  const panelScrollOffset = useRef(0);
  const panelContentHeight = useRef(0);
  const panelViewportHeightRef = useRef(windowHeight);
  const measuredPanelViewportHeight = useRef<number | null>(null);
  const profileHeaderHeight = useRef<number | null>(null);
  const panelGeometryInitialized = useRef(false);
  // Reserve the gesture range before native layout callbacks arrive. On a
  // short or empty panel iOS can defer one of the initial onLayout events;
  // starting at zero would leave the ScrollView with no scrollable extent and
  // make the profile appear non-interactive until another layout occurs.
  const initialPanelContentHeight =
    windowHeight + STATION_COLLAPSE_SCROLL_DISTANCE;
  const stablePanelContentHeightRef = useRef(initialPanelContentHeight);
  const [stablePanelContentHeight, setStablePanelContentHeight] = useState(
    initialPanelContentHeight,
  );
  const updateStablePanelContentHeight = useCallback(() => {
    if (
      measuredPanelViewportHeight.current === null ||
      profileHeaderHeight.current === null ||
      (panelGeometryInitialized.current && collapseProgressRef.current > 0.001)
    ) {
      return;
    }
    const maximumViewportHeight =
      measuredPanelViewportHeight.current +
      Math.max(profileHeaderHeight.current - 64, 0);
    const nextHeight = maximumViewportHeight + STATION_COLLAPSE_SCROLL_DISTANCE;
    panelGeometryInitialized.current = true;
    if (Math.abs(nextHeight - stablePanelContentHeightRef.current) <= 1) return;
    stablePanelContentHeightRef.current = nextHeight;
    setStablePanelContentHeight(nextHeight);
  }, []);
  const measuredWindowSize = useRef({
    height: windowHeight,
    width: windowWidth,
  });
  useLayoutEffect(() => {
    if (
      measuredWindowSize.current.height === windowHeight &&
      measuredWindowSize.current.width === windowWidth
    ) {
      return;
    }
    const collapsedHeightOnlyResize =
      measuredWindowSize.current.width === windowWidth &&
      collapseProgressRef.current === 1;
    measuredWindowSize.current = { height: windowHeight, width: windowWidth };
    measuredPanelViewportHeight.current = null;
    // A collapsed card stays 64pt when only the window height changes. Its
    // unchanged frame will not emit another native onLayout event.
    profileHeaderHeight.current = collapsedHeightOnlyResize ? 64 : null;
    panelGeometryInitialized.current = false;
    const fallbackHeight = windowHeight + STATION_COLLAPSE_SCROLL_DISTANCE;
    stablePanelContentHeightRef.current = fallbackHeight;
    setStablePanelContentHeight(fallbackHeight);
  }, [windowHeight, windowWidth]);
  const [profileCollapsed, setProfileCollapsed] = useState(false);
  const setCollapsed = useCallback((next: boolean) => {
    if (collapsedRef.current === next) return;
    collapsedRef.current = next;
    setProfileCollapsed(next);
  }, []);
  const applyPanelScrollPosition = useCallback(
    (position: number) => {
      const y = Number.isFinite(position) ? Math.max(position, 0) : 0;
      panelScrollOffset.current = y;
      collapseProgressRef.current = Math.min(
        y / STATION_COLLAPSE_SCROLL_DISTANCE,
        1,
      );
      // Drive the card continuously from the finger's scroll position. The old
      // threshold-only timing animation started after the gesture and could
      // visibly lag or jump, especially on short/empty panels.
      collapseProgress.setValue(collapseProgressRef.current);
      if (y >= STATION_COLLAPSE_SCROLL_DISTANCE) {
        setCollapsed(true);
      } else if (y <= STATION_EXPAND_SCROLL_DISTANCE) {
        setCollapsed(false);
      }
    },
    [collapseProgress, setCollapsed],
  );
  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    applyPanelScrollPosition(event.nativeEvent.contentOffset.y);
  };
  const getPanelMaxOffset = useCallback(() => {
    // The content container always reserves this much room for the profile
    // gesture. Layout and content-size events can arrive in either order while
    // the header changes the viewport, so preserve the minimum range and the
    // current native offset until its next scroll event reconciles the value.
    return Math.max(
      panelContentHeight.current - panelViewportHeightRef.current,
      STATION_COLLAPSE_SCROLL_DISTANCE,
      panelScrollOffset.current,
    );
  }, []);
  const headerScrollOrigin = useRef(0);
  const headerVerticalGesture = useMemo(
    () =>
      PanResponder.create({
        // The profile and tabs are fixed siblings of the panel ScrollView.
        // Capture only a clear vertical drag, after child taps have had a
        // chance to start, then drive the same native offset as panel scrolling.
        onMoveShouldSetPanResponder: (_event, gesture) => {
          const maxOffset = getPanelMaxOffset();
          return (
            active &&
            !isAssistActive &&
            Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.4 &&
            ((gesture.dy < -8 && panelScrollOffset.current < maxOffset) ||
              (gesture.dy > 8 && panelScrollOffset.current > 0))
          );
        },
        onPanResponderGrant: () => {
          headerScrollOrigin.current = panelScrollOffset.current;
        },
        onPanResponderMove: (_event, gesture) => {
          const maxOffset = getPanelMaxOffset();
          const nextOffset = Math.min(
            maxOffset,
            Math.max(0, headerScrollOrigin.current - gesture.dy),
          );
          applyPanelScrollPosition(nextOffset);
          panelScrollRef.current?.scrollTo({ y: nextOffset, animated: false });
        },
        onPanResponderRelease: (_event, gesture) => {
          const maxOffset = getPanelMaxOffset();
          const nextOffset = Math.min(
            maxOffset,
            Math.max(0, headerScrollOrigin.current - gesture.dy),
          );
          panelScrollRef.current?.scrollTo({ y: nextOffset, animated: true });
        },
        onPanResponderTerminate: () => {
          panelScrollRef.current?.scrollTo({
            y: panelScrollOffset.current,
            animated: false,
          });
        },
      }),
    [active, applyPanelScrollPosition, getPanelMaxOffset, isAssistActive],
  );

  const stationColors = resolveStationColors(palette);
  const isDark = stationColors.isV6 || session.appearance === 'dark';
  const isPanelActive =
    active &&
    !isAvatar3dOpen &&
    !isPointsOpen &&
    contentListKind === null &&
    createKind === null;

  // Presence stays in the session model; its station entry awaits a final design location.

  // Legacy light mode retains its gradient; V6 uses the supplied page color.
  const showPageGradient = stationColors.isLight && !stationColors.isV6;
  const stationBackground = showPageGradient
    ? 'transparent'
    : stationColors.background;
  // Keep the fixed card and switch aligned with the root-page horizontal wash.
  const stationTopBackground = showPageGradient
    ? 'transparent'
    : stationColors.background;

  return (
    <View style={[styles.screen, { backgroundColor: stationBackground }]}>
      <View
        {...headerVerticalGesture.panHandlers}
        testID="station-top-header"
        style={[
          styles.stationTopContent,
          { backgroundColor: stationTopBackground },
        ]}
      >
        {showPageGradient ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <PageGradient verticalFade={false} />
          </View>
        ) : null}
        <View style={styles.stationOverflowRow}>
          <Pressable
            accessibilityLabel={textFor(language, '更多', 'More')}
            accessibilityRole="button"
            hitSlop={10}
            onPress={openStationOverflow}
            testID="station-overflow"
          >
            <MoreHorizontal
              color={stationColors.secondaryText}
              size={24}
              strokeWidth={2.6}
            />
          </Pressable>
        </View>
        <View
          onLayout={event => {
            const height = event.nativeEvent.layout.height;
            if (Number.isFinite(height) && height > 0) {
              profileHeaderHeight.current = height;
              updateStablePanelContentHeight();
            }
          }}
          testID="station-profile-measure"
        >
          <StationProfileHeader
            collapsed={profileCollapsed}
            collapseProgress={collapseProgress}
            stage={
              <StationAvatarSpace
                active={isPanelActive}
                embedded
                palette={palette}
                language={language}
                token={session.token}
                avatar3d={avatar3d.bootstrap}
                avatar3dStatus={avatar3d.status}
                avatar3dError={avatar3d.errorMessage}
                selectedModelId={selectedAvatar3dModelId}
                onOpenGenerator={openAvatar3d}
                onOpenCoreAgent={() => onOpenAgentThread('model-3d')}
                onOpenOotd={() => openStationCreate('outfit')}
                onOpenDiary={() => openStationCreate('diary')}
                onOpenAgents={() => onSelectStationTab('agents')}
                onOpenCallable={() => onSelectStationTab('agents')}
              />
            }
            palette={palette}
            language={language}
            nickname={displayText(language, session.profile.nickname)}
            aiId={session.user?.aiId || '--'}
            avatarText={session.profile.avatarText}
            avatarConfig={session.profile.avatarConfig}
            bio={displayText(language, session.profile.bio)}
            presenceStatus={
              session.user?.presenceMode === 'online' ? 'online' : 'offline'
            }
            locationLabel={stationDisplayRegionLabel(session.profile)}
            renderUserAvatar={renderUserAvatar}
            onCopyAIID={onCopyAIID}
            onOpenLocation={onOpenLocation}
          />
        </View>
        <StationTabs
          palette={palette}
          language={language}
          value={selectedStationTab}
          onChange={onSelectStationTab}
        />
      </View>
      <ScrollView
        ref={panelScrollRef}
        // The screen already sits inside the app's safe-area view. Automatic
        // inset adjustment would add the status-bar inset a second time and
        // shift the page under the dynamic island.
        contentInsetAdjustmentBehavior="never"
        // A panel with no posts or agents still needs a small scroll range so
        // the profile card can collapse. The space is intentionally empty;
        // it represents the missing content state rather than fake records.
        contentContainerStyle={[
          styles.stationScrollContent,
          { minHeight: stablePanelContentHeight },
        ]}
        onLayout={event => {
          const height = event.nativeEvent.layout.height;
          if (Number.isFinite(height) && height > 0) {
            panelViewportHeightRef.current = height;
            measuredPanelViewportHeight.current = height;
            updateStablePanelContentHeight();
          }
        }}
        onContentSizeChange={(_width, height) => {
          panelContentHeight.current = height;
        }}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        alwaysBounceVertical
        scrollEnabled={!isAssistActive}
        style={styles.stationPanelScroll}
        testID={`station-panel-scroll-${selectedStationTab}`}
      >
        <Animated.View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          pointerEvents="none"
          style={{
            height: collapseProgress.interpolate({
              inputRange: [0, 1],
              outputRange: [0, STATION_COLLAPSE_SCROLL_DISTANCE],
              extrapolate: 'clamp',
            }),
          }}
          testID="station-collapse-spacer"
        />
        <View
          collapsable={false}
          style={styles.stationPanelWrap}
          testID="station-panel-wrap"
        >
          <StationPanel
            active={isPanelActive}
            palette={palette}
            language={language}
            selectedTab={selectedStationTab}
            token={session.token}
            profile={session.profile}
            renderUserAvatar={renderUserAvatar}
            stationContent={session.stationContent}
            agents={session.agents}
            ownedAgents={session.ownedAgents}
            products={session.products}
            entitlements={session.entitlements}
            catalogRevision={session.catalogRevision}
            onOpenAgentThread={onOpenAgentThread}
            onSetAgentEnabled={session.setAgentEnabled}
            onOpenDiaryDetail={openDiaryDetail}
            onDeletePost={session.deleteStationPost}
            onSetStationPostInteraction={session.setStationPostInteraction}
            onActionMessage={onActionMessage}
            onActionError={onActionError}
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
        visible={contentListKind !== null}
        onRequestClose={closeContentDetail}
      >
        <SafeAreaProvider>
          <SafeAreaView
            edges={['top', 'bottom']}
            style={[
              styles.safeArea,
              { backgroundColor: stationColors.surface },
            ]}
          >
            {contentListDetail?.type === 'create' ? (
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
