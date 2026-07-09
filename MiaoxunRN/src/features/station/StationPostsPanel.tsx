import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { StationContentDTO } from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import { StationCreateKind } from './stationTypes';
import { buildStationTimeline, StationTimelineItem } from './stationTimeline';

export function StationPostsPanel({
  palette,
  language,
  stationContent,
  token,
  onOpenCreateSheet,
  onOpenDiaryDetail,
  onOpenAlbumDetail,
}: {
  palette: Palette;
  language: Language;
  stationContent: StationContentDTO;
  token: string;
  onOpenCreateSheet: (kind: StationCreateKind) => void;
  onOpenDiaryDetail: (entryId: string) => void;
  onOpenAlbumDetail: (albumId: string) => void;
}) {
  const timeline = buildStationTimeline(stationContent);

  if (!timeline.length) {
    return (
      <View style={styles.stationPanelStack}>
        <View
          style={[
            styles.stationPostCard,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <View style={styles.stationPostMeta}>
            <Text style={[styles.stationPostType, { color: palette.text }]}>
              {textFor(language, '我的动态', 'Activity')}
            </Text>
          </View>
          <Text style={[styles.stationPostBody, { color: palette.text }]}>
            {textFor(
              language,
              '写日记、创建相册或保存穿搭后，这里会自动生成真实动态。',
              'Create diaries, albums, or outfits to build a real activity feed.',
            )}
          </Text>
          <View style={styles.stationPostActionRow}>
            <PostActionButton
              palette={palette}
              title={textFor(language, '写日记', 'Diary')}
              onPress={() => onOpenCreateSheet('diary')}
            />
            <PostActionButton
              palette={palette}
              title={textFor(language, '建相册', 'Album')}
              onPress={() => onOpenCreateSheet('album')}
            />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stationPanelStack}>
      {timeline.slice(0, 20).map(item => (
        <TimelineCard
          key={item.id}
          item={item}
          palette={palette}
          language={language}
          token={token}
          onOpenDiaryDetail={onOpenDiaryDetail}
          onOpenAlbumDetail={onOpenAlbumDetail}
        />
      ))}
    </View>
  );
}

function TimelineCard({
  item,
  palette,
  language,
  token,
  onOpenDiaryDetail,
  onOpenAlbumDetail,
}: {
  item: StationTimelineItem;
  palette: Palette;
  language: Language;
  token: string;
  onOpenDiaryDetail: (entryId: string) => void;
  onOpenAlbumDetail: (albumId: string) => void;
}) {
  const type = timelineTitle(item, language);
  const title = timelineContentTitle(item, language);
  const body = timelineBody(item, language);
  const openItem = () => {
    if (item.kind === 'diary') {
      onOpenDiaryDetail(item.diary.id);
      return;
    }
    if (item.kind === 'album') {
      onOpenAlbumDetail(item.album.id);
      return;
    }
    if (item.kind === 'media' && item.album) {
      onOpenAlbumDetail(item.album.id);
    }
  };
  const isOpenable =
    item.kind === 'diary' ||
    item.kind === 'album' ||
    (item.kind === 'media' && Boolean(item.album));

  return (
    <Pressable
      accessibilityRole={isOpenable ? 'button' : undefined}
      disabled={!isOpenable}
      onPress={openItem}
      style={[
        styles.stationPostCard,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <View style={styles.stationPostMeta}>
        <Text style={[styles.stationPostType, { color: palette.text }]}>
          {type}
        </Text>
        <Text
          style={[styles.stationPostTime, { color: palette.secondaryText }]}
        >
          {formatTimelineTime(item.createdAt, language)}
        </Text>
      </View>
      <Text style={[styles.stationPostTitle, { color: palette.text }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[styles.stationPostBody, { color: palette.text }]}>
          {body}
        </Text>
      ) : null}
      {item.kind === 'media' && item.media.status === 'uploaded' ? (
        <Image
          resizeMode="cover"
          source={{
            uri: buildStationMediaFileUrl(item.media.id),
            headers: { Authorization: `Bearer ${token}` },
          }}
          style={styles.stationPostImage}
        />
      ) : null}
      {item.kind === 'media' && item.media.status === 'pending_upload' ? (
        <View
          style={[
            styles.stationPostMediaPlaceholder,
            { backgroundColor: palette.soft },
          ]}
        >
          <Text
            style={[
              styles.stationPostMediaText,
              { color: palette.secondaryText },
            ]}
          >
            {textFor(language, '照片上传中', 'Photo uploading')}
          </Text>
        </View>
      ) : null}
      <Text
        style={[
          styles.stationPostFooter,
          { borderTopColor: palette.border, color: palette.secondaryText },
        ]}
      >
        {timelineMeta(item, language)}
      </Text>
    </Pressable>
  );
}

function PostActionButton({
  palette,
  title,
  onPress,
}: {
  palette: Palette;
  title: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[styles.stationPostAction, { backgroundColor: palette.soft }]}
    >
      <Text style={[styles.stationPostActionText, { color: palette.text }]}>
        {title}
      </Text>
    </Pressable>
  );
}

function timelineTitle(item: StationTimelineItem, language: Language) {
  if (item.kind === 'diary') {
    return textFor(language, '日记', 'Diary');
  }
  if (item.kind === 'album') {
    return textFor(language, '相册', 'Album');
  }
  if (item.kind === 'outfit') {
    return textFor(language, '穿搭', 'Outfit');
  }
  return textFor(language, '照片', 'Photo');
}

function timelineBody(item: StationTimelineItem, language: Language) {
  if (item.kind === 'diary') {
    return item.diary.body;
  }
  if (item.kind === 'album') {
    return item.album.description || '';
  }
  if (item.kind === 'outfit') {
    return (
      item.outfit.note ||
      textFor(
        language,
        '已保存当前形象配置快照',
        'Saved current avatar snapshot',
      )
    );
  }
  if (item.album) {
    return textFor(
      language,
      `上传到《${item.album.title}》`,
      `Uploaded to ${item.album.title}`,
    );
  }
  return item.media.caption;
}

function timelineContentTitle(item: StationTimelineItem, language: Language) {
  if (item.kind === 'diary') {
    return item.diary.title || textFor(language, '今天的日记', "Today's diary");
  }
  if (item.kind === 'album') {
    return item.album.title;
  }
  if (item.kind === 'outfit') {
    return item.outfit.title || textFor(language, '今日穿搭', 'OOTD');
  }
  if (item.album) {
    return item.album.title;
  }
  return textFor(language, '新照片', 'New photo');
}

function timelineMeta(item: StationTimelineItem, language: Language) {
  if (item.kind === 'media') {
    return item.media.status === 'uploaded'
      ? textFor(language, '已上传', 'Uploaded')
      : textFor(language, '等待上传完成', 'Waiting for upload');
  }
  const visibility =
    item.kind === 'diary'
      ? item.diary.visibility
      : item.kind === 'album'
      ? item.album.visibility
      : item.outfit.visibility;
  if (visibility === 'public') {
    return textFor(language, '公开可见', 'Public');
  }
  if (visibility === 'friends') {
    return textFor(language, '好友可见', 'Friends');
  }
  return textFor(language, '仅自己可见', 'Private');
}

function formatTimelineTime(
  value: string | null | undefined,
  language: Language,
) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
