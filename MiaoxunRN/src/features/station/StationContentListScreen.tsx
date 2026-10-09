import { Pencil, Plus } from 'lucide-react-native';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import { contactIconAssets } from '../../assets/icons';
import {
  StationAlbumDTO,
  StationDiaryEntryDTO,
  StationMediaAssetDTO,
} from '../../models/api';
import { buildStationMediaFileUrl } from '../../services/stationMediaUrl';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { Language } from '../session/useMiaoxunSession';
import type {
  StationContentListKind,
  StationManageTarget,
} from './stationTypes';

const swipeOpenThreshold = -72;

export function StationContentListScreen({
  kind,
  palette,
  language,
  token,
  diaryEntries,
  albums,
  mediaAssets,
  onBack,
  onCreate,
  onOpen,
  onEdit,
}: {
  kind: StationContentListKind;
  palette: Palette;
  language: Language;
  token: string;
  diaryEntries: StationDiaryEntryDTO[];
  albums: StationAlbumDTO[];
  mediaAssets: StationMediaAssetDTO[];
  onBack: () => void;
  onCreate: () => void;
  onOpen: (target: StationManageTarget) => void;
  onEdit: (target: StationManageTarget) => void;
}) {
  const items = kind === 'diary' ? diaryEntries : albums;
  const [filter, setFilter] = useState<'all' | 'month' | 'earlier'>('all');
  const title =
    kind === 'diary'
      ? textFor(language, '个人日记', 'Personal Diary')
      : textFor(language, '个人相册', 'Albums');
  const groups = useMemo(
    () => groupContentByMonth(items, filter, language),
    [filter, items, language],
  );

  return (
    <View
      accessibilityViewIsModal
      style={[
        styles.stationContentListScreen,
        { backgroundColor: palette.background },
      ]}
    >
      <View
        style={[
          styles.stationContentListHeader,
          {
            backgroundColor: palette.surface,
            borderBottomColor: palette.border,
          },
        ]}
      >
        <Pressable
          accessibilityLabel={textFor(language, '返回', 'Back')}
          accessibilityRole="button"
          onPress={onBack}
          style={styles.stationEditorHeaderSide}
        >
          <Image
            resizeMode="contain"
            source={contactIconAssets.back}
            style={styles.stationEditorBackIcon}
          />
        </Pressable>
        <Text
          numberOfLines={1}
          style={[styles.stationEditorHeaderTitle, { color: palette.text }]}
        >
          {title}
        </Text>
        <View style={styles.stationEditorHeaderSide}>
          <Pressable
            accessibilityLabel={
              kind === 'diary'
                ? textFor(language, '新建日记', 'New diary')
                : textFor(language, '新建相册', 'New album')
            }
            accessibilityRole="button"
            onPress={onCreate}
            style={[
              styles.stationContentListAdd,
              { backgroundColor: palette.soft },
            ]}
          >
            <Plus color={palette.text} size={19} strokeWidth={2.4} />
          </Pressable>
        </View>
      </View>

      <View
        style={[
          styles.stationContentFilters,
          { backgroundColor: palette.surface },
        ]}
      >
        {contentFilterOptions(language).map(option => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: filter === option.value }}
            key={option.value}
            onPress={() => setFilter(option.value)}
            style={[
              styles.stationContentFilter,
              filter === option.value && styles.stationContentFilterSelected,
            ]}
          >
            <Text
              style={[
                styles.stationContentFilterText,
                filter === option.value
                  ? styles.stationContentFilterTextSelected
                  : { color: palette.secondaryText },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.stationContentListBody}>
        {groups.length ? (
          groups.map(group => (
            <View key={group.key} style={styles.stationContentMonthGroup}>
              <Text
                style={[
                  styles.stationContentMonthTitle,
                  { color: palette.secondaryText },
                ]}
              >
                {group.label}
              </Text>
              <View style={styles.stationContentMonthItems}>
                {group.items.map(item => (
                  <StationContentSwipeRow
                    key={item.id}
                    kind={kind}
                    item={item}
                    language={language}
                    mediaAssets={mediaAssets}
                    onOpen={() => onOpen({ kind, id: item.id })}
                    onEdit={() => onEdit({ kind, id: item.id })}
                    palette={palette}
                    token={token}
                  />
                ))}
              </View>
            </View>
          ))
        ) : (
          <View
            style={[
              styles.stationContentListEmpty,
              { backgroundColor: palette.surface },
            ]}
          >
            <Text
              style={[
                styles.stationContentListEmptyTitle,
                { color: palette.text },
              ]}
            >
              {items.length === 0
                ? kind === 'diary'
                  ? textFor(language, '暂无日记', 'No diaries yet')
                  : textFor(language, '暂无相册', 'No albums yet')
                : textFor(
                    language,
                    '这个时间段没有内容',
                    'No content in this period',
                  )}
            </Text>
            <Text
              style={[
                styles.stationContentListEmptyBody,
                { color: palette.secondaryText },
              ]}
            >
              {items.length === 0
                ? kind === 'diary'
                  ? textFor(
                      language,
                      '新建后的日记会显示在这里。',
                      'New diaries will appear here.',
                    )
                  : textFor(
                      language,
                      '新建后的相册会显示在这里。',
                      'New albums will appear here.',
                    )
                : textFor(
                    language,
                    '切换时间范围查看其他内容。',
                    'Choose another time range.',
                  )}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function StationContentSwipeRow({
  kind,
  item,
  palette,
  language,
  token,
  mediaAssets,
  onOpen,
  onEdit,
}: {
  kind: StationContentListKind;
  item: StationDiaryEntryDTO | StationAlbumDTO;
  palette: Palette;
  language: Language;
  token: string;
  mediaAssets: StationMediaAssetDTO[];
  onOpen: () => void;
  onEdit: () => void;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const openedRef = useRef(false);
  const windowSize = useWindowDimensions();

  const resetPosition = useCallback(() => {
    Animated.spring(translateX, {
      toValue: 0,
      useNativeDriver: true,
      speed: 22,
      bounciness: 6,
    }).start();
  }, [translateX]);

  const editFromSwipe = useCallback(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    Animated.timing(translateX, {
      toValue: -Math.max(windowSize.width, 320),
      duration: 180,
      useNativeDriver: true,
    }).start(() => {
      onEdit();
      translateX.setValue(0);
      openedRef.current = false;
    });
  }, [onEdit, translateX, windowSize.width]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          gesture.dx < -8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.35,
        onPanResponderMove: (_event, gesture) => {
          translateX.setValue(
            Math.max(
              Math.min(gesture.dx, 0),
              -Math.max(windowSize.width, 320) * 0.46,
            ),
          );
        },
        onPanResponderRelease: (_event, gesture) => {
          if (
            (gesture.dx <= swipeOpenThreshold || gesture.vx <= -0.55) &&
            Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
          ) {
            editFromSwipe();
            return;
          }
          resetPosition();
        },
        onPanResponderTerminate: resetPosition,
      }),
    [editFromSwipe, resetPosition, translateX, windowSize.width],
  );

  const album = kind === 'album' ? (item as StationAlbumDTO) : null;
  const diary = kind === 'diary' ? (item as StationDiaryEntryDTO) : null;
  const cover = album
    ? mediaAssets.find(
        asset =>
          asset.albumId === album.id &&
          asset.kind === 'image' &&
          asset.status === 'uploaded',
      )
    : null;

  return (
    <View
      style={[
        styles.stationContentSwipeTrack,
        { backgroundColor: palette.mint },
      ]}
    >
      <View pointerEvents="none" style={styles.stationContentSwipeAction}>
        <Pencil color="#FFFFFF" size={20} strokeWidth={2.4} />
        <Text style={styles.stationContentSwipeActionText}>
          {textFor(language, '编辑', 'Edit')}
        </Text>
      </View>
      <Animated.View
        {...panResponder.panHandlers}
        style={{ transform: [{ translateX }] }}
      >
        <Pressable
          accessibilityHint={textFor(
            language,
            '点按查看详情，向左滑动编辑',
            'Tap to view or swipe left to edit',
          )}
          accessibilityLabel={item.title}
          accessibilityRole="button"
          onPress={onOpen}
          style={[
            styles.stationContentListRow,
            { backgroundColor: palette.surface },
          ]}
        >
          {album ? (
            <View
              style={[
                styles.stationContentListCover,
                { backgroundColor: palette.soft },
              ]}
            >
              {cover ? (
                <Image
                  resizeMode="cover"
                  source={{
                    headers: { Authorization: `Bearer ${token}` },
                    uri: buildStationMediaFileUrl(cover.id),
                  }}
                  style={styles.stationContentListCoverImage}
                />
              ) : (
                <Text
                  style={[
                    styles.stationContentListCoverText,
                    { color: palette.secondaryText },
                  ]}
                >
                  册
                </Text>
              )}
            </View>
          ) : null}
          <View style={styles.stationContentListCopy}>
            <Text
              numberOfLines={1}
              style={[styles.stationContentListTitle, { color: palette.text }]}
            >
              {item.title}
            </Text>
            <Text
              numberOfLines={2}
              style={[
                styles.stationContentListSummary,
                { color: palette.secondaryText },
              ]}
            >
              {diary
                ? diary.body
                : album?.description ||
                  textFor(language, '暂无描述', 'No description')}
            </Text>
            <Text
              style={[
                styles.stationContentListMeta,
                { color: palette.secondaryText },
              ]}
            >
              {contentMeta(kind, item, language)}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

type ContentItem = StationDiaryEntryDTO | StationAlbumDTO;

function groupContentByMonth(
  items: ContentItem[],
  filter: 'all' | 'month' | 'earlier',
  language: Language,
) {
  const now = new Date();
  const currentKey = `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(2, '0')}`;
  const filtered = items.filter(item => {
    const key = monthKey(item.createdAt || item.updatedAt);
    if (filter === 'month') return key === currentKey;
    if (filter === 'earlier') return Boolean(key && key !== currentKey);
    return true;
  });
  const groups = new Map<string, ContentItem[]>();
  for (const item of filtered) {
    const key = monthKey(item.createdAt || item.updatedAt) || 'unknown';
    groups.set(key, [...(groups.get(key) || []), item]);
  }
  return Array.from(groups.entries())
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([key, groupedItems]) => ({
      key,
      label: monthLabel(key, language),
      items: groupedItems,
    }));
}

const monthKey = (value?: string | null) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    '0',
  )}`;
};

const monthLabel = (key: string, language: Language) => {
  if (key === 'unknown') return textFor(language, '较早内容', 'Earlier');
  const [year, month] = key.split('-').map(Number);
  return language === 'zh'
    ? `${year} 年 ${month} 月`
    : new Date(year, month - 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      });
};

const contentFilterOptions = (language: Language) => [
  { label: textFor(language, '全部', 'All'), value: 'all' as const },
  { label: textFor(language, '本月', 'This Month'), value: 'month' as const },
  { label: textFor(language, '更早', 'Earlier'), value: 'earlier' as const },
];

function contentMeta(
  kind: StationContentListKind,
  item: StationDiaryEntryDTO | StationAlbumDTO,
  language: Language,
) {
  const visibility = {
    private: textFor(language, '仅自己', 'Private'),
    friends: textFor(language, '好友可见', 'Friends'),
    public: textFor(language, '公开', 'Public'),
  }[item.visibility];
  const count =
    kind === 'album'
      ? textFor(
          language,
          `${(item as StationAlbumDTO).mediaCount} 张照片`,
          `${(item as StationAlbumDTO).mediaCount} photos`,
        )
      : null;
  const dateValue = item.updatedAt || item.createdAt;
  const date = dateValue ? new Date(dateValue) : null;
  const dateText =
    date && !Number.isNaN(date.getTime())
      ? date.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', {
          month: 'short',
          day: 'numeric',
        })
      : '';
  return [count, visibility, dateText].filter(Boolean).join(' · ');
}
