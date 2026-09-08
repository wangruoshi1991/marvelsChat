import type { LucideIcon } from 'lucide-react-native';
import {
  Award,
  CircleDot,
  Link2,
  MapPin,
  Network,
  QrCode,
  UserRound,
} from 'lucide-react-native';
import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { stationPostIconAssets } from '../../assets/icons';
import { AvatarConfigDTO, PublicPresenceStatus } from '../../models/api';
import { publicPresenceText, textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { Language } from '../session/useMiaoxunSession';
import { resolveStationColors } from './stationTheme';
import { StationTab } from './stationTypes';

export function StationProfileHeader({
  palette,
  language,
  nickname,
  aiId,
  avatarText,
  avatarConfig,
  bio,
  presenceStatus,
  followingCount,
  followersCount,
  likesCount,
  collectionsCount,
  miaoPoints,
  community,
  activityArea,
  renderUserAvatar,
  onCopyAIID,
  onShowQRCode,
  onOpenPoints,
  onOpenLocation,
  onOpenSocial,
}: {
  palette: Palette;
  language: Language;
  nickname: string;
  aiId: string;
  avatarText: string;
  avatarConfig: AvatarConfigDTO;
  bio: string;
  presenceStatus?: PublicPresenceStatus;
  followingCount: number;
  followersCount: number;
  likesCount: number;
  collectionsCount: number;
  miaoPoints: number;
  community: string;
  activityArea: string;
  renderUserAvatar: UserAvatarRenderer;
  onCopyAIID: () => void;
  onShowQRCode: () => void;
  onOpenPoints: () => void;
  onOpenLocation: () => void;
  onOpenSocial: () => void;
}) {
  const colors = resolveStationColors(palette);
  const textColor = colors.text;
  const secondaryTextColor = colors.secondaryText;
  const isOnline = presenceStatus === 'online';
  const tags = [community, activityArea].filter(Boolean);

  return (
    <View
      style={[styles.stationIdentityCard, { backgroundColor: colors.surface }]}
    >
      <View style={styles.stationIdentityTopRow}>
        <View style={styles.stationIdentityAvatar}>
          {renderUserAvatar({
            text: avatarText,
            config: avatarConfig,
            size: 64,
          })}
        </View>
        <View style={styles.stationIdentityCopy}>
          <Text
            numberOfLines={1}
            style={[styles.stationIdentityName, { color: textColor }]}
          >
            {nickname}
          </Text>
          <View style={styles.stationIdentityIdRow}>
            <Pressable
              accessibilityLabel={textFor(language, '复制 AI ID', 'Copy AI ID')}
              accessibilityRole="button"
              onPress={onCopyAIID}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.stationIdentityId,
                  { color: secondaryTextColor },
                ]}
              >
                @{aiId}
              </Text>
            </Pressable>
            <Pressable
              accessibilityLabel={textFor(language, '我的二维码', 'My QR code')}
              accessibilityRole="button"
              hitSlop={8}
              onPress={onShowQRCode}
              style={styles.stationIdentityQr}
            >
              <QrCode color={secondaryTextColor} size={14} strokeWidth={2} />
            </Pressable>
          </View>
          <View style={styles.stationIdentityPresenceRow}>
            <View
              style={[
                styles.stationIdentityPresenceDot,
                isOnline
                  ? styles.stationIdentityPresenceDotOnline
                  : styles.stationIdentityPresenceDotOffline,
              ]}
            />
            <Text
              style={[
                styles.stationIdentityPresenceText,
                { color: secondaryTextColor },
                isOnline && styles.stationIdentityPresenceTextOnline,
              ]}
            >
              {publicPresenceText(language, presenceStatus)}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.stationIdentityStats}>
        <IdentityStat
          label={textFor(language, '关注', 'Following')}
          value={followingCount}
          textColor={textColor}
          secondaryTextColor={secondaryTextColor}
          onPress={onOpenSocial}
        />
        <IdentityStat
          label={textFor(language, '粉丝', 'Followers')}
          value={followersCount}
          textColor={textColor}
          secondaryTextColor={secondaryTextColor}
          onPress={onOpenSocial}
        />
        <IdentityStat
          label={textFor(language, '获赞与收藏', 'Likes & saves')}
          value={likesCount + collectionsCount}
          textColor={textColor}
          secondaryTextColor={secondaryTextColor}
        />
      </View>

      {bio ? (
        <Text style={[styles.stationIdentityBio, { color: textColor }]}>
          {bio}
        </Text>
      ) : null}

      <View style={styles.stationIdentityTags}>
        {tags.map(tag => (
          <Pressable
            accessibilityRole="button"
            key={tag}
            onPress={onOpenLocation}
            style={[
              styles.stationIdentityTag,
              {
                backgroundColor: colors.soft,
                borderColor: colors.chipBorder,
              },
            ]}
          >
            <MapPin color={secondaryTextColor} size={12} strokeWidth={2} />
            <Text
              numberOfLines={1}
              style={[
                styles.stationIdentityTagText,
                { color: secondaryTextColor },
              ]}
            >
              {tag}
            </Text>
          </Pressable>
        ))}
        <Pressable
          accessibilityRole="button"
          onPress={onOpenPoints}
          style={[
            styles.stationIdentityTag,
            {
              backgroundColor: colors.soft,
              borderColor: colors.chipBorder,
            },
          ]}
        >
          <Text
            style={[
              styles.stationIdentityTagText,
              { color: secondaryTextColor },
            ]}
          >
            {textFor(language, `妙点 ${miaoPoints}`, `${miaoPoints} points`)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function IdentityStat({
  label,
  value,
  textColor,
  secondaryTextColor,
  onPress,
}: {
  label: string;
  value: number;
  textColor: string;
  secondaryTextColor: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={[styles.stationIdentityStatValue, { color: textColor }]}>
        {formatCompactNumber(value)}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.stationIdentityStatLabel, { color: secondaryTextColor }]}
      >
        {label}
      </Text>
    </>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={styles.stationIdentityStat}
    >
      {content}
    </Pressable>
  ) : (
    <View style={styles.stationIdentityStat}>{content}</View>
  );
}

function formatCompactNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Number.isFinite(value) ? value : 0);
}

export function StationTabs({
  palette,
  language,
  value,
  onChange,
  onOpenSettings,
}: {
  palette: Palette;
  language: Language;
  value: StationTab;
  onChange: (tab: StationTab) => void;
  onOpenSettings: () => void;
}) {
  const colors = resolveStationColors(palette);
  const textColor = colors.text;
  const secondaryTextColor = colors.isLight
    ? 'rgba(0,0,0,0.52)'
    : colors.secondaryText;
  const tabs: Array<{
    Icon: LucideIcon;
    label: string;
    value: StationTab;
  }> = [
    {
      Icon: UserRound,
      label: textFor(language, '第一面', 'Front'),
      value: 'station',
    },
    {
      Icon: CircleDot,
      label: textFor(language, '生活', 'Life'),
      value: 'posts',
    },
    {
      Icon: Award,
      label: textFor(language, '成果', 'Outcomes'),
      value: 'outcomes',
    },
    {
      Icon: Network,
      label: textFor(language, '生态', 'Ecosystem'),
      value: 'agents',
    },
    { Icon: Link2, label: textFor(language, '其他', 'More'), value: 'social' },
  ];

  return (
    <View style={styles.stationNavRow}>
      <View accessibilityRole="tablist" style={styles.stationTabs}>
        {tabs.map(tab => {
          const isSelected = tab.value === value;
          return (
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: isSelected }}
              key={tab.value}
              onPress={() => onChange(tab.value)}
              style={styles.stationTabButton}
              testID={`station-tab-${tab.value}`}
            >
              <View style={styles.stationTabLabelRow}>
                <tab.Icon
                  color={isSelected ? textColor : secondaryTextColor}
                  size={12}
                  strokeWidth={isSelected ? 2.4 : 1.9}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.stationTabText,
                    isSelected
                      ? styles.stationTabTextActive
                      : styles.stationTabTextInactive,
                    { color: isSelected ? textColor : secondaryTextColor },
                  ]}
                >
                  {tab.label}
                </Text>
              </View>
              {isSelected ? <View style={styles.stationTabIndicator} /> : null}
            </Pressable>
          );
        })}
      </View>
      <Pressable
        accessibilityLabel={textFor(language, '设置', 'Settings')}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onOpenSettings}
        style={styles.stationNavSettings}
      >
        <Image
          resizeMode="contain"
          source={stationPostIconAssets.more}
          style={[
            styles.stationNavSettingsIcon,
            !colors.isLight && { tintColor: textColor },
          ]}
        />
      </Pressable>
    </View>
  );
}
