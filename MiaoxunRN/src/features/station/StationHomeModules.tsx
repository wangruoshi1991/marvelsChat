import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import {
  AgentDTO,
  OwnedAgentDTO,
  StationAlbumDTO,
  StationDiaryEntryDTO,
  StationMediaAssetDTO,
} from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';

export function StationModule({
  palette,
  title,
  action,
  onAction,
  children,
}: {
  palette: Palette;
  title: string;
  action: string;
  onAction: () => void;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.stationModuleCard,
        { backgroundColor: palette.surface, shadowColor: palette.shadow },
      ]}
    >
      <View style={styles.stationModuleTitleRow}>
        <Text style={[styles.stationModuleTitle, { color: palette.text }]}>
          {title}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={[
            styles.stationModuleAddButton,
            { backgroundColor: palette.soft },
          ]}
        >
          <Text style={[styles.stationModuleAddText, { color: palette.text }]}>
            {action}
          </Text>
        </Pressable>
      </View>
      {children}
    </View>
  );
}

export function DiaryComicGrid({
  palette,
  entries,
  onOpenEntry,
}: {
  palette: Palette;
  entries: StationDiaryEntryDTO[];
  onOpenEntry: (entryId: string) => void;
}) {
  const latestEntries = entries.slice(0, 4);
  const emptySlots = Array.from({
    length: Math.max(0, 4 - latestEntries.length),
  });

  return (
    <View style={styles.stationModuleStack}>
      <View style={styles.stationComicGrid}>
        {latestEntries.map(entry => (
          <ComicCoverCard
            key={entry.id}
            palette={palette}
            title={entry.title}
            body={entry.body}
            onPress={() => onOpenEntry(entry.id)}
          />
        ))}
        {emptySlots.map((_, index) => (
          <EmptyComicSlot key={`empty-diary-${index}`} palette={palette} />
        ))}
      </View>
    </View>
  );
}

function ComicCoverCard({
  palette,
  title,
  body,
  onPress,
  muted = false,
}: {
  palette: Palette;
  title: string;
  body: string;
  onPress?: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!onPress}
      onPress={onPress}
      style={[
        styles.stationComicCoverCard,
        { backgroundColor: palette.surface },
        muted && {
          borderColor: palette.border,
        },
        muted && styles.stationComicCoverMuted,
      ]}
    >
      <View style={styles.stationComicPreview}>
        <View
          style={[styles.stationMiniPanel, styles.stationMiniPanelMorning]}
        />
        <View style={[styles.stationMiniPanel, styles.stationMiniPanelNoon]} />
        <View
          style={[styles.stationMiniPanel, styles.stationMiniPanelEvening]}
        />
        <View style={[styles.stationMiniPanel, styles.stationMiniPanelNight]} />
      </View>
      <Text
        style={[styles.stationComicTitle, { color: palette.text }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text
        style={[styles.stationComicBody, { color: palette.secondaryText }]}
        numberOfLines={2}
      >
        {body}
      </Text>
    </Pressable>
  );
}

function EmptyComicSlot({ palette }: { palette: Palette }) {
  return (
    <View
      style={[
        styles.stationComicCoverCard,
        styles.stationComicCoverMuted,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
        },
      ]}
    >
      <View
        style={[
          styles.stationComicPreview,
          {
            backgroundColor: palette.soft,
            borderColor: palette.border,
          },
        ]}
      >
        <View
          style={[
            styles.stationMiniPanel,
            { backgroundColor: palette.surface },
          ]}
        />
        <View
          style={[
            styles.stationMiniPanel,
            { backgroundColor: palette.surface },
          ]}
        />
        <View
          style={[
            styles.stationMiniPanel,
            { backgroundColor: palette.surface },
          ]}
        />
        <View
          style={[
            styles.stationMiniPanel,
            { backgroundColor: palette.surface },
          ]}
        />
      </View>
    </View>
  );
}

