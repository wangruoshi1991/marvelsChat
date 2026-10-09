import { Bot, Eye, MoreHorizontal, Plus, Share2 } from 'lucide-react-native';
import React from 'react';
import {
  Alert,
  Image,
  Pressable,
  Share,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';

import { stationPartnerIconAssets } from '../../assets/icons';
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
import { AIAssistGestureSurface } from '../assist/AIAssistGestureSurface';
import { useAIAssist } from '../assist/AIAssistProvider';
import {
  AIAssistAction,
  AIAssistObjectReference,
} from '../assist/aiAssistTypes';
import { Language } from '../session/useMiaoxunSession';
import { resolveStationColors } from './stationTheme';

export function StationModule({
  palette,
  title,
  action,
  onAction,
  actionDisabled = false,
  agentAction,
  agentAvailable = true,
  onAgentAction,
  onMore,
  moreLabel = '更多',
  children,
}: {
  palette: Palette;
  title: string;
  action?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
  agentAction?: string;
  agentAvailable?: boolean;
  onAgentAction?: () => void;
  onMore?: () => void;
  moreLabel?: string;
  children: React.ReactNode;
}) {
  const colors = resolveStationColors(palette);

  return (
    <View
      style={[
        styles.stationModuleCard,
        { backgroundColor: colors.surface, shadowColor: palette.shadow },
      ]}
    >
      <View style={styles.stationModuleTitleRow}>
        <Text style={[styles.stationModuleTitle, { color: colors.text }]}>
          {title}
        </Text>
        <View style={styles.stationModuleActions}>
          {agentAction && onAgentAction ? (
            <Pressable
              accessibilityLabel={agentAction}
              accessibilityRole="button"
              onPress={onAgentAction}
              style={[
                styles.stationModuleAgentButton,
                { backgroundColor: colors.soft },
                !agentAvailable && styles.stationModuleAgentButtonPending,
              ]}
            >
              <Bot color={colors.accent} size={15} strokeWidth={2.2} />
              <Text
                numberOfLines={1}
                style={[
                  styles.stationModuleAgentText,
                  { color: colors.accent },
                ]}
              >
                {agentAction}
              </Text>
            </Pressable>
          ) : null}
          {action && onAction ? (
            <Pressable
              accessibilityLabel={action}
              accessibilityRole="button"
              disabled={actionDisabled}
              onPress={onAction}
              style={[
                styles.stationModuleAddButton,
                action !== '添加' &&
                  action !== 'Add' &&
                  styles.stationModuleTextButton,
                { backgroundColor: colors.soft },
                actionDisabled && styles.disabledButton,
              ]}
            >
              {action === '添加' || action === 'Add' ? (
                <Plus color={colors.text} size={17} strokeWidth={2.4} />
              ) : (
                <Text
                  style={[styles.stationModuleAddText, { color: colors.text }]}
                >
                  {action}
                </Text>
              )}
            </Pressable>
          ) : null}
          {onMore ? (
            <Pressable
              accessibilityLabel={moreLabel}
              accessibilityRole="button"
              onPress={onMore}
              style={[
                styles.stationModuleMoreButton,
                { backgroundColor: colors.soft },
              ]}
            >
              <MoreHorizontal color={colors.text} size={18} strokeWidth={2.4} />
            </Pressable>
          ) : null}
        </View>
      </View>
      {children}
    </View>
  );
}

export function DiaryComicGrid({
  palette,
  language,
  entries,
  onOpenEntry,
}: {
  palette: Palette;
  language: Language;
  entries: StationDiaryEntryDTO[];
  onOpenEntry: (entryId: string) => void;
}) {
  const latestEntries = entries.slice(0, 4);

  if (!latestEntries.length) {
    return (
      <EmptyModuleState
        palette={palette}
        title={textFor(language, '暂无日记', 'No Diaries Yet')}
        body={textFor(
          language,
          '记录第一篇日记后，会在这里展示。',
          'Your first diary will appear here after it is saved.',
        )}
      />
    );
  }

  return (
    <View style={styles.stationModuleStack}>
      <View style={styles.stationComicGrid}>
        {latestEntries.map(entry => (
          <ComicCoverCard
            key={entry.id}
            entryId={entry.id}
            language={language}
            palette={palette}
            title={entry.title}
            body={entry.body}
            onPress={() => onOpenEntry(entry.id)}
          />
        ))}
      </View>
    </View>
  );
}

function ComicCoverCard({
  entryId,
  language,
  palette,
  title,
  body,
  onPress,
}: {
  entryId: string;
  language: Language;
  palette: Palette;
  title: string;
  body: string;
  onPress: () => void;
}) {
  const colors = resolveStationColors(palette);

  return (
    <HomeContentActionCard
      language={language}
      onOpen={onPress}
      palette={palette}
      object={{
        kind: 'station-diary',
        id: entryId,
        title,
        metadata: { content: body },
      }}
      style={[
        styles.stationComicCoverCard,
        { backgroundColor: colors.surface },
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
        style={[styles.stationComicTitle, { color: colors.text }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      <Text
        style={[styles.stationComicBody, { color: colors.secondaryText }]}
        numberOfLines={2}
      >
        {body}
      </Text>
    </HomeContentActionCard>
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
  const colors = resolveStationColors(palette);

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
              <HomeContentActionCard
                language={language}
                palette={palette}
                onOpen={() => onOpenAlbum(album.id)}
                object={{
                  kind: 'station-album',
                  id: album.id,
                  title: album.title,
                  metadata: {
                    content: album.description || '',
                    mediaCount: album.mediaCount,
                  },
                }}
                style={[
                  styles.stationAlbumCover,
                  { backgroundColor: colors.soft },
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
                      { color: colors.secondaryText },
                    ]}
                  >
                    {pendingCount
                      ? textFor(language, '上传中', 'Uploading')
                      : textFor(language, '空分类', 'Empty')}
                  </Text>
                )}
              </HomeContentActionCard>
              <Text
                style={[styles.stationAlbumTitle, { color: colors.text }]}
                numberOfLines={1}
              >
                {album.title}
              </Text>
              <Text
                style={[
                  styles.stationAlbumCount,
                  { color: colors.secondaryText },
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

function HomeContentActionCard({
  children,
  language,
  object,
  onOpen,
  palette,
  style,
}: {
  children: React.ReactNode;
  language: Language;
  object: AIAssistObjectReference;
  onOpen: () => void;
  palette: Palette;
  style: StyleProp<ViewStyle>;
}) {
  const assist = useAIAssist();
  const colors = resolveStationColors(palette);
  const content =
    typeof object.metadata?.content === 'string' ? object.metadata.content : '';
  const text = [object.title.trim(), content.trim()]
    .filter(Boolean)
    .join('\n\n');
  const openDetail = () => {
    assist.dismiss();
    onOpen();
  };
  const copyContent = () => {
    Clipboard.setString(text);
    Alert.alert(textFor(language, '已复制文字', 'Text copied'));
  };
  const actions: AIAssistAction[] = [
    {
      direction: 'up',
      label: textFor(language, '分享文字', 'Share text'),
      Icon: Share2,
      accent: colors.accent,
      available: Boolean(text),
      onSelect: () => {
        assist.dismiss();
        Share.share({ message: text }).catch(error => {
          Alert.alert(
            textFor(language, '分享失败', 'Sharing failed'),
            error instanceof Error
              ? error.message
              : textFor(
                  language,
                  '无法打开系统分享，请重试。',
                  'Unable to open sharing. Try again.',
                ),
          );
        });
      },
    },
    {
      direction: 'right',
      label: textFor(language, '妙管家', 'Butler'),
      Icon: Bot,
      accent: colors.accent,
      onSelect: reference => assist.askButler(reference),
    },
    {
      direction: 'down',
      label: textFor(language, '查看', 'View'),
      Icon: Eye,
      accent: colors.accent,
      onSelect: openDetail,
    },
    {
      direction: 'left',
      label: textFor(language, '更多', 'More'),
      Icon: MoreHorizontal,
      accent: colors.accent,
      onSelect: () => {
        assist.dismiss();
        Alert.alert(object.title, undefined, [
          {
            text: textFor(language, '查看详情', 'View details'),
            onPress: openDetail,
          },
          ...(text
            ? [
                {
                  text: textFor(language, '复制文字', 'Copy text'),
                  onPress: copyContent,
                },
              ]
            : []),
          { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        ]);
      },
    },
  ];

  return (
    <AIAssistGestureSurface
      object={object}
      actions={actions}
      palette={palette}
      onPress={onOpen}
      style={style}
      testID={`home-content-assist-${object.kind}-${object.id}`}
    >
      {children}
    </AIAssistGestureSurface>
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

export function AIPartnerGrid({
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
  const colors = resolveStationColors(palette);
  const registeredByKey = new Map(agents.map(agent => [agent.key, agent]));
  const enabledAgents = ownedAgents
    .filter(agent => agent.enabled && agent.id !== 'media-retrieval')
    .map(agent => ({
      ...agent,
      identity: registeredByKey.get(agent.id)?.identity || null,
    }));

  if (!enabledAgents.length) {
    return (
      <EmptyModuleState
        palette={palette}
        title={textFor(language, '暂无AI伙伴', 'No AI Partners Yet')}
        body={textFor(
          language,
          '添加并启用AI伙伴后，会在这里展示。',
          'Added and enabled AI partners appear here.',
        )}
      />
    );
  }

  return (
    <View style={styles.stationAIPartnerGrid}>
      {enabledAgents.slice(0, 6).map(agent => (
        <Pressable
          accessibilityLabel={agent.name}
          accessibilityRole="button"
          key={agent.id}
          onPress={() => onOpenAgentThread(agent.id)}
          style={[
            styles.stationAIPartnerTile,
            { backgroundColor: colors.soft },
          ]}
        >
          {agent.id === 'miaoxun-butler' ? (
            <Image
              source={stationPartnerIconAssets.miaoxunButler}
              resizeMode="contain"
              style={styles.stationAgentImage}
            />
          ) : (
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
          )}
          <View style={styles.stationAIPartnerCopy}>
            <Text
              style={[styles.stationAIPartnerName, { color: colors.text }]}
              numberOfLines={1}
            >
              {agent.name}
            </Text>
            <Text
              style={[
                styles.stationAIPartnerDesc,
                { color: colors.secondaryText },
              ]}
              numberOfLines={2}
            >
              {agent.description}
            </Text>
          </View>
        </Pressable>
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
  const colors = resolveStationColors(palette);

  return (
    <View style={[styles.stationModuleEmpty, { backgroundColor: colors.soft }]}>
      {meta ? (
        <Text
          style={[
            styles.stationModuleEmptyMeta,
            { color: colors.secondaryText },
          ]}
        >
          {meta}
        </Text>
      ) : null}
      <Text style={[styles.stationModuleEmptyTitle, { color: colors.text }]}>
        {title}
      </Text>
      <Text
        style={[styles.stationModuleEmptyBody, { color: colors.secondaryText }]}
      >
        {body}
      </Text>
    </View>
  );
}
