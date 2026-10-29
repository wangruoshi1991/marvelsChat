import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Image,
  type ImageSourcePropType,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';
import {
  BookOpen,
  Bot,
  Copy,
  LayoutGrid,
  Play,
  Share2,
} from 'lucide-react-native';
import Clipboard from '@react-native-clipboard/clipboard';

import { stationPostIconAssets } from '../../assets/icons';
import { AIAssistGestureSurface } from '../assist/AIAssistGestureSurface';
import { useAIAssist } from '../assist/AIAssistProvider';
import {
  AIAssistAction,
  AIAssistObjectReference,
} from '../assist/aiAssistTypes';
import {
  AgentDTO,
  OwnedAgentDTO,
  ProfileDTO,
  StationContentDTO,
  StationDiaryEntryDTO,
  StationPostDTO,
} from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { displayText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { resolveStationColors } from './stationTheme';
import { AgentGlyphAvatar } from '../messages/AgentGlyphAvatar';

export function StationPostsPanel({
  palette,
  language,
  stationContent,
  profile,
  renderUserAvatar,
  agents,
  ownedAgents,
  token,
  onDeletePost,
  onSetStationPostInteraction,
  onActionMessage,
  onActionError,
  onOpenDiaryDetail,
}: {
  palette: Palette;
  language: Language;
  stationContent: StationContentDTO;
  profile: ProfileDTO;
  renderUserAvatar: UserAvatarRenderer;
  agents?: AgentDTO[];
  ownedAgents: OwnedAgentDTO[];
  token: string;
  onDeletePost: (postId: string) => Promise<void>;
  onSetStationPostInteraction: (
    postId: string,
    interactionType: 'like' | 'favorite',
    active: boolean,
  ) => Promise<{
    postId: string;
    likeCount: number;
    favoriteCount: number;
    likedByMe: boolean;
    favoritedByMe: boolean;
  }>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
  onOpenDiaryDetail: (entryId: string) => void;
}) {
  const posts = stationContent.posts;
  const timeline = postTimeline(posts, stationContent.diaryEntries);
  const colors = resolveStationColors(palette);
  if (!timeline.length) {
    return (
      <View style={styles.stationFeedStack}>
        <View
          style={[styles.stationFeedEmpty, { backgroundColor: colors.surface }]}
        >
          <Text style={[styles.stationFeedEmptyTitle, { color: colors.text }]}>
            {textFor(language, '还没有动态', 'No posts yet')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stationFeedStack}>
      {timeline.map(item =>
        item.kind === 'diary' ? (
          <StationDiaryCard
            key={`diary:${item.entry.id}`}
            entry={item.entry}
            language={language}
            palette={palette}
            onOpen={() => onOpenDiaryDetail(item.entry.id)}
          />
        ) : (
          <StationPostCard
            key={item.post.id}
            agents={agents}
            language={language}
            ownedAgents={ownedAgents}
            palette={palette}
            post={item.post}
            profile={profile}
            renderUserAvatar={renderUserAvatar}
            token={token}
            onActionError={onActionError}
            onActionMessage={onActionMessage}
            onDeletePost={onDeletePost}
            onSetStationPostInteraction={onSetStationPostInteraction}
          />
        ),
      )}
    </View>
  );
}

type TimelineItem =
  | { kind: 'post'; post: StationPostDTO; time: number }
  | { kind: 'diary'; entry: StationDiaryEntryDTO; time: number };

/** Posts and diary entries share one newest-first timeline; undated items sink. */
function postTimeline(
  posts: StationPostDTO[],
  diaryEntries: StationDiaryEntryDTO[],
): TimelineItem[] {
  const time = (value?: string | null) =>
    parsePostDate(value)?.getTime() ?? Number.NEGATIVE_INFINITY;
  return [
    ...posts.map(post => ({
      kind: 'post' as const,
      post,
      time: time(post.createdAt),
    })),
    ...diaryEntries.map(entry => ({
      kind: 'diary' as const,
      entry,
      time: time(entry.createdAt),
    })),
  ].sort((a, b) => b.time - a.time);
}

// Diary cards open the existing diary detail while keeping the timeline
// compact enough to show several records in the station feed.
function StationDiaryCard({
  entry,
  language,
  palette,
  onOpen,
}: {
  entry: StationDiaryEntryDTO;
  language: Language;
  palette: Palette;
  onOpen: () => void;
}) {
  const colors = resolveStationColors(palette);
  return (
    <Pressable
      testID={`station-diary-${entry.id}`}
      accessibilityRole="button"
      accessibilityLabel={textFor(
        language,
        `打开日记${entry.title}`,
        `Open diary ${entry.title}`,
      )}
      onPress={onOpen}
      style={[styles.stationDiaryCard, { backgroundColor: colors.surface }]}
    >
      <View style={styles.stationDiaryMeta}>
        {entry.createdAt ? (
          <Text style={[styles.stationDiaryMetaText, { color: colors.text }]}>
            {formatPostDay(entry.createdAt, language)}
          </Text>
        ) : null}
        <BookOpen color={colors.secondaryText} size={13} />
        <Text
          style={[styles.stationDiaryMetaText, { color: colors.secondaryText }]}
        >
          {textFor(language, '日记', 'Diary')}
          {entry.createdAt
            ? ` · ${formatPostClock(entry.createdAt, language)}`
            : ''}
        </Text>
      </View>
      <Text
        numberOfLines={2}
        style={[styles.stationDiaryTitle, { color: colors.text }]}
      >
        {diaryDisplayTitle(entry)}
      </Text>
      {entry.body ? (
        <Text
          numberOfLines={3}
          style={[styles.stationDiaryBody, { color: colors.secondaryText }]}
        >
          {entry.body}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** Remove a timestamp only when it duplicates this diary's creation time. */
function diaryDisplayTitle(entry: StationDiaryEntryDTO) {
  const timestampSuffix = entry.title.match(
    /\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)$/,
  );
  if (!timestampSuffix || !entry.createdAt) {
    return entry.title;
  }
  const titleTime = Date.parse(timestampSuffix[1]);
  const createdTime = Date.parse(entry.createdAt);
  if (
    timestampSuffix.index === undefined ||
    !Number.isFinite(titleTime) ||
    titleTime !== createdTime
  ) {
    return entry.title;
  }
  return entry.title.slice(0, timestampSuffix.index).trimEnd();
}

function StationPostCard({
  agents,
  language,
  ownedAgents,
  palette,
  post,
  profile,
  renderUserAvatar,
  token,
  onDeletePost,
  onSetStationPostInteraction,
  onActionMessage,
  onActionError,
}: {
  agents?: AgentDTO[];
  language: Language;
  ownedAgents: OwnedAgentDTO[];
  palette: Palette;
  post: StationPostDTO;
  profile: ProfileDTO;
  renderUserAvatar: UserAvatarRenderer;
  token: string;
  onDeletePost: (postId: string) => Promise<void>;
  onSetStationPostInteraction: (
    postId: string,
    interactionType: 'like' | 'favorite',
    active: boolean,
  ) => Promise<{
    postId: string;
    likeCount: number;
    favoriteCount: number;
    likedByMe: boolean;
    favoritedByMe: boolean;
  }>;
  onActionMessage: (message: string) => void;
  onActionError: (error: unknown) => void;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [liked, setLiked] = useState(post.likedByMe);
  const [favorited, setFavorited] = useState(post.favoritedByMe);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [favoriteCount, setFavoriteCount] = useState(post.favoriteCount);
  const [interactionPending, setInteractionPending] = useState(false);

  useEffect(() => {
    setLiked(post.likedByMe);
    setFavorited(post.favoritedByMe);
    setLikeCount(post.likeCount);
    setFavoriteCount(post.favoriteCount);
  }, [
    post.id,
    post.likedByMe,
    post.favoritedByMe,
    post.likeCount,
    post.favoriteCount,
  ]);

  const assist = useAIAssist();
  const registeredByKey = new Map(
    (agents || []).map(agent => [agent.key, agent]),
  );
  const agentTags = post.agentCapabilities
    .map(agentId => {
      const agent = ownedAgents.find(item => item.id === agentId);
      return agent
        ? {
            id: agent.id,
            name: agent.name,
            identity: registeredByKey.get(agent.id)?.identity || null,
            category: registeredByKey.get(agent.id)?.category,
          }
        : null;
    })
    .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));
  const colors = resolveStationColors(palette);
  const previewMedia = post.media.slice(0, 3);

  const toggleInteraction = (type: 'like' | 'favorite') => {
    if (interactionPending) return;
    const next = type === 'like' ? !liked : !favorited;
    const previous = { liked, favorited, likeCount, favoriteCount };
    if (type === 'like') {
      setLiked(next);
      setLikeCount(value => value + (next ? 1 : -1));
    } else {
      setFavorited(next);
      setFavoriteCount(value => value + (next ? 1 : -1));
    }
    setInteractionPending(true);
    onSetStationPostInteraction(post.id, type, next)
      .then(result => {
        setLiked(result.likedByMe);
        setFavorited(result.favoritedByMe);
        setLikeCount(result.likeCount);
        setFavoriteCount(result.favoriteCount);
      })
      .catch(error => {
        setLiked(previous.liked);
        setFavorited(previous.favorited);
        setLikeCount(previous.likeCount);
        setFavoriteCount(previous.favoriteCount);
        onActionError(error);
      })
      .finally(() => setInteractionPending(false));
  };

  const deletePost = () => {
    if (isDeleting) {
      return;
    }
    Alert.alert(
      textFor(language, '删除这条动态？', 'Delete this post?'),
      textFor(language, '删除后无法恢复。', 'This action cannot be undone.'),
      [
        { text: textFor(language, '取消', 'Cancel'), style: 'cancel' },
        {
          text: textFor(language, '删除', 'Delete'),
          style: 'destructive',
          onPress: () => {
            setIsDeleting(true);
            onDeletePost(post.id)
              .then(() =>
                onActionMessage(
                  textFor(language, '动态已删除', 'Post deleted'),
                ),
              )
              .catch(onActionError)
              .finally(() => setIsDeleting(false));
          },
        },
      ],
    );
  };

  const object: AIAssistObjectReference = {
    kind: 'station-post',
    id: post.id,
    title: textFor(language, '这条动态', 'This post'),
    metadata: {
      content: post.body,
      visibility: post.visibility,
      mediaCount: post.media.length,
    },
  };
  const actions: AIAssistAction[] = [
    ...(post.body
      ? [
          {
            direction: 'up' as const,
            label: textFor(language, '分享文字', 'Share text'),
            Icon: Share2,
            accent: colors.accent,
            onSelect: () => {
              Share.share({ message: post.body }).catch(onActionError);
            },
          },
        ]
      : []),
    {
      direction: 'right',
      label: textFor(language, '妙管家', 'Butler'),
      Icon: Bot,
      accent: colors.accent,
      onSelect: assist.askButler,
    },
    ...(post.body
      ? [
          {
            direction: 'down' as const,
            label: textFor(language, '复制文字', 'Copy text'),
            Icon: Copy,
            accent: colors.accent,
            onSelect: () => {
              Clipboard.setString(post.body);
              onActionMessage(
                textFor(language, '动态文字已复制', 'Post text copied'),
              );
            },
          },
        ]
      : []),
    {
      direction: 'left',
      label: textFor(language, '更多', 'More'),
      Icon: LayoutGrid,
      accent: colors.accent,
      onSelect: deletePost,
      available: !isDeleting,
    },
  ];

  return (
    <View style={[styles.stationFeedCard, { backgroundColor: colors.surface }]}>
      <View style={styles.stationFeedBody}>
        <View style={styles.stationFeedAuthorRow}>
          <View style={styles.stationFeedAuthorAvatar}>
            {renderUserAvatar({
              text: profile.avatarText,
              config: profile.avatarConfig,
              size: 34,
            })}
          </View>
          <View style={styles.stationFeedAuthorCopy}>
            <Text
              numberOfLines={1}
              style={[styles.stationFeedAuthorName, { color: colors.text }]}
            >
              {displayText(language, profile.nickname)}
            </Text>
            <Text
              numberOfLines={1}
              style={[
                styles.stationFeedAuthorMeta,
                { color: colors.secondaryText },
              ]}
            >
              {postMetaLine(post, language)}
            </Text>
          </View>
          <Text
            style={[
              styles.stationFeedKindPill,
              { backgroundColor: colors.soft, color: colors.accent },
            ]}
          >
            {postKindLabel(post, language)}
          </Text>
        </View>

        <AIAssistGestureSurface
          object={object}
          actions={actions}
          palette={palette}
          testID={`station-post-assist-${post.id}`}
          style={styles.stationFeedContextContent}
        >
          {post.body ? (
            <Text style={[styles.stationFeedBodyText, { color: colors.text }]}>
              {post.body}
            </Text>
          ) : null}

          {agentTags.length ? (
            <View style={styles.stationFeedAgents}>
              {agentTags.map(agent => (
                <View
                  key={agent.id}
                  style={[
                    styles.stationFeedAgentChip,
                    { backgroundColor: colors.soft },
                  ]}
                >
                  <AgentGlyphAvatar
                    agentId={agent.id}
                    category={agent.category}
                    identity={agent.identity}
                    size={20}
                  />
                  <Text
                    style={[
                      styles.stationFeedAgentText,
                      { color: colors.text },
                    ]}
                  >
                    {agent.name}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </AIAssistGestureSurface>
      </View>

      {post.media.length ? (
        <View style={styles.stationFeedMediaGrid}>
          {previewMedia.map((asset, index) => (
            <View
              key={asset.id}
              style={[
                styles.stationFeedMediaItem,
                post.media.length === 1 && styles.stationFeedMediaItemSingle,
                post.media.length === 2 && styles.stationFeedMediaItemDouble,
                { backgroundColor: colors.soft },
              ]}
            >
              {asset.kind === 'image' ? (
                <Image
                  resizeMode="cover"
                  source={{
                    uri: buildStationMediaFileUrl(asset.id),
                    headers: { Authorization: `Bearer ${token}` },
                  }}
                  style={styles.stationFeedMediaImage}
                />
              ) : (
                <View style={styles.stationFeedVideo}>
                  <View style={styles.stationFeedVideoPlay}>
                    <Play color="#FFFFFF" fill="#FFFFFF" size={21} />
                  </View>
                </View>
              )}
              {index === 2 && post.media.length > previewMedia.length ? (
                <View style={styles.stationFeedMediaMore}>
                  <Text style={styles.stationFeedMediaMoreText}>
                    +{post.media.length - previewMedia.length}
                  </Text>
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.stationFeedActions}>
        <PostMetricButton
          active={liked}
          icon={
            liked
              ? stationPostIconAssets.likeActive
              : stationPostIconAssets.likeInactive
          }
          label={textFor(language, '点赞', 'Like')}
          onPress={() => toggleInteraction('like')}
          palette={palette}
          value={likeCount}
        />
        <PostMetricButton
          active={favorited}
          icon={
            favorited
              ? stationPostIconAssets.favoriteActive
              : stationPostIconAssets.favoriteInactive
          }
          label={textFor(language, '收藏', 'Favorite')}
          onPress={() => toggleInteraction('favorite')}
          palette={palette}
          value={favoriteCount}
        />
        <PostMetric
          icon={stationPostIconAssets.comment}
          palette={palette}
          value={post.commentCount}
        />
      </View>
    </View>
  );
}

function PostMetric({
  icon,
  palette,
  value,
}: {
  icon: ImageSourcePropType;
  palette: Palette;
  value: number;
}) {
  const colors = resolveStationColors(palette);

  return (
    <View style={styles.stationFeedAction}>
      <Image
        resizeMode="contain"
        source={icon}
        style={styles.stationFeedActionIcon}
      />
      <Text
        style={[styles.stationFeedActionText, { color: colors.secondaryText }]}
      >
        {value || ''}
      </Text>
    </View>
  );
}

function PostMetricButton({
  active,
  icon,
  label,
  onPress,
  palette,
  value,
}: {
  active: boolean;
  icon: ImageSourcePropType;
  label: string;
  onPress: () => void;
  palette: Palette;
  value: number;
}) {
  // The prototype defines no like animation, so this is our own lightweight
  // feedback: the button dips and its plate fills while pressed (`aria-pressed`
  // in the prototype is the `#fff0f2` plate).
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) =>
    Animated.timing(scale, {
      toValue: to,
      duration: 120,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected: active }}
        onPress={onPress}
        onPressIn={() => press(0.94)}
        onPressOut={() => press(1)}
        style={({ pressed }) => [
          styles.stationFeedAction,
          (pressed || active) && styles.stationFeedActionPressed,
        ]}
      >
        <PostMetric icon={icon} palette={palette} value={value} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Prototype `me-post-kind` has exactly three values: 图文 / 视频 / 互动.
 * Polls are not implemented yet, so only the first two are reachable today.
 */
function postKindLabel(post: StationPostDTO, language: Language) {
  if (post.media[0]?.kind === 'video') {
    return textFor(language, '视频', 'Video');
  }
  return textFor(language, '图文', 'Post');
}

/** Prototype `me-post-author-copy span`: 「今天 10:32 · 上海」. */
function postMetaLine(post: StationPostDTO, language: Language) {
  return [
    formatPostDay(post.createdAt, language),
    formatPostClock(post.createdAt, language),
  ]
    .filter(Boolean)
    .join(' ')
    .concat(post.locationLabel ? ` · ${post.locationLabel}` : '');
}

function parsePostDate(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function formatPostDay(value: string | null | undefined, language: Language) {
  const date = parsePostDate(value);
  if (!date) {
    return '';
  }
  const today = new Date();
  const startOfToday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  );
  const startOfPostDay = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  const dayDifference = Math.round(
    (startOfToday.getTime() - startOfPostDay.getTime()) / 86_400_000,
  );
  if (dayDifference === 0) {
    return textFor(language, '今天', 'Today');
  }
  if (dayDifference === 1) {
    return textFor(language, '昨天', 'Yesterday');
  }
  return date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: language === 'zh' ? 'numeric' : 'short',
    day: 'numeric',
  });
}

function formatPostClock(value: string | null | undefined, language: Language) {
  const date = parsePostDate(value);
  if (!date) {
    return '';
  }
  return date.toLocaleTimeString(language === 'zh' ? 'zh-CN' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
