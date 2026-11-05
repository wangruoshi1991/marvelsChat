import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Images, Pencil, Plus } from 'lucide-react-native';
import { StationAlbumDTO, StationMediaAssetDTO } from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import {
  WorkspaceButton,
  workspaceStyles,
  workspaceTokens,
} from '../../shared/workspaceUi';
import { secondFloorAccent, secondFloorPalette } from './secondFloorTheme';
import { isV6Palette, v6Colors } from '../../shared/v6Palette';
import { isXunPalette } from '../../shared/xunPalette';
import { AlbumContextActions } from '../assist/AlbumContextActions';
import { AIAssistScene } from '../assist/aiAssistTypes';
import { Language } from '../session/sessionTypes';
import { SecondFloorPageScrollProps } from './secondFloorScroll';
import type {
  UIComponentPreference,
  UIPreferences,
} from '../ui/uiPreferenceTypes';
import { uiFontSize, uiRowGap } from '../ui/uiPreferences';

function AlbumCover({
  album,
  cover,
  token,
  colors,
  language,
  onOpen,
  onEdit,
  scene,
}: {
  album: StationAlbumDTO;
  cover: StationMediaAssetDTO;
  token: string;
  colors: Palette;
  language: Language;
  onOpen: () => void;
  onEdit: () => void;
  scene: AIAssistScene;
}) {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(
    'loading',
  );
  const [attempt, setAttempt] = useState(0);
  const currentAttempt = useRef(0);
  const currentStatus = useRef(status);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const finish = (next: 'loaded' | 'error') => {
    if (!alive.current || currentAttempt.current !== attempt) return;
    currentStatus.current = next;
    setStatus(next);
  };
  const retry = () => {
    if (currentStatus.current !== 'error') return;
    currentStatus.current = 'loading';
    currentAttempt.current += 1;
    setStatus('loading');
    setAttempt(currentAttempt.current);
  };
  return (
    <AlbumContextActions
      album={album}
      scene={scene}
      palette={colors}
      language={language}
      onOpen={onOpen}
      onEdit={onEdit}
      accessibilityLabel={textFor(
        language,
        status === 'error'
          ? `重新加载${album.title}封面`
          : `查看相册${album.title}`,
        status === 'error'
          ? `Reload ${album.title} cover`
          : `View album ${album.title}`,
      )}
      accessibilityHint={
        status === 'error'
          ? textFor(
              language,
              '封面加载失败，轻点重试',
              'Cover failed to load. Tap to retry.',
            )
          : undefined
      }
      onPressOverride={status === 'error' ? retry : undefined}
      style={[s.cover, { backgroundColor: colors.soft }]}
    >
      <Image
        key={attempt}
        accessibilityLabel={textFor(
          language,
          `${album.title}封面`,
          `${album.title} cover`,
        )}
        source={{
          uri: buildStationMediaFileUrl(cover.id),
          headers: { Authorization: `Bearer ${token}` },
          ...(attempt > 0 ? { cache: 'reload' as const } : {}),
        }}
        resizeMode="cover"
        onLoad={() => finish('loaded')}
        onError={() => finish('error')}
        style={s.image}
      />
      {status === 'loading' ? (
        <View
          pointerEvents="none"
          style={[s.coverLoading, { backgroundColor: colors.soft }]}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator size="small" color={colors.secondaryText} />
          <Text style={[s.coverLabel, { color: colors.secondaryText }]}>
            {textFor(language, '加载封面', 'Loading cover')}
          </Text>
        </View>
      ) : null}
      {status === 'error' ? (
        <View
          pointerEvents="none"
          style={[s.coverError, { backgroundColor: colors.soft }]}
          accessibilityLiveRegion="polite"
        >
          <Text style={[s.coverLabel, { color: colors.secondaryText }]}>
            {textFor(language, '封面加载失败', 'Cover failed to load')}
          </Text>
          <Text style={[s.coverRetry, { color: colors.text }]}>
            {textFor(language, '点击重试', 'Tap to retry')}
          </Text>
        </View>
      ) : null}
    </AlbumContextActions>
  );
}