export function AlbumGrid({
  palette,
  language,
  albums,
  mediaAssets,
  token,
  onOpenAlbum,
}: {
  palette: Palette;
  language: Language;
  albums: StationAlbumDTO[];
  mediaAssets: StationMediaAssetDTO[];
  token: string;
  onOpenAlbum: (albumId: string) => void;
}) {
  if (!albums.length) {
    return (
      <EmptyModuleState
        palette={palette}
        title={textFor(language, '暂无相册', 'No Albums Yet')}
        body={textFor(
          language,
          '创建相册并上传真实照片后，这里按三列展示。',
          'Created albums and uploaded photos will appear in a three-column grid.',
        )}
      />
    );
  }

  const latestAlbums = rankAlbumsForHome(albums, mediaAssets).slice(0, 3);

  return (
    <View style={styles.stationModuleStack}>
      <View style={styles.stationAlbumGrid}>
        {latestAlbums.map(album => {
          const albumMedia = mediaAssets.filter(
            asset => asset.albumId === album.id && asset.status !== 'deleted',
          );
          const uploadedCover = albumMedia.find(
            asset => asset.status === 'uploaded' && asset.kind === 'image',
          );
          const pendingCount = albumMedia.filter(
            asset => asset.status === 'pending_upload',
          ).length;

          return (
            <View key={album.id} style={styles.stationAlbumTile}>
              <Pressable
                accessibilityRole="button"
                onPress={() => onOpenAlbum(album.id)}
                style={[
                  styles.stationAlbumCover,
                  { backgroundColor: palette.soft },
                ]}
              >
                {uploadedCover ? (
                  <Image
                    resizeMode="cover"
                    source={{
                      uri: buildStationMediaFileUrl(uploadedCover.id),
                      headers: { Authorization: `Bearer ${token}` },
                    }}
                    style={styles.stationAlbumCoverImage}
                  />
                ) : (
                  <Text
                    style={[
                      styles.stationAlbumCoverText,
                      { color: palette.secondaryText },
                    ]}
                  >
                    {pendingCount
                      ? textFor(language, '上传中', 'Uploading')
                      : textFor(language, '空分类', 'Empty')}
                  </Text>
                )}
              </Pressable>
              <Text
                style={[styles.stationAlbumTitle, { color: palette.text }]}
                numberOfLines={1}
              >
                {album.title}
              </Text>
              <Text
                style={[
                  styles.stationAlbumCount,
                  { color: palette.secondaryText },
                ]}
              >
                {textFor(
                  language,
                  `${album.mediaCount} 张照片`,
                  `${album.mediaCount} photos`,
                )}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function rankAlbumsForHome(
  albums: StationAlbumDTO[],
  mediaAssets: StationMediaAssetDTO[],
) {
  const mediaByAlbumId = new Map<string, StationMediaAssetDTO[]>();
  mediaAssets
    .filter(asset => asset.albumId && asset.status !== 'deleted')
    .forEach(asset => {
      const albumId = asset.albumId as string;
      const items = mediaByAlbumId.get(albumId) || [];
      items.push(asset);
      mediaByAlbumId.set(albumId, items);
    });

  return [...albums].sort((left, right) => {
    const leftMedia = mediaByAlbumId.get(left.id) || [];
    const rightMedia = mediaByAlbumId.get(right.id) || [];
    const leftHasMedia = leftMedia.length > 0;
    const rightHasMedia = rightMedia.length > 0;

    if (leftHasMedia !== rightHasMedia) {
      return leftHasMedia ? -1 : 1;
    }

    return (
      latestAlbumActivityTime(right, rightMedia) -
      latestAlbumActivityTime(left, leftMedia)
    );
  });
}

function latestAlbumActivityTime(
  album: StationAlbumDTO,
  mediaAssets: StationMediaAssetDTO[],
) {
  const mediaTime = Math.max(
    0,
    ...mediaAssets.map(asset => dateTimeValue(asset.createdAt)),
  );
  return Math.max(mediaTime, dateTimeValue(album.createdAt));
}

function dateTimeValue(value: string | null | undefined) {
  if (!value) {
    return 0;
  }
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

export function CallableAgentList({
  palette,
  language,
  agents,
  ownedAgents,
  onOpenAgentThread,
}: {
  palette: Palette;
  language: Language;
  agents: AgentDTO[];
  ownedAgents: OwnedAgentDTO[];
  onOpenAgentThread: (agentId: string) => void;
}) {
  const registeredByKey = new Map(agents.map(agent => [agent.key, agent]));
  const enabledAgents = ownedAgents
    .filter(agent => agent.enabled)
    .map(agent => ({
      ...agent,
      identity: registeredByKey.get(agent.id)?.identity || null,
    }));

  if (!enabledAgents.length) {
    return (
      <EmptyModuleState
        palette={palette}
        title={textFor(language, '暂无可调用 Agent', 'No Callable Agents Yet')}
        body={textFor(
          language,
          '配置授权和调用范围后，访客可从这里调用你的能力。',
          'Visitors can call your capabilities here after authorization and scope are configured.',
        )}
      />
    );
  }

  return (
    <View style={styles.stationCallableAgentList}>
      {enabledAgents.slice(0, 3).map(agent => (
        <View
          key={agent.id}
          style={[
            styles.stationCallableAgentRow,
            { backgroundColor: palette.soft },
          ]}
        >
          <View
            style={[
              styles.stationAgentMark,
              {
                backgroundColor:
                  agent.identity?.colors.background || palette.rose,
              },
            ]}
          >
            <Text
              style={[
                styles.stationAgentMarkText,
                { color: agent.identity?.colors.foreground || '#ffffff' },
              ]}
            >
              {agent.identity?.mark || agent.name.slice(0, 1)}
            </Text>
          </View>
          <View style={styles.stationCallableAgentCopy}>
            <Text
              style={[styles.stationCallableAgentName, { color: palette.text }]}
              numberOfLines={1}
            >
              {agent.name}
            </Text>
            <Text
              style={[
                styles.stationCallableAgentDesc,
                { color: palette.secondaryText },
              ]}
              numberOfLines={2}
            >
              {agent.description}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => onOpenAgentThread(agent.id)}
            style={[
              styles.stationCallableButton,
              { backgroundColor: palette.text },
            ]}
          >
            <Text
              style={[
                styles.stationCallableButtonText,
                { color: palette.background },
              ]}
            >
              {textFor(language, '调用', 'Call')}
            </Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export function EmptyModuleState({
  palette,
  title,
  body,
  meta,
}: {
  palette: Palette;
  title: string;
  body: string;
  meta?: string;
}) {
  return (
    <View
      style={[styles.stationModuleEmpty, { backgroundColor: palette.soft }]}
    >
      {meta ? (
        <Text
          style={[
            styles.stationModuleEmptyMeta,
            { color: palette.secondaryText },
          ]}
        >
          {meta}
        </Text>
      ) : null}
      <Text style={[styles.stationModuleEmptyTitle, { color: palette.text }]}>
        {title}
      </Text>
      <Text
        style={[
          styles.stationModuleEmptyBody,
          { color: palette.secondaryText },
        ]}
      >
        {body}
      </Text>
    </View>
  );
}
