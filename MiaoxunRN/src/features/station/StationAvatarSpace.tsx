import React, { useMemo, useRef } from 'react';
import {
  PanResponder,
  Pressable,
  StyleProp,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import { textFor } from '../../shared/i18n';
import { styles } from '../../shared/styles';
import { Palette, palettes } from '../../shared/theme';
import { MiaoShowAvatar } from '../avatar/AvatarViews';
import {
  avatarAccentColors,
  normalizeAvatarConfig,
} from '../avatar/avatarConfig';
import { Language, useMiaoxunSession } from '../session/useMiaoxunSession';

const normalizeDegrees = (value: number) => ((value % 360) + 360) % 360;

export function StationAvatarSpace({
  palette,
  language,
  profile,
  onOpenAgents,
  onOpenCallable,
  onOpenDiary,
  onOpenOotd,
  rotation = 0,
  onRotate,
}: {
  palette: Palette;
  language: Language;
  profile: ReturnType<typeof useMiaoxunSession>['profile'];
  onOpenAgents?: () => void;
  onOpenCallable?: () => void;
  onOpenDiary?: () => void;
  onOpenOotd?: () => void;
  rotation?: number;
  onRotate?: (nextRotation: number) => void;
}) {
  const isDarkPalette = palette.text === palettes.dark.text;
  const avatarConfig = useMemo(
    () => normalizeAvatarConfig(profile.avatarConfig),
    [profile.avatarConfig],
  );
  const accentColors = avatarAccentColors[avatarConfig.accent];
  const stageBackgroundColor = isDarkPalette ? '#f5f6fa' : '#f7f8fc';
  const startAvatarRotationRef = useRef(rotation);
  const avatarStagePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => false,
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Boolean(onRotate) &&
          Math.abs(gesture.dx) > 6 &&
          Math.abs(gesture.dx) >= Math.abs(gesture.dy) * 1.2,
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          Boolean(onRotate) &&
          Math.abs(gesture.dx) > 6 &&
          Math.abs(gesture.dx) >= Math.abs(gesture.dy) * 1.2,
        onPanResponderGrant: () => {
          startAvatarRotationRef.current = rotation;
        },
        onPanResponderMove: (_event, gesture) => {
          onRotate?.(
            normalizeDegrees(startAvatarRotationRef.current + gesture.dx * 0.8),
          );
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [onRotate, rotation],
  );
  const floatingTags = [
    { label: textFor(language, '今日穿搭', 'OOTD'), onPress: onOpenOotd },
    {
      label: textFor(language, '漫画日记', 'Comic diary'),
      onPress: onOpenDiary,
    },
    {
      label: textFor(language, 'AI伙伴', 'AI partners'),
      onPress: onOpenAgents,
    },
    {
      label: textFor(language, '可被调用', 'Callable'),
      onPress: onOpenCallable,
    },
  ];
  const floatingTagPositions = [
    styles.avatarFloatingTag_0,
    styles.avatarFloatingTag_1,
    styles.avatarFloatingTag_2,
    styles.avatarFloatingTag_3,
  ];

  return (
    <View
      style={[
        styles.avatarSpace,
        {
          backgroundColor: palette.surface,
          borderColor: palette.border,
          shadowColor: palette.shadow,
        },
      ]}
    >
      <View
        style={[styles.avatarStagePressable, styles.avatarStageStation]}
        accessibilityLabel={textFor(
          language,
          '滑动旋转我的模样',
          'Swipe to rotate my look',
        )}
      >
        <View
          style={[
            styles.avatarStage,
            styles.avatarStageStation,
            { backgroundColor: stageBackgroundColor },
          ]}
        >
          <View
            style={[
              styles.avatarStageHorizon,
              styles.avatarStageHorizonStation,
            ]}
          />
          <View
            style={[
              styles.avatarStagePanel,
              { borderColor: `${accentColors.primary}44` },
            ]}
          />
          <View style={styles.avatarFloatingTags}>
            {floatingTags.map((item, index) => (
              <FloatingTag
                key={item.label}
                label={item.label}
                onPress={item.onPress}
                positionStyle={floatingTagPositions[index]}
                active={index === 3}
                palette={palette}
              />
            ))}
          </View>
          <View style={styles.stationSvgAvatarWrap}>
            <MiaoShowAvatar
              config={avatarConfig}
              rotation={rotation}
              size={190}
              previewMode="full"
            />
          </View>
          {onRotate ? (
            <View
              {...avatarStagePanResponder.panHandlers}
              style={styles.avatarStageRotationOverlay}
              accessibilityLabel={textFor(
                language,
                '滑动旋转我的模样',
                'Swipe to rotate my look',
              )}
            />
          ) : null}
        </View>
      </View>
      <View style={styles.avatarSpaceCopy}>
        <View style={styles.avatarSpaceTitleRow}>
          <View style={styles.avatarSpaceTitleCopy}>
            <Text style={[styles.avatarSpaceEyebrow, { color: palette.sun }]}>
              {textFor(language, '拖拽换视角', 'Drag to change view')}
            </Text>
            <Text style={[styles.avatarSpaceTitle, { color: palette.text }]}>
              {textFor(language, '我的模样', 'My Look')}
            </Text>
          </View>
        </View>
        <Text
          style={[styles.avatarSpaceBody, { color: palette.secondaryText }]}
        >
          {textFor(
            language,
            '用卡通形象呈现我的穿搭、状态和可被调用的个人能力。',
            'Show my outfit, status, and callable personal capabilities with a cartoon avatar.',
          )}
        </Text>
        <Pressable
          onPress={onOpenOotd}
          style={[styles.avatarOotdButton, { backgroundColor: palette.text }]}
        >
          <Text
            style={[styles.avatarOotdButtonText, { color: palette.background }]}
          >
            {textFor(language, '我今天的 OOTD', "Today's OOTD")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function FloatingTag({
  label,
  onPress,
  positionStyle,
  active,
  palette,
}: {
  label: string;
  onPress?: () => void;
  positionStyle: StyleProp<ViewStyle>;
  active: boolean;
  palette: Palette;
}) {
  const backgroundColor = active ? palette.rose : palette.surface;
  const textColor = active ? palette.background : palette.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.avatarFloatingTag,
        positionStyle,
        active ? styles.avatarFloatingTagCallable : null,
        { backgroundColor, shadowColor: palette.shadow },
      ]}
    >
      <Text style={[styles.avatarFloatingTagText, { color: textColor }]}>
        {label}
      </Text>
    </Pressable>
  );
}
