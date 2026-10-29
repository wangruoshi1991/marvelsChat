import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Circle,
  ChevronDown,
  ArrowLeft,
  Settings,
  type LucideIcon,
} from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

import { contactIconAssets } from '../assets/icons';
import { Language } from '../features/session/useMiaoxunSession';
import { textFor } from './i18n';
import { styles } from './styles';
import { isLightPalette, Palette, workspaceColors } from './theme';
import { isV6Palette } from './v6Palette';
import { isXunPalette } from './xunPalette';

export type IconComponent = LucideIcon;
export type RootTab = 'agents' | 'messages' | 'station';

function RootNavIcon({
  kind,
  color,
  strokeWidth,
}: {
  kind: 'home' | 'chat' | 'me';
  color: string;
  strokeWidth: number;
}) {
  return (
    <Svg height={27} viewBox="0 0 24 24" width={27}>
      {kind === 'home' ? (
        <Path
          d="M3 11 12 3l9 8M6 10v10h12V10M9 17h6"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      ) : kind === 'chat' ? (
        <>
          <Path
            d="M20 11a8 8 0 0 1-8 8H5l-3 2v-9a9 9 0 0 1 18-1Z"
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
          <Path
            d="M8 10v3m5-3v3"
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={strokeWidth}
          />
        </>
      ) : (
        <Path
          d="M5 15c4 5 10 4 14-1M7 5v3m9-3 3-1"
          fill="none"
          stroke={color}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={strokeWidth}
        />
      )}
    </Svg>
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
  const xun = isXunPalette(palette);
  return (
    <View
      style={[
        styles.chatHeader,
        xun && styles.chatHeaderXun,
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
        style={[styles.chatBackButton, xun && styles.chatBackButtonXun]}
      >
        {xun ? (
          <ArrowLeft color={palette.text} size={20} strokeWidth={1.8} />
        ) : (
          <Image
            source={contactIconAssets.back}
            resizeMode="contain"
            style={[styles.chatBackIcon, xun && styles.chatBackIconXun]}
          />
        )}
      </Pressable>
      <View style={styles.chatHeaderTitleWrap}>
        <Text
          style={[
            styles.chatHeaderTitle,
            xun && styles.chatHeaderTitleXun,
            { color: palette.text },
          ]}
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
            xun && styles.chatHeaderActionButtonXun,
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
  backAccessibilityLabel,
}: {
  palette: Palette;
  title: string;
  onBack: () => void;
  backAccessibilityLabel?: string;
}) {
  const xun = isXunPalette(palette);
  return (
    <View style={[styles.header, { borderBottomColor: palette.border }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={backAccessibilityLabel}
        onPress={onBack}
        style={[
          styles.backButton,
          xun ? styles.backButtonXun : { backgroundColor: palette.soft },
        ]}
      >
        {xun ? (
          <ArrowLeft color={palette.text} size={22} strokeWidth={1.8} />
        ) : (
          <ChevronDown color={palette.mint} size={22} strokeWidth={3} />
        )}
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
  const light = isLightPalette(palette);
  const v6 = isV6Palette(palette);
  const xun = isXunPalette(palette);
  const lightNav = v6 || xun;
  const backgroundColor = lightNav ? '#FFFFFF' : palette.surface;
  const color = lightNav
    ? '#080D12'
    : light
    ? workspaceColors.text
    : palette.text;
  const borderColor = lightNav
    ? '#DEE3E7'
    : light
    ? workspaceColors.border
    : palette.border;
  return (
    <View
      style={[
        navigationStyles.bar,
        {
          backgroundColor,
          borderTopColor: borderColor,
        },
      ]}
    >
      {(
        [
          {
            key: 'agents',
            label: textFor(language, '妙', 'Miao'),
            icon: 'home',
          },
          {
            key: 'messages',
            label: textFor(language, '讯', 'Chats'),
            icon: 'chat',
          },
          { key: 'station', label: textFor(language, '我', 'Me'), icon: 'me' },
        ] as const
      ).map(({ key, label, icon }) => {
        const selected = selectedTab === key;
        // Prototype `.tab[aria-selected="true"]`: the selected icon takes the
        // mint accent while its label stays ink; unselected icons sit on a pale
        // grey-green and their labels on muted grey. Colouring icon and label
        // the same dark ink (the earlier behaviour) is what made the bar read
        // flat compared with the design.
        const iconTint = selected
          ? lightNav
            ? '#00C7CB'
            : light
            ? '#35D5C6'
            : palette.mint
          : lightNav
          ? xun
            ? '#CCDDE4'
            : '#87939C'
          : light
          ? '#CBD9D5'
          : palette.secondaryText;
        const labelTint = selected
          ? color
          : lightNav
          ? xun
            ? '#666666'
            : '#87939C'
          : light
          ? '#8E9A97'
          : palette.secondaryText;
        return (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onSelectTab(key)}
            style={navigationStyles.tab}
          >
            <RootNavIcon
              kind={icon}
              color={iconTint}
              strokeWidth={selected ? 2.25 : 1.8}
            />
            <Text style={[navigationStyles.label, { color: labelTint }]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
const navigationStyles = StyleSheet.create({
  bar: {
    height: 89,
    minHeight: 89,
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    paddingHorizontal: 0,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 10,
    paddingBottom: 20,
  },
  label: { fontSize: 13, fontWeight: '600' },
});

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
