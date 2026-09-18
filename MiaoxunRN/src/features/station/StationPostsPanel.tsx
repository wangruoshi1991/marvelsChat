import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  type ImageSourcePropType,
  Pressable,
  Share,
  Text,
  View,
} from 'react-native';
import {
  Bot,
  Copy,
  LayoutGrid,
  MapPin,
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
  OwnedAgentDTO,
  ProfileDTO,
  StationContentDTO,
  StationPostDTO,
} from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { StationPageHeading } from './StationPageHeading';
import { resolveStationColors } from './stationTheme';

export function StationPostsPanel({
  palette,
  language,
  stationContent,
  profile,
  renderUserAvatar,
  ownedAgents,
  token,
  onDeletePost,
  onSetStationPostInteraction,
  onActionMessage,
  onActionError,
  onOpenPostComposer,
}: {
  palette: Palette;
  language: Language;
  stationContent: StationContentDTO;
  profile: ProfileDTO;
  renderUserAvatar: UserAvatarRenderer;
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
  onOpenPostComposer: () => void;
}) {
  const posts = stationContent.posts;
  const colors = resolveStationColors(palette);

  const composer = (
    <View
      style={[styles.stationLifeComposer, { backgroundColor: colors.surface }]}
    >
      <View style={styles.stationLifeComposerAvatar}>
        {renderUserAvatar({
          text: profile.avatarText,
          config: profile.avatarConfig,
          size: 46,
        })}
      </View>
      <View style={styles.stationLifeComposerCopy}>
        <Text style={[styles.stationLifeComposerTitle, { color: colors.text }]}>
          {textFor(language, '正在发生', 'Happening now')}
        </Text>
        <Text
          style={[
            styles.stationLifeComposerSubtitle,
            { color: colors.secondaryText },
          ]}
        >
          {textFor(language, '分享此刻的生活', 'Share what is happening')}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={textFor(language, '发布动态', 'New Post')}
        onPress={onOpenPostComposer}
        style={styles.stationLifeComposerButton}
      >
        <Image
          source={stationPostIconAssets.add}
          resizeMode="contain"
          style={styles.stationLifeComposerIcon}
        />
      </Pressable>
    </View>
  );
  const heading = (
    <StationPageHeading
      detail={textFor(language, '私人时间线', 'Private timeline')}
      palette={palette}
      title={textFor(language, '我的生活', 'My Life')}
      watermark="LIFE STREAM"
    />
  );

  if (!posts.length) {
    return (
      <View style={styles.stationFeedStack}>
        {heading}
        {composer}
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
      {heading}
      {composer}
      {posts.map(post => (
        <StationPostCard
          key={post.id}
          language={language}
          ownedAgents={ownedAgents}
          palette={palette}
          post={post}
          token={token}
          onActionError={onActionError}
          onActionMessage={onActionMessage}
          onDeletePost={onDeletePost}
          onSetStationPostInteraction={onSetStationPostInteraction}
        />
      ))}
    </View>
  );
}

function StationPostCard({
  language,
  ownedAgents,
  palette,
  post,
  token,
  onDeletePost,
  onSetStationPostInteraction,
  onActionMessage,
  onActionError,
}: {
  language: Language;
  ownedAgents: OwnedAgentDTO[];
  palette: Palette;
  post: StationPostDTO;
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
  const agentTags = post.agentCapabilities
    .map(agentId => {
      const agent = ownedAgents.find(item => item.id === agentId);
      return agent ? { id: agent.id, name: agent.name } : null;
    })
    .filter((agent): agent is { id: string; name: string } => Boolean(agent));
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
    <AIAssistGestureSurface
      object={object}
      actions={actions}
      palette={palette}
      testID={`station-post-assist-${post.id}`}
      style={[styles.stationFeedCard, { backgroundColor: colors.surface }]}
    >
      <View style={styles.stationFeedHeader}>
        <View style={styles.stationFeedDateCopy}>
          <Text
            numberOfLines={1}
            style={[styles.stationFeedDay, { color: colors.text }]}
          >
            {formatPostDay(post.createdAt, language)}
          </Text>
          <View style={styles.stationFeedMetaRow}>
            <View style={styles.stationFeedMetaItem}>
              <PostMetaIcon
                color={colors.secondaryText}
                source={stationPostIconAssets.time}
              />
              <Text
                style={[
                  styles.stationFeedMetaText,
                  { color: colors.secondaryText },
                ]}
              >
                {formatPostClock(post.createdAt, language)}
              </Text>
            </View>
            <View style={styles.stationFeedMetaItem}>
              <PostKindIcon
                color={colors.secondaryText}
                kind={post.media[0]?.kind || 'text'}
              />
              <Text
                style={[
                  styles.stationFeedMetaText,
                  { color: colors.secondaryText },
                ]}
              >
                {postKindLabel(post, language)}
              </Text>
            </View>
            {post.visibility !== 'public' ? (
              <Text
                style={[
                  styles.stationFeedMetaText,
                  { color: colors.secondaryText },
                ]}
              >
                {visibilityLabel(post, language)}
              </Text>
            ) : null}
          </View>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '更多', 'More')}
          disabled={isDeleting}
          onPress={event =>
            assist.open({
              object,
              actions,
              point: {
                x: event.nativeEvent.pageX,
                y: event.nativeEvent.pageY,
              },
            })
          }
          style={styles.stationFeedMore}
        >
          <Image
            resizeMode="contain"
            source={stationPostIconAssets.more}
            style={styles.stationFeedMoreIcon}
          />
        </Pressable>
      </View>

      {post.body ? (
        <Text style={[styles.stationFeedBody, { color: colors.text }]}>
          {post.body}
        </Text>
      ) : null}

      {post.locationLabel ? (
        <View style={styles.stationFeedLocation}>
          <MapPin color={colors.secondaryText} size={13} strokeWidth={2} />
          <Text
            numberOfLines={1}
            style={[
              styles.stationFeedLocationText,
              { color: colors.secondaryText },
            ]}
          >
            {post.locationLabel}
          </Text>
        </View>
      ) : null}

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
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.stationFeedVideoText,
                      { color: colors.secondaryText },
                    ]}
                  >
                    {textFor(language, '视频', 'Video')}
                  </Text>
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
              <Text
                style={[styles.stationFeedAgentText, { color: colors.text }]}
              >
                {agent.name}
              </Text>
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
    </AIAssistGestureSurface>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
    >
      <PostMetric icon={icon} palette={palette} value={value} />
    </Pressable>
  );
}

