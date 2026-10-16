import { Check, MapPin } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  Animated,
  Pressable,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';

import { AvatarConfigDTO, PublicPresenceStatus } from '../../models/api';
import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette } from '../../shared/theme';
import { UserAvatarRenderer } from '../messages/messageTypes';
import { Language } from '../session/useMiaoxunSession';
import { resolveStationColors } from './stationTheme';
import { StationTab } from './stationTypes';

/** Prototype `.me-profile` collapse transition: `.34s cubic-bezier(.2,.8,.2,1)`. */
export const STATION_COLLAPSE_DURATION = 340;

/**
 * Prototype `.me-profile`: the card holds exactly five items in the right
 * column — kicker, name, ID pill, bio, location — plus the 3D block on the
 * left and the online badge on its corner. QR, profile edit and tags are not
 * part of the card; their entries live in the page-level overflow menu.
 *
 * Collapsing animates this one card. `.me-profile.is-collapsed` keeps
 * `.me-avatar-wrap` as the *same* element and shrinks it to a 46px circle, so
 * the 3D stage is resized rather than swapped out — the WebView never reloads.
 */
export function StationProfileHeader({
  collapsed = false,
  collapseProgress,
  stage,
  palette,
  language,
  nickname,
  aiId,
  avatarText,
  avatarConfig,
  bio,
  presenceStatus,
  locationLabel,
  renderUserAvatar,
  onCopyAIID,
  onOpenLocation,
}: {
  /** `.me-profile.is-collapsed`: 64px card, 46px round avatar, name only. */
  collapsed?: boolean;
  /** 0 = expanded, 1 = collapsed; drives every geometry interpolation. */
  collapseProgress: Animated.Value;
  /** The 3D stage replaces the avatar cell inside the info card. */
  stage?: React.ReactNode;
  palette: Palette;
  language: Language;
  nickname: string;
  aiId: string;
  avatarText: string;
  avatarConfig: AvatarConfigDTO;
  bio: string;
  presenceStatus?: PublicPresenceStatus;
  /** Display region only (city / province); never a full street address. */
  locationLabel: string;
  renderUserAvatar: UserAvatarRenderer;
  onCopyAIID: () => void;
  onOpenLocation?: () => void;
}) {
  const colors = resolveStationColors(palette);
  const textColor = colors.text;
  const secondaryTextColor = colors.secondaryText;
  const isOnline = presenceStatus === 'online';
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  // Prototype `.me-profile { min-height: 35dvh }` and
  // `.me-avatar-wrap { height: min(25dvh, 220px) }`.
  const expandedCardMinHeight = windowHeight * 0.35;
  const expandedStageHeight = Math.min(windowHeight * 0.25, 220);
  const idLabel = aiIdLabel(aiId);

  // `.me-avatar-wrap` is 42% of the card's inner width when expanded and 46px
  // once collapsed, so the percentage is resolved against the measured row.
  const [rowWidth, setRowWidth] = useState(windowWidth - 64);
  const expandedStageWidth = Math.max(rowWidth * 0.42, 64);

  // Content unmounts only after the fade finishes, so collapsing reads as one
  // motion instead of a jump.
  const [detailMounted, setDetailMounted] = useState(true);
  useEffect(() => {
    if (!collapsed) {
      setDetailMounted(true);
      return;
    }
    // Unmount the detail rows only once the fade has finished.
    const timer = setTimeout(
      () => setDetailMounted(false),
      STATION_COLLAPSE_DURATION,
    );
    return () => clearTimeout(timer);
  }, [collapsed]);

  return (
    <Animated.View
      style={[
        styles.stationIdentityCard,
        {
          backgroundColor: colors.surface,
          borderRadius: collapseProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [12, 10],
          }),
          minHeight: collapseProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [expandedCardMinHeight, 64],
          }),
          paddingHorizontal: collapseProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [18, 12],
          }),
          paddingVertical: collapseProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [18, 8],
          }),
        },
      ]}
      testID="station-profile-card"
    >
      <View
        onLayout={event => setRowWidth(event.nativeEvent.layout.width)}
        style={styles.stationIdentityTopRowWithStage}
      >
        <Animated.View
          style={[
            styles.stationIdentityStage,
            {
              borderRadius: collapseProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [9, 23],
              }),
              height: collapseProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [expandedStageHeight, 46],
              }),
              width: collapseProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [expandedStageWidth, 46],
              }),
            },
          ]}
        >
          {stage ? (
            <>
              <Animated.View
                style={[
                  styles.stationIdentityStageFiller,
                  {
                    opacity: collapseProgress.interpolate({
                      inputRange: [0, 0.45],
                      outputRange: [1, 0],
                      extrapolate: 'clamp' as const,
                    }),
                  },
                ]}
              >
                {stage}
              </Animated.View>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.stationIdentityAvatarFiller,
                  {
                    opacity: collapseProgress.interpolate({
                      inputRange: [0.45, 1],
                      outputRange: [0, 1],
                      extrapolate: 'clamp' as const,
                    }),
                  },
                ]}
              >
                {renderUserAvatar({
                  text: avatarText,
                  config: avatarConfig,
                  size: 46,
                })}
              </Animated.View>
            </>
          ) : null}
          {isOnline ? (
            <Animated.View
              accessibilityLabel={textFor(
                language,
                '数字形象在线',
                'Digital avatar online',
              )}
              style={[
                styles.stationIdentityStageBadge,
                {
                  opacity: collapseProgress.interpolate({
                    inputRange: [0, 0.4],
                    outputRange: [1, 0],
                    extrapolate: 'clamp' as const,
                  }),
                },
              ]}
            >
              <Check color="#FFFFFF" size={12} strokeWidth={3.4} />
            </Animated.View>
          ) : null}
        </Animated.View>

        <View style={styles.stationIdentityCopy}>
          {detailMounted ? (
            <Animated.Text
              style={[
                styles.stationIdentityKicker,
                {
                  opacity: collapseProgress.interpolate({
                    inputRange: [0, 0.5],
                    outputRange: [1, 0],
                    extrapolate: 'clamp' as const,
                  }),
                },
              ]}
            >
              {textFor(language, '我的信息', 'My info')}
            </Animated.Text>
          ) : null}
          <Animated.Text
            numberOfLines={1}
            style={[
              styles.stationIdentityName,
              {
                color: textColor,
                fontSize: collapseProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [21, 16],
                }),
                letterSpacing: collapseProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -0.3],
                }),
              },
            ]}
          >
            {nickname}
          </Animated.Text>
          {detailMounted && idLabel ? (
            <Animated.View
              style={{
                opacity: collapseProgress.interpolate({
                  inputRange: [0, 0.5],
                  outputRange: [1, 0],
                  extrapolate: 'clamp' as const,
                }),
              }}
            >
              <Pressable
                accessibilityLabel={textFor(
                  language,
                  '复制 AI ID',
                  'Copy AI ID',
                )}
                accessibilityRole="button"
                onPress={onCopyAIID}
                style={[
                  styles.stationIdentityIdPill,
                  { backgroundColor: colors.soft },
                ]}
              >
                <Text
                  numberOfLines={1}
                  style={[
                    styles.stationIdentityId,
                    { color: secondaryTextColor },
                  ]}
                >
                  {idLabel}
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}
          {detailMounted && bio ? (
            <Animated.Text
              style={[
                styles.stationIdentityBio,
                {
                  opacity: collapseProgress.interpolate({
                    inputRange: [0, 0.5],
                    outputRange: [1, 0],
                    extrapolate: 'clamp' as const,
                  }),
                },
              ]}
            >
              {bio}
            </Animated.Text>
          ) : null}

          {detailMounted && onOpenLocation ? (
            <Animated.View
              style={{
                opacity: collapseProgress.interpolate({
                  inputRange: [0, 0.5],
                  outputRange: [1, 0],
                  extrapolate: 'clamp' as const,
                }),
              }}
            >
              <Pressable
                accessibilityLabel={textFor(
                  language,
                  '社区与活动区域',
                  'Community and activity area',
                )}
                accessibilityRole="button"
                hitSlop={6}
                onPress={onOpenLocation}
                style={styles.stationIdentityLocation}
              >
                <MapPin color={secondaryTextColor} size={14} strokeWidth={2} />
                <Text
                  numberOfLines={1}
                  style={styles.stationIdentityLocationText}
                >
                  {locationLabel ||
                    textFor(language, '设置社区与活动区域', 'Set your area')}
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}
        </View>
      </View>
    </Animated.View>
  );
}

