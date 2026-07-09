import React from 'react';
import { Pressable, Text, View } from 'react-native';
import {
  ChevronDown,
  ChevronLeft,
  MessageCircle,
  UserCircle,
  type LucideIcon,
} from 'lucide-react-native';

import { Language } from '../features/session/useMiaoxunSession';
import { textFor } from './i18n';
import { styles } from './styles';
import { Palette } from './theme';

export type IconComponent = LucideIcon;
export type RootTab = 'messages' | 'station';

export function IconButton({
  icon: Icon,
  palette,
  variant,
  onPress,
}: {
  icon: IconComponent;
  palette: Palette;
  variant: 'soft' | 'surface';
  onPress?: () => void;
}) {
  const buttonStyle =
    variant === 'soft'
      ? [
          styles.iconButton,
          styles.iconButtonBorderless,
          { backgroundColor: palette.soft },
        ]
      : [
          styles.iconButton,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ];

  return (
    <Pressable onPress={onPress} style={buttonStyle}>
      <Icon color={palette.text} size={19} strokeWidth={2.4} />
    </Pressable>
  );
}

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
                <View style={[styles.segmentBadge, { backgroundColor: palette.rose }]}>
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
  onBack,
  onOpenProfile,
}: {
  palette: Palette;
  language: Language;
  title: string;
  onBack: () => void;
  onOpenProfile?: () => void;
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
        style={[
          styles.chatBackButton,
          { backgroundColor: palette.surface, borderColor: palette.border },
        ]}
      >
        <ChevronLeft color={palette.mint} size={24} strokeWidth={3} />
      </Pressable>
      <Text
        style={[styles.chatHeaderTitle, { color: palette.text }]}
        numberOfLines={1}
      >
        {title}
      </Text>
      {onOpenProfile ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={textFor(language, '查看主页', 'View profile')}
          hitSlop={10}
          onPress={onOpenProfile}
          style={[
            styles.chatHeaderProfileButton,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <UserCircle color={palette.mint} size={22} strokeWidth={2.5} />
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
}: {
  palette: Palette;
  language: Language;
  selectedTab: RootTab;
  onSelectTab: (tab: RootTab) => void;
}) {
  return (
    <View
      style={[
        styles.bottomBar,
        { backgroundColor: palette.surface, borderTopColor: palette.border },
      ]}
    >
      <TabButton
        title={textFor(language, '妙讯', 'Messages')}
        icon={MessageCircle}
        selected={selectedTab === 'messages'}
        palette={palette}
        onPress={() => onSelectTab('messages')}
      />
      <TabButton
        title={textFor(language, '小站', 'Station')}
        icon={UserCircle}
        selected={selectedTab === 'station'}
        palette={palette}
        onPress={() => onSelectTab('station')}
      />
    </View>
  );
}

function TabButton({
  title,
  icon: Icon,
  selected,
  palette,
  onPress,
}: {
  title: string;
  icon: IconComponent;
  selected: boolean;
  palette: Palette;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.tabButton}>
      <Icon
        color={selected ? palette.mint : palette.secondaryText}
        size={20}
        strokeWidth={2.4}
      />
      <Text
        style={[
          styles.tabTitle,
          { color: selected ? palette.mint : palette.secondaryText },
        ]}
      >
        {title}
      </Text>
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