function visibilityLabel(post: StationPostDTO, language: Language) {
  if (post.visibility === 'friends') {
    return textFor(language, '好友可见', 'Friends');
  }
  if (post.visibility === 'private') {
    return textFor(language, '仅自己可见', 'Only Me');
  }
  return textFor(language, '公开', 'Public');
}

function PostKindIcon({
  color,
  kind,
}: {
  color: string;
  kind: 'image' | 'video' | 'text';
}) {
  if (kind === 'video') {
    return <PostMetaIcon color={color} source={stationPostIconAssets.video} />;
  }
  if (kind === 'image') {
    return <PostMetaIcon color={color} source={stationPostIconAssets.photo} />;
  }
  return <PostMetaIcon color={color} source={stationPostIconAssets.text} />;
}

function PostMetaIcon({
  color,
  source,
}: {
  color: string;
  source: ImageSourcePropType;
}) {
  return (
    <Image
      accessibilityIgnoresInvertColors
      resizeMode="contain"
      source={source}
      style={[styles.stationFeedMetaIcon, { tintColor: color }]}
    />
  );
}

function postKindLabel(post: StationPostDTO, language: Language) {
  if (post.media[0]?.kind === 'video') {
    return textFor(language, '视频', 'Video');
  }
  if (post.media.length) {
    return textFor(language, '照片', 'Photos');
  }
  return textFor(language, '文字', 'Text');
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