/** Prototype `.me-switch`: two equal segments, nothing else in the trough. */
export function StationTabs({
  palette,
  language,
  value,
  onChange,
}: {
  palette: Palette;
  language: Language;
  value: StationTab;
  onChange: (tab: StationTab) => void;
}) {
  const colors = resolveStationColors(palette);
  const textColor = colors.text;
  const tabs: { label: string; value: StationTab }[] = [
    { label: textFor(language, '动态', 'Posts'), value: 'posts' },
    { label: textFor(language, '我的 Agent', 'My Agents'), value: 'agents' },
  ];

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.stationSwitch,
        { backgroundColor: colors.soft, borderColor: colors.border },
      ]}
    >
      {tabs.map(item => {
        const isSelected = item.value === value;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            key={item.value}
            onPress={() => onChange(item.value)}
            style={({ pressed }) => [
              styles.stationSwitchButton,
              isSelected && [
                styles.stationSwitchButtonSelected,
                { backgroundColor: colors.surface },
              ],
              // Prototype `.me-switch-button:active { transform: scale(.97) }`.
              pressed && styles.stationSwitchButtonPressed,
            ]}
            testID={`station-tab-${item.value}`}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.stationSwitchText,
                { color: isSelected ? textColor : colors.secondaryText },
              ]}
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Prototype shows `ID · MIAO_0001`; use the real account AI ID, never a fake one. */
export function aiIdLabel(aiId: string) {
  const value = aiId.trim();
  if (!value || value === '--') return '';
  return `ID · ${value}`;
}
