import React from 'react';
import {
  Image,
  type ImageSourcePropType,
  Pressable,
  Text,
  View,
} from 'react-native';
import {
  Circle,
  ChevronDown,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';

import {
  contactIconAssets,
  messageIconAssets,
  stationPostIconAssets,
} from '../assets/icons';
import { Language } from '../features/session/useMiaoxunSession';
import { textFor } from './i18n';
import { styles } from './styles';
import { Palette, palettes } from './theme';

export type IconComponent = LucideIcon;
export type RootTab = 'messages' | 'station';

export function SegmentedControl<T extends string>({
  fill,
  palette,
  value,
  options,
  onChange,
}: {
  fill?: boolean;
  palette: Palette;
  value: T;
  options: Array<{ label: string; value: T; badge?: number }>;
  onChange: (value: T) => void;
}) {
  return (
    <View
      style={[
        styles.segment,
        fill && styles.segmentFill,
        { backgroundColor: palette.soft, borderColor: palette.border },
      ]}
    >
      {options.map(option => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[
              styles.segmentButton,
              selected && {
                backgroundColor: palette.surface,
                borderColor: palette.border,
              },
            ]}
          >
            <View style={styles.segmentLabelRow}>
              <Text
                style={[
                  styles.segmentText,
                  { color: selected ? palette.text : palette.secondaryText },
                ]}
              >
                {option.label}
              </Text>
              {option.badge && option.badge > 0 ? (
                <View
                  style={[
                    styles.segmentBadge,
                    { backgroundColor: palette.rose },
                  ]}
                >
                  <Text style={styles.segmentBadgeText}>
                    {option.badge > 99 ? '99+' : option.badge}
                  </Text>
                </View>
              ) : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function ChatHeader({
  palette,
  language,
  title,
  subtitle,
  subtitleStatus,
  onBack,
  onOpenSettings,
}: {
  palette: Palette;
  language: Language;
  title: string;
  subtitle?: string;
  subtitleStatus?: 'online' | 'offline';
  onBack: () => void;
  onOpenSettings?: () => void;
}) {
  return (
    <View
      style={[
        styles.chatHeader,
        {
          backgroundColor: palette.background,
          borderBottomColor: palette.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={textFor(language, '返回', 'Back')}
        hitSlop={10}
        onPress={onBack}
        style={styles.chatBackButton}
      >
        <Image
          source={contactIconAssets.back}
          resizeMode="contain"
          style={styles.chatBackIcon}
        />
      </Pressable>
      <View style={styles.chatHeaderTitleWrap}>
        <Text
          style={[styles.chatHeaderTitle, { color: palette.text }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        {subtitle ? (
          <View style={styles.chatHeaderSubtitleRow}>
            {subtitleStatus ? (
              <Circle
                color={subtitleStatus === 'online' ? '#34C759' : '#FF3B30'}
                fill={subtitleStatus === 'online' ? '#34C759' : '#FF3B30'}
                size={7}
                strokeWidth={0}
              />
            ) : null}
            <Text
              style={[
                styles.chatHeaderSubtitle,
                { color: palette.secondaryText },
              ]}
              numberOfLines={1}
            >
              {subtitle}
            </Text>
          </View>
        ) : null}
      </View>
      {onOpenSettings ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '聊天设置', 'Chat settings')}
          hitSlop={10}
          onPress={onOpenSettings}
          style={[
            styles.chatHeaderActionButton,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Settings color={palette.mint} size={21} strokeWidth={2.4} />
        </Pressable>
      ) : (
        <View style={styles.chatHeaderSpacer} />
      )}
    </View>
  );
}

export function SheetHeader({
  title,
  palette,
  onBack,
}: {
  title: string;
  palette: Palette;
  onBack: () => void;
}) {
  return (
    <View style={styles.settingsHeader}>
      <Pressable
        accessibilityLabel="返回"
        onPress={onBack}
        style={[
          styles.settingsDismissButton,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <ChevronDown color={palette.mint} size={22} strokeWidth={3} />
      </Pressable>
      <Text style={[styles.settingsLargeTitle, { color: palette.text }]}>
        {title}
      </Text>
    </View>
  );
}

export function Header({
  palette,
  title,
  onBack,
}: {
  palette: Palette;
  title: string;
  onBack: () => void;
}) {
  return (
    <View style={[styles.header, { borderBottomColor: palette.border }]}>
      <Pressable
        onPress={onBack}
        style={[styles.backButton, { backgroundColor: palette.soft }]}
      >
        <ChevronDown color={palette.mint} size={22} strokeWidth={3} />
      </Pressable>
      <Text style={[styles.headerTitle, { color: palette.text }]}>{title}</Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

export function BottomBar({
  palette,
  language,
  selectedTab,
  onSelectTab,
  onCreatePost,
}: {
  palette: Palette;
  language: Language;
  selectedTab: RootTab;
  onSelectTab: (tab: RootTab) => void;
  onCreatePost: () => void;
}) {
  const isLightPalette = palette.text === palettes.light.text;
  const bottomBarColors = isLightPalette
    ? { backgroundColor: '#FFFFFF', borderTopColor: '#F0EBFD' }
    : { backgroundColor: palette.surface, borderTopColor: palette.border };

  return (
    <View style={[styles.bottomBar, bottomBarColors]}>
      <TabButton
        title={textFor(language, '妙讯', 'Messages')}
        iconSource={
          selectedTab === 'messages'
            ? messageIconAssets.tabMessagesActive
            : stationPostIconAssets.tabMessagesInactive
        }
        selected={selectedTab === 'messages'}
        palette={palette}
        onPress={() => onSelectTab('messages')}
      />
      <View style={styles.bottomCreateSlot}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '发布动态', 'New Post')}
          onPress={onCreatePost}
          style={styles.bottomCreateButton}
        >
          <Image
            source={stationPostIconAssets.add}
            resizeMode="contain"
            style={styles.bottomCreateIcon}
          />
        </Pressable>
      </View>
      <TabButton
        title={textFor(language, '小站', 'Station')}
        iconSource={
          selectedTab === 'station'
            ? stationPostIconAssets.tabStationActive
            : messageIconAssets.tabStationInactive
        }
        selected={selectedTab === 'station'}
        palette={palette}
        onPress={() => onSelectTab('station')}
      />
    </View>
  );
}

function TabButton({
  title,
  iconSource,
  selected,
  palette,
  onPress,
}: {
  title: string;
  iconSource: ImageSourcePropType;
  selected: boolean;
  palette: Palette;
  onPress: () => void;
}) {
  const isLightPalette = palette.text === palettes.light.text;
  const titleColor = isLightPalette
    ? selected
      ? '#2A00FF'
      : '#CBC5DE'
    : selected
    ? palette.mint
    : palette.secondaryText;

  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={styles.tabButton}
    >
      <Image
        source={iconSource}
        style={[styles.tabIcon, !isLightPalette && { tintColor: titleColor }]}
        resizeMode="contain"
      />
      <Text style={[styles.tabTitle, { color: titleColor }]}>{title}</Text>
    </Pressable>
  );
}

export function MessageInlineAction({
  icon: Icon,
  title,
  palette,
  danger,
  onPress,
}: {
  icon?: IconComponent;
  title: string;
  palette: Palette;
  danger?: boolean;
  onPress: () => void;
}) {
  const color = danger ? '#dc2626' : palette.text;
  return (
    <Pressable onPress={onPress} style={styles.messageInlineAction}>
      {Icon ? <Icon color={color} size={17} strokeWidth={2.4} /> : null}
      <Text style={[styles.messageInlineActionText, { color }]}>{title}</Text>
    </Pressable>
  );
}