export function SecondFloorAlbumList({
  header,
  palette,
  language,
  token,
  albums,
  mediaAssets,
  uploadPreference,
  uiPreferences,
  buttonScale,
  onCreate,
  onOpen,
  onEdit,
  scrollProps,
}: {
  header?: React.ReactNode;
  palette: Palette;
  language: Language;
  token: string;
  albums: StationAlbumDTO[];
  mediaAssets: StationMediaAssetDTO[];
  uploadPreference?: UIComponentPreference;
  uiPreferences?: UIPreferences;
  buttonScale?: number;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  scrollProps?: SecondFloorPageScrollProps;
}) {
  const colors = secondFloorPalette(palette);
  const xun = isXunPalette(colors);
  const accent = secondFloorAccent(colors);
  const uploadVisible = uploadPreference?.visible !== false;
  const uploadLabel =
    uploadPreference?.label ||
    textFor(language, xun ? '上传' : '新建相册', xun ? 'Upload' : 'New album');
  const tokens = uiPreferences?.surfaces.secondFloor;
  const uploadScale = Math.max(
    0.8,
    Math.min(
      1.3,
      (uploadPreference?.sizeScale ?? 1) *
        (buttonScale ?? tokens?.buttonScale ?? 1),
    ),
  );
  const uploadStyle = {
    minHeight: Math.max(44, 44 * uploadScale),
    minWidth: 44,
    maxWidth: '100%' as const,
    borderRadius: tokens?.buttonRadius ?? 12,
    paddingHorizontal: 8 * uploadScale,
    paddingVertical: 6 * uploadScale,
  };
  const uploadLabelStyle = {
    fontSize: uiFontSize(uiPreferences, 13) * uploadScale,
    lineHeight: uiFontSize(uiPreferences, 18) * uploadScale,
    flexShrink: 1,
  };
  const titleStyle = {
    fontSize: uiFontSize(uiPreferences, 23),
    lineHeight: uiFontSize(uiPreferences, 29),
  };
  const captionStyle = {
    fontSize: uiFontSize(uiPreferences, 13),
    lineHeight: uiFontSize(uiPreferences, 22),
  };
  const uploadIcon = uploadPreference?.icon;
  return (
    <ScrollView
      {...scrollProps}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[
        s.panel,
        xun && s.panelXun,
        uiPreferences && {
          gap: uiRowGap(uiPreferences, 'secondFloor', xun ? 12 : 16),
        },
      ]}
    >
      {header}
      <View style={s.pageHeader}>
        <View style={s.pageTitleRow}>
          <Text
            accessibilityRole="header"
            style={[s.pageTitle, titleStyle, { color: colors.text }]}
          >
            {textFor(language, '相册', 'Albums')}
          </Text>
          {xun && uploadVisible ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={textFor(
                language,
                uploadPreference?.label || '上传照片并新建相册',
                uploadPreference?.label || 'Upload photos and create album',
              )}
              onPress={onCreate}
              style={({ pressed }) => [
                s.createLink,
                uploadStyle,
                pressed && workspaceStyles.pressed,
              ]}
            >
              {uploadIcon ? (
                <Text
                  style={[
                    s.createLinkIcon,
                    uploadLabelStyle,
                    { color: accent },
                  ]}
                >
                  {uploadIcon}
                </Text>
              ) : (
                <Plus size={16 * uploadScale} color={accent} />
              )}
              <Text
                style={[s.createLinkLabel, uploadLabelStyle, { color: accent }]}
              >
                {uploadLabel}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text
          style={[s.pageHint, captionStyle, { color: colors.secondaryText }]}
        >
          {textFor(
            language,
            '让每一张值得珍藏的照片，被好好记住。',
            'Keep every photo worth remembering in its proper place.',
          )}
        </Text>
      </View>
      {!xun && uploadVisible ? (
        <View style={s.heading}>
          <WorkspaceButton
            palette={colors}
            label={uploadLabel || textFor(language, '新建相册', 'New album')}
            onPress={onCreate}
            icon={
              uploadIcon ? (
                <Text
                  style={{
                    color: isV6Palette(colors)
                      ? v6Colors.onAccent
                      : colors.surface,
                  }}
                >
                  {uploadIcon}
                </Text>
              ) : (
                <Plus
                  size={18 * uploadScale}
                  color={
                    isV6Palette(colors) ? v6Colors.onAccent : colors.surface
                  }
                />
              )
            }
            labelStyle={uploadLabelStyle}
            style={[s.create, uploadStyle]}
          />
        </View>
      ) : null}
      <Text
        style={[
          s.sectionTitle,
          {
            color: colors.text,
            fontSize: uiFontSize(uiPreferences, 14),
            lineHeight: uiFontSize(uiPreferences, 20),
          },
        ]}
      >
        {albums.length
          ? textFor(
              language,
              `已保存 ${albums.length} 个相册`,
              `${albums.length} saved ${
                albums.length === 1 ? 'album' : 'albums'
              }`,
            )
          : textFor(language, '你的相册', 'Your albums')}
      </Text>
      <View style={s.grid}>
        {albums.length ? (
          albums.map(album => {
            const scene: AIAssistScene = {
              page: 'second-floor.albums',
              label: textFor(
                language,
                '讯 · 二楼 · 相册',
                'Xun · Second floor · Albums',
              ),
              module: {
                key: 'album-grid',
                label: textFor(language, '相册列表', 'Album list'),
              },
            };
            const cover = mediaAssets.find(
              asset =>
                asset.albumId === album.id &&
                asset.kind === 'image' &&
                asset.status === 'uploaded',
            );
            return (
              <View
                key={album.id}
                style={[
                  s.album,
                  {
                    backgroundColor: colors.surface,
                    borderColor: colors.border,
                    ...(tokens && { borderRadius: tokens.cardRadius }),
                  },
                ]}
              >
                <View style={s.open}>
                  {cover ? (
                    <AlbumCover
                      key={`${token}:${cover.id}`}
                      album={album}
                      cover={cover}
                      token={token}
                      colors={colors}
                      language={language}
                      onOpen={() => onOpen(album.id)}
                      onEdit={() => onEdit(album.id)}
                      scene={scene}
                    />
                  ) : (
                    <AlbumContextActions
                      album={album}
                      scene={scene}
                      palette={colors}
                      language={language}
                      accessibilityLabel={textFor(
                        language,
                        `查看相册${album.title}`,
                        `View album ${album.title}`,
                      )}
                      onOpen={() => onOpen(album.id)}
                      onEdit={() => onEdit(album.id)}
                      style={[s.cover, { backgroundColor: colors.soft }]}
                    >
                      <Images color={colors.secondaryText} size={25} />
                    </AlbumContextActions>
                  )}
                  <AlbumContextActions
                    album={album}
                    scene={scene}
                    palette={colors}
                    language={language}
                    accessibilityLabel={textFor(
                      language,
                      `查看相册${album.title}`,
                      `View album ${album.title}`,
                    )}
                    onOpen={() => onOpen(album.id)}
                    onEdit={() => onEdit(album.id)}
                    style={s.copy}
                  >
                    <Text
                      style={[
                        s.name,
                        {
                          color: colors.text,
                          fontSize: uiFontSize(uiPreferences, 13),
                          lineHeight: uiFontSize(uiPreferences, 18),
                        },
                      ]}
                    >
                      {album.title}
                    </Text>
                    <Text
                      style={[
                        s.body,
                        captionStyle,
                        { color: colors.secondaryText },
                      ]}
                    >
                      {textFor(
                        language,
                        `${album.mediaCount} 个素材`,
                        `${album.mediaCount} items`,
                      )}
                    </Text>
                  </AlbumContextActions>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={textFor(
                    language,
                    `编辑相册${album.title}`,
                    `Edit album ${album.title}`,
                  )}
                  onPress={() => onEdit(album.id)}
                  style={[s.albumEdit, { backgroundColor: colors.surface }]}
                >
                  <Pencil size={14} color={colors.secondaryText} />
                </Pressable>
              </View>
            );
          })
        ) : (
          <View
            style={[
              s.empty,
              { backgroundColor: colors.surface, borderColor: colors.border },
            ]}
          >
            <Images color={colors.secondaryText} size={24} />
            <Text style={[s.name, { color: colors.text }]}>
              {textFor(language, '暂无相册', 'No albums yet')}
            </Text>
            <Text style={[s.body, { color: colors.secondaryText }]}>
              {textFor(
                language,
                '选择照片并保存后，相册会显示在这里。',
                'Albums appear here after you choose and save photos.',
              )}
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  panel: { paddingHorizontal: 12, paddingVertical: 14, gap: 10 },
  panelXun: {
    paddingHorizontal: 17,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  pageHeader: { gap: 4, paddingBottom: 2 },
  pageTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  pageTitle: { fontSize: 23, lineHeight: 29, fontWeight: '700' },
  pageHint: { fontSize: 13, lineHeight: 22 },
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
  },
  createLink: {
    minHeight: workspaceTokens.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 2,
  },
  createLinkIcon: { fontSize: 16, lineHeight: 18, fontWeight: '600' },
  createLinkLabel: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  sectionTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600' },
  name: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  body: workspaceTokens.typography.caption,
  create: { maxWidth: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  album: {
    width: '31.8%',
    borderWidth: 1,
    borderRadius: 12,
    overflow: 'hidden',
  },
  open: {
    flex: 1,
    gap: 8,
  },
  cover: {
    aspectRatio: 1,
    width: '100%',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: { width: '100%', height: '100%' },
  coverLoading: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
  },
  coverError: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 6,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  coverLabel: { fontSize: 11, lineHeight: 15, textAlign: 'center' },
  coverRetry: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
    paddingHorizontal: 8,
    paddingBottom: 9,
  },
  albumEdit: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: workspaceTokens.minTouch,
    height: workspaceTokens.minTouch,
    borderBottomLeftRadius: workspaceTokens.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.9,
  },
  empty: {
    width: '100%',
    minHeight: 120,
    paddingHorizontal: 17,
    paddingVertical: 20,
    gap: 8,
    borderWidth: 1,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
