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
import { Images, Pencil, Plus, X } from 'lucide-react-native';
import { StationAlbumDTO, StationMediaAssetDTO } from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { Palette } from '../../shared/theme';
import { WorkspaceButton, workspaceTokens } from '../../shared/workspaceUi';
import { workspacePalette } from '../../shared/workspacePalette';
import { AlbumContextActions } from '../assist/AlbumContextActions';
import { AIAssistScene } from '../assist/aiAssistTypes';
import { Language } from '../session/sessionTypes';

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
  palette,
  language,
  token,
  albums,
  mediaAssets,
  onBack,
  onCreate,
  onOpen,
  onEdit,
}: {
  palette: Palette;
  language: Language;
  token: string;
  albums: StationAlbumDTO[];
  mediaAssets: StationMediaAssetDTO[];
  onBack: () => void;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const colors = workspacePalette(palette);
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={s.panel}
    >
      <View style={s.heading}>
        <WorkspaceButton
          palette={colors}
          label={textFor(language, '新建相册', 'New album')}
          onPress={onCreate}
          icon={<Plus size={18} color={colors.surface} />}
          style={s.create}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(
            language,
            '收起相册面板',
            'Close albums panel',
          )}
          onPress={onBack}
          style={s.edit}
        >
          <X size={18} color={colors.secondaryText} />
        </Pressable>
      </View>
      <Text style={[s.body, { color: colors.secondaryText }]}>
        {textFor(
          language,
          '只上传你选择的照片，不自动同步手机相册。',
          'Upload only photos you choose. Your photo library is not synced automatically.',
        )}
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
                style={[s.album, { borderColor: colors.border }]}
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
                    <Text style={[s.name, { color: colors.text }]}>
                      {album.title}
                    </Text>
                    <Text style={[s.body, { color: colors.secondaryText }]}>
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
          <View style={[s.empty, { borderColor: colors.border }]}>
            <Images color={colors.secondaryText} size={24} />
            <Text style={[s.name, { color: colors.text }]}>
              {textFor(language, '暂无相册', 'No albums yet')}
            </Text>
            <Text style={[s.body, { color: colors.secondaryText }]}>
              {textFor(
                language,
                '新建相册并选择照片后，会显示在这里。',
                'Create an album and choose photos to see them here.',
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
  heading: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  name: { fontSize: 13, lineHeight: 18, fontWeight: '600' },
  body: workspaceTokens.typography.caption,
  create: { maxWidth: '100%' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  album: {
    width: '31.8%',
    borderWidth: 1,
    borderRadius: workspaceTokens.radius.control,
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
  edit: {
    minHeight: workspaceTokens.minTouch,
    minWidth: workspaceTokens.minTouch,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    width: '31.8%',
    minHeight: 150,
    padding: 10,
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: workspaceTokens.radius.control,
  },
});
