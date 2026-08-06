import React from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { QrCode } from 'lucide-react-native';

import { stationPostIconAssets } from '../../assets/icons';
import { AvatarConfigDTO } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { Language } from '../session/useMiaoxunSession';
import { ProfileRegionRow, Stat } from './StationShared';
import { StationTab } from './stationTypes';

export function StationProfileHeader({
  palette,
  language,
  isDark,
  nickname,
  aiId,
  avatarText,
  avatarConfig,
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
  onOpenSettings,
  onOpenPoints,
  onOpenLocation,
  onOpenSocial,
}: {
  palette: Palette;
  language: Language;
  isDark: boolean;
  nickname: string;
  aiId: string;
  avatarText: string;
  avatarConfig: AvatarConfigDTO;
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
  onOpenSettings: () => void;
  onOpenPoints: () => void;
  onOpenLocation: () => void;
  onOpenSocial: () => void;
}) {
  const textColor = isDark ? palette.text : '#000000';
  const secondaryTextColor = isDark
    ? palette.secondaryText
    : 'rgba(0,0,0,0.60)';
  const accentColor = isDark ? palette.mint : '#2012D9';
  const tagBackgroundColor = isDark ? palette.surface : '#F4F6FF';
  const tagBorderColor = isDark ? palette.border : '#DBE2FF';

  return (
    <View style={styles.stationProfileHeader}>
      <View style={styles.stationProfileHeroRow}>
        {renderUserAvatar({
          text: avatarText,
          config: avatarConfig,
          size: 76,
        })}
        <View style={styles.stationProfileStatsRow}>
          <Stat
            value={followingCount}
            label={textFor(language, '关注', 'Following')}
            palette={palette}
            textColor={textColor}
            secondaryTextColor={secondaryTextColor}
            onPress={onOpenSocial}
          />
          <Stat
            value={followersCount}
            label={textFor(language, '粉丝', 'Followers')}
            palette={palette}
            textColor={textColor}
            secondaryTextColor={secondaryTextColor}
            onPress={onOpenSocial}
          />
          <Stat
            value={likesCount + collectionsCount}
            label={textFor(language, '获赞与收藏', 'Likes & saves')}
            palette={palette}
            textColor={textColor}
            secondaryTextColor={secondaryTextColor}
          />
        </View>
        <Pressable
          accessibilityLabel={textFor(language, '设置', 'Settings')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenSettings}
          style={styles.stationSettingsButton}
        >
          <Image
            resizeMode="contain"
            source={stationPostIconAssets.more}
            style={[
              styles.stationSettingsIcon,
              isDark && { tintColor: palette.text },
            ]}
          />
        </Pressable>
      </View>

      <Text
        numberOfLines={1}
        style={[styles.profileName, { color: textColor }]}
      >
        {nickname}
      </Text>

      <View style={styles.stationAiIdRow}>
        <Pressable
          accessibilityLabel={textFor(language, '复制 AI ID', 'Copy AI ID')}
          accessibilityRole="button"
          onPress={onCopyAIID}
          style={styles.stationAiIdPressable}
        >
          <Text
            numberOfLines={1}
            style={[styles.profileMeta, { color: secondaryTextColor }]}
          >
            AI ID: {aiId}
          </Text>
        </Pressable>
        <Pressable
          accessibilityLabel={textFor(language, '我的二维码', 'My QR code')}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onShowQRCode}
          style={styles.stationQrButton}
        >
          <QrCode color={textColor} size={14} strokeWidth={2.1} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        onPress={onOpenPoints}
        style={[
          styles.profilePointsPill,
          {
            backgroundColor: tagBackgroundColor,
            borderColor: tagBorderColor,
          },
        ]}
      >
        <Text
          style={[styles.profilePointsLabel, { color: secondaryTextColor }]}
        >
          {textFor(language, '妙点', 'Points')}
        </Text>
        <Text style={[styles.profilePointsText, { color: textColor }]}>
          {miaoPoints}
        </Text>
        <Text style={[styles.profilePointsDetail, { color: accentColor }]}>
          {textFor(language, '明细', 'Details')}
        </Text>
      </Pressable>

      <ProfileRegionRow
        title={textFor(language, '我的社区', 'Community')}
        value={community}
        palette={palette}
        backgroundColor={tagBackgroundColor}
        borderColor={tagBorderColor}
        textColor={textColor}
        secondaryTextColor={secondaryTextColor}
        showChevron={false}
        onPress={onOpenLocation}
      />
      <ProfileRegionRow
        title={textFor(language, '我的活动区域', 'Activity Area')}
        value={activityArea}
        palette={palette}
        backgroundColor={tagBackgroundColor}
        borderColor={tagBorderColor}
        textColor={textColor}
        secondaryTextColor={secondaryTextColor}
        showChevron={false}
        onPress={onOpenLocation}
      />
    </View>
  );
}

export function StationTabs({
  palette,
  language,
  isDark,
  value,
  onChange,
}: {
  palette: Palette;
  language: Language;
  isDark: boolean;
  value: StationTab;
  onChange: (tab: StationTab) => void;
}) {
  const textColor = isDark ? palette.text : '#000000';
  const secondaryTextColor = isDark
    ? palette.secondaryText
    : 'rgba(0,0,0,0.60)';
  const tabs: Array<{ label: string; value: StationTab }> = [
    { label: textFor(language, '我的小站', 'Station'), value: 'station' },
    { label: textFor(language, '我的动态', 'Posts'), value: 'posts' },
    { label: textFor(language, 'AI伙伴', 'AI Partners'), value: 'agents' },
    { label: textFor(language, '社交网络', 'Social'), value: 'social' },
  ];

  return (
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
          >
            <Text
              numberOfLines={1}
              style={[
                styles.stationTabText,
                isSelected
                  ? styles.stationTabTextActive
                  : styles.stationTabTextInactive,
                {
                  color: isSelected ? textColor : secondaryTextColor,
                },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
