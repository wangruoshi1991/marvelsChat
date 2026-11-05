import { Check, MapPin } from 'lucide-react-native';
import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
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

/**
 * The profile card follows the station scroll position over this distance.
 * Keeping the range explicit makes the gesture work even when the selected
 * panel has no records: the scroll container reserves enough empty space for
 * the same header gesture instead of depending on panel content height.
 */
export const STATION_COLLAPSE_SCROLL_DISTANCE = 72;
export const STATION_EXPAND_SCROLL_DISTANCE = 16;

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
  identityTags = [],
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
  /** Tags derived from saved profile fields; absent data stays empty. */
  identityTags?: string[];
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

  // Keep the detail rows mounted for reverse gestures, but stop exposing
  // their controls as soon as the scroll-driven fade makes them invisible.
  const detailsHiddenRef = useRef(collapsed);
  const [detailsHidden, setDetailsHidden] = useState(collapsed);
  useEffect(() => {
    const listener = collapseProgress.addListener(({ value }) => {
      const nextHidden = value >= 0.5;
      if (detailsHiddenRef.current === nextHidden) return;
      detailsHiddenRef.current = nextHidden;
      setDetailsHidden(nextHidden);
    });
    return () => collapseProgress.removeListener(listener);
  }, [collapseProgress]);

  return (
    <Animated.View
      style={[
        styles.stationIdentityCard,
        {
          // V6 keeps the profile header on the page canvas. The existing
          // measured card and collapse geometry stay intact; only the large
          // legacy surface is removed so the page matches the prototype.
          backgroundColor: colors.isV6 ? colors.background : colors.surface,
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
        testID="station-profile-main-row"
      >
        <Animated.View
          style={[
            styles.stationIdentityStage,
            colors.isV6 && { backgroundColor: colors.soft },
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
                accessibilityElementsHidden={detailsHidden}
                importantForAccessibility={
                  detailsHidden ? 'no-hide-descendants' : 'auto'
                }
                pointerEvents={detailsHidden ? 'none' : 'auto'}
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
                colors.isV6 && {
                  backgroundColor: colors.accent,
                  borderColor: colors.surface,
                },
                {
                  opacity: collapseProgress.interpolate({
                    inputRange: [0, 0.4],
                    outputRange: [1, 0],
                    extrapolate: 'clamp' as const,
                  }),
                },
              ]}
            >
              <Check
                color={colors.isV6 ? colors.background : '#FFFFFF'}
                size={12}
                strokeWidth={3.4}
              />
            </Animated.View>
          ) : null}
        </Animated.View>

        <View style={styles.stationIdentityCopy} testID="station-profile-copy">
          <StationProfileDetailGroup
            collapseProgress={collapseProgress}
            hidden={detailsHidden}
            rootTestID="station-profile-kicker"
          >
            <Text
              style={[
                styles.stationIdentityKicker,
                colors.isV6 && { color: colors.accent },
              ]}
            >
              {textFor(language, '我的信息', 'My info')}
            </Text>
          </StationProfileDetailGroup>
          <Animated.Text
            numberOfLines={1}
            testID="station-profile-name"
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
          <StationProfileDetailGroup
            collapseProgress={collapseProgress}
            hidden={detailsHidden}
            rootTestID="station-profile-details"
          >
            {idLabel ? (
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
            ) : null}
            {bio ? (
              <Text
                style={[
                  styles.stationIdentityBio,
                  colors.isV6 && { color: secondaryTextColor },
                ]}
              >
                {bio}
              </Text>
            ) : null}

            {identityTags.length ? (
              <View
                accessibilityLabel={textFor(
                  language,
                  '已选标签',
                  'Selected tags',
                )}
                style={styles.stationIdentityTags}
                testID="station-profile-tags"
              >
                {identityTags.map(tag => (
                  <View
                    key={tag}
                    style={[
                      styles.stationIdentityTag,
                      {
                        backgroundColor: colors.soft,
                        borderColor: colors.border,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stationIdentityTagText,
                        { color: secondaryTextColor },
                      ]}
                    >
                      {tag}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            {onOpenLocation ? (
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
                  style={[
                    styles.stationIdentityLocationText,
                    colors.isV6 && { color: secondaryTextColor },
                  ]}
                >
                  {locationLabel ||
                    textFor(language, '设置社区与活动区域', 'Set your area')}
                </Text>
              </Pressable>
            ) : null}
          </StationProfileDetailGroup>
        </View>
      </View>
    </Animated.View>
  );
}

function StationProfileDetailGroup({
  children,
  collapseProgress,
  hidden,
  rootTestID,
}: {
  children: React.ReactNode;
  collapseProgress: Animated.Value;
  hidden: boolean;
  rootTestID: string;
}) {
  const [contentHeight, setContentHeight] = useState<number | null>(null);

  return (
    <Animated.View
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      pointerEvents={hidden ? 'none' : 'auto'}
      style={[
        profileDetailStyles.clip,
        {
          height:
            contentHeight === null
              ? undefined
              : collapseProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [contentHeight, 0],
                  extrapolate: 'clamp',
                }),
          opacity: collapseProgress.interpolate({
            inputRange: [0, 0.5],
            outputRange: [1, 0],
            extrapolate: 'clamp',
          }),
        },
      ]}
      testID={rootTestID}
    >
      <View
        collapsable={false}
        onLayout={event => {
          const height = event.nativeEvent.layout.height;
          // A clipped native layout can briefly report zero. Both groups have
          // permanent content, so zero is not their natural height and must not
          // lock the expanded group closed.
          if (Number.isFinite(height) && height > 0) setContentHeight(height);
        }}
        style={[
          profileDetailStyles.content,
          contentHeight !== null && profileDetailStyles.measuredContent,
        ]}
        testID={`${rootTestID}-content`}
      >
        {children}
      </View>
    </Animated.View>
  );
}

const profileDetailStyles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  // The first natural layout sizes the clip. After that, detach the content
  // from its animated height so clipping cannot feed a smaller measurement
  // back into the expanded height. Width stays tied to the right column for
  // real text reflow, including while the group is collapsed.
  content: { flexShrink: 0 },
  measuredContent: { left: 0, position: 'absolute', right: 0, top: 0 },
});

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
        colors.isV6 && styles.stationSwitchV6,
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
                colors.isV6 && styles.stationSwitchButtonSelectedV6,
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
